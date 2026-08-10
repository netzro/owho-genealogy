# owho-genealogy

Owho family genealogy tree — a JAMstack app: React SPA on GitHub Pages + Supabase
(Postgres, Auth magic-link, Storage) backend.

## Stack
- **Client:** Vite + React static SPA (deployed to GitHub Pages via Actions)
- **Server:** Supabase — Postgres schema + RLS (invite-only access for family)
- **Deploy:** GitHub Actions → Pages (native Actions integration)

## Local dev
```bash
npm install
cp .env.example .env   # fill in Supabase URL + anon key
npm run dev
```

## Structure
- `src/` — React app (person list/tree, add/edit person, relationship links)
- `.github/workflows/pages.yml` — build + Pages deploy on push to `main`
- `.env.example` — Supabase env placeholders (real `.env` is gitignored)

Live at https://netzro.github.io/owho-genealogy/