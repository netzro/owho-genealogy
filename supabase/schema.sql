-- owho-genealogy schema v1 — family genealogy (JAMstack: Pages SPA + Supabase)
-- Applies: relationship enum, people/relationships tables, invite-only
-- allowlist + profiles, RLS policies, photos storage bucket.
-- Convention: diff-before-apply; this file is the source of truth.

-- 1) Relationship type enum
create type relationship_type as enum ('parent', 'spouse', 'sibling', 'child', 'aunt', 'uncle');

-- 2) Core tables
create table public.people (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  birth_date  date,
  death_date  date,
  notes       text,
  photo_url   text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.relationships (
  id                  uuid primary key default gen_random_uuid(),
  person_id           uuid not null references public.people(id) on delete cascade,
  related_person_id   uuid not null references public.people(id) on delete cascade,
  relationship_type   relationship_type not null,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  constraint no_self_relationship check (person_id <> related_person_id)
);

-- 3) Invite-only allowlist + profiles (auth.users trigger)
create table public.allowed_emails (
  email      text primary key,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null unique,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

-- Auto-create profile on signup; REJECT emails not on the allowlist.
-- security definer: profile insert must bypass RLS (we own the flow).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare a public.allowed_emails%rowtype;
begin
  select * into a from public.allowed_emails where email = new.email;
  if not found then
    raise exception 'email not allowed: %', new.email;
  end if;
  insert into public.profiles (id, email, is_admin)
    values (new.id, new.email, a.is_admin);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-stamp created_by from the session (keeps clients honest)
create or replace function public.set_created_by()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.created_by := auth.uid();
  return new;
end $$;

create trigger people_created_by
  before insert on public.people
  for each row execute function public.set_created_by();
create trigger relationships_created_by
  before insert on public.relationships
  for each row execute function public.set_created_by();

-- 4) RLS
alter table public.people        enable row level security;
alter table public.relationships enable row level security;
alter table public.profiles      enable row level security;
alter table public.allowed_emails enable row level security;

-- profiles: users see/update their own row only
create policy profiles_select on public.profiles
  for select using (auth.uid() = id);
create policy profiles_update on public.profiles
  for update using (auth.uid() = id);

-- allowed_emails: NO client policies -> deny all (service-role / SQL manages)

-- people: any authenticated (allowlisted) family member reads all;
-- writes by owner (created_by) or admin override.
create policy people_select on public.people
  for select to authenticated using (true);
create policy people_insert on public.people
  for insert to authenticated
  with check (created_by = auth.uid());
create policy people_update on public.people
  for update to authenticated
  using (created_by = auth.uid()
         or exists (select 1 from public.profiles p
                    where p.id = auth.uid() and p.is_admin));
create policy people_delete on public.people
  for delete to authenticated
  using (created_by = auth.uid()
         or exists (select 1 from public.profiles p
                    where p.id = auth.uid() and p.is_admin));

-- relationships: same ownership/admin model
create policy relationships_select on public.relationships
  for select to authenticated using (true);
create policy relationships_insert on public.relationships
  for insert to authenticated
  with check (created_by = auth.uid());
create policy relationships_update on public.relationships
  for update to authenticated
  using (created_by = auth.uid()
         or exists (select 1 from public.profiles p
                    where p.id = auth.uid() and p.is_admin));
create policy relationships_delete on public.relationships
  for delete to authenticated
  using (created_by = auth.uid()
         or exists (select 1 from public.profiles p
                    where p.id = auth.uid() and p.is_admin));

-- 5) Storage: photos bucket (private by default; family reads via RLS)
insert into storage.buckets (id, name, public)
  values ('photos', 'photos', false)
  on conflict (id) do nothing;

create policy photos_select on storage.objects
  for select to authenticated using (bucket_id = 'photos');
create policy photos_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'photos');
create policy photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'photos'
         and (owner_id::uuid = auth.uid()   -- owner_id is text; cast before compare
              or exists (select 1 from public.profiles p
                         where p.id = auth.uid() and p.is_admin)));
create policy photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos'
         and (owner_id::uuid = auth.uid()
              or exists (select 1 from public.profiles p
                         where p.id = auth.uid() and p.is_admin)));