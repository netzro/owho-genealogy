import { useCallback, useEffect, useRef, useState } from 'react'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { supabase } from '../lib/supabase'
import PersonActionSheet from './PersonActionSheet'
import ConfirmDialog from './ConfirmDialog'
import SearchableSelect from './SearchableSelect'
import CollapsibleSection from './CollapsibleSection'
import SummaryBar from './SummaryBar'
import Toast from './Toast'

const REL_LABELS = { parent: 'parent of', spouse: 'spouse of', sibling: 'sibling of', child: 'child of', aunt: 'aunt of', uncle: 'uncle of' }

const EMPTY_FORM = { name: '', birth_date: '', death_date: '', notes: '', photo: null }

const MAX_DEPTH = 10

export default function Tree({ user }) {
  const [people, setPeople] = useState([])
  const [rels, setRels] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [link, setLink] = useState({ person_id: '', relationship_type: 'parent', related_person_id: '' })
  const [photoUrls, setPhotoUrls] = useState({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionSheetFor, setActionSheetFor] = useState(null)
  const [confirmFor, setConfirmFor] = useState(null)
  const [showAllLinks, setShowAllLinks] = useState(false)

  const load = useCallback(async () => {
    const { data: p } = await supabase.from('people').select('*').order('name')
    const { data: r } = await supabase.from('relationships').select('*')
    setPeople(p || [])
    setRels(r || [])
  }, [])

  // signed URLs for any person with a photo (private bucket)
  const fetchedPhotoKeys = useRef(new Set())
  useEffect(() => {
    const missing = people.filter(
      (pp) => pp.photo_url && !fetchedPhotoKeys.current.has(`${pp.id}:${pp.photo_url}`)
    )
    if (!missing.length) return
    missing.forEach((pp) => fetchedPhotoKeys.current.add(`${pp.id}:${pp.photo_url}`))
    let cancelled = false
    ;(async () => {
      const entries = await Promise.all(
        missing.map(async (pp) => {
          const { data, error } = await supabase.storage
            .from('photos')
            .createSignedUrl(pp.photo_url, 3600)
          if (error) console.error('signed url failed for', pp.id, error.message)
          return [pp.id, data?.signedUrl]
        })
      )
      if (cancelled) return
      setPhotoUrls((prev) => {
        const next = { ...prev }
        for (const [id, url] of entries) if (url) next[id] = url
        return next
      })
    })()
    return () => { cancelled = true }
  }, [people])

  useEffect(() => { load() }, [load])

  async function handleSave(e) {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    let photo_url = editingId ? people.find((pp) => pp.id === editingId)?.photo_url : null
    if (form.photo) {
      const path = `${user.id}/${Date.now()}-${form.photo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('photos').upload(path, form.photo)
      if (upErr) { setMsg(`upload failed: ${upErr.message}`); setBusy(false); return }
      photo_url = path
    }
    const payload = {
      name: form.name.trim(),
      birth_date: form.birth_date || null,
      death_date: form.death_date || null,
      notes: form.notes.trim() || null,
      photo_url,
    }
    const { error } = editingId
      ? await supabase.from('people').update(payload).eq('id', editingId)
      : await supabase.from('people').insert(payload)
    setBusy(false)
    if (error) { setMsg(error.message); return }
    setForm(EMPTY_FORM)
    setEditingId(null)
    setMsg(editingId ? 'Saved.' : 'Added.')
    await load()
  }

  function startEdit(pp) {
    setEditingId(pp.id)
    setForm({
      name: pp.name || '',
      birth_date: pp.birth_date || '',
      death_date: pp.death_date || '',
      notes: pp.notes || '',
      photo: null,
    })
  }

  function requestDelete(pp) {
    setActionSheetFor(null)
    setConfirmFor(pp)
  }
  async function doDelete() {
    const pp = confirmFor
    setConfirmFor(null)
    if (!pp) return
    const { error } = await supabase.from('people').delete().eq('id', pp.id)
    if (error) { setMsg(error.message); return }
    await load()
  }

  async function handleLink(e) {
    e.preventDefault()
    if (!link.person_id || !link.related_person_id) { setMsg('Pick both people.'); return }
    const { error } = await supabase.from('relationships').insert(link)
    if (error) { setMsg(error.message); return }
    setLink({ person_id: '', relationship_type: 'parent', related_person_id: '' })
    setMsg('Linked.')
    await load()
  }

  async function handleUnlink(r) {
    const { error } = await supabase.from('relationships').delete().eq('id', r.id)
    if (error) { setMsg(error.message); return }
    await load()
  }

  const nameOf = (id) => people.find((pp) => pp.id === id)?.name || '?'

  // ---- tree derivation (read-only over current data) ----
  // parent edge: person_id is parent of related_person_id (from 'parent' row)
  //              related_person_id is parent of person_id (from 'child' row)
  const parentOf = (pid) =>
    rels.filter((r) =>
      (r.relationship_type === 'parent' && r.person_id === pid) ||
      (r.relationship_type === 'child' && r.related_person_id === pid)
    ).map((r) => (r.relationship_type === 'parent' ? r.related_person_id : r.person_id))

  const spousesOf = (pid) =>
    rels.filter((r) => r.relationship_type === 'spouse' &&
      (r.person_id === pid || r.related_person_id === pid)
    ).map((r) => (r.person_id === pid ? r.related_person_id : r.person_id))

  const isAnyoneChild = (pid) => rels.some((r) =>
    (r.relationship_type === 'parent' && r.related_person_id === pid) ||
    (r.relationship_type === 'child' && r.person_id === pid)
  )

  // Roots = people with no recorded parent, deduped by spouse cluster so a
  // married couple becomes ONE root node instead of two roots each
  // re-walking the whole shared subtree.
  const roots = (() => {
    const seen = new Set()
    const out = []
    for (const pp of people) {
      if (isAnyoneChild(pp.id) || seen.has(pp.id)) continue
      out.push(pp)
      seen.add(pp.id)
      spousesOf(pp.id).forEach((sid) => seen.add(sid))
    }
    return out
  })()

  function PersonCard({ pp }) {
    const firstName = (pp.name || '?').split(/\s+/)[0]
    return (
      <article className="card person tree-person" role="button" tabIndex={0}
        onClick={() => setActionSheetFor(pp)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActionSheetFor(pp) } }}>
        {photoUrls[pp.id]
          ? <img src={photoUrls[pp.id]} alt={pp.name} className="avatar" />
          : <div className="avatar placeholder">{pp.name[0]?.toUpperCase()}</div>}
        <h3>{firstName}</h3>
      </article>
    )
  }

  function TreeNode({ pid, depth }) {
    const pp = people.find((x) => x.id === pid)
    if (!pp) return null
    if (depth >= MAX_DEPTH) return <li className="muted tree-trunc">… (cycle guard)</li>
    const spouses = spousesOf(pid)
    // Gather kids from either spouse's parent rows; dedupe.
    const kids = [...new Set([
      ...parentOf(pid),
      ...spouses.flatMap((sid) => parentOf(sid)),
    ])]
    return (
      <li>
        <div className="tree-couple">
          <PersonCard pp={pp} />
          {spouses.map((sid) => {
            const sp = people.find((x) => x.id === sid)
            return sp ? <PersonCard key={sid} pp={sp} /> : null
          })}
        </div>
        {kids.length > 0 && (
          <ul>
            {kids.map((kid) => <TreeNode key={kid} pid={kid} depth={depth + 1} />)}
          </ul>
        )}
      </li>
    )
  }

  return (
    <div className="wrap">
      <header>
        <h1>Owho Family Tree</h1>
        <span className="muted">{user.email}</span>
        <button className="ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>

      <SummaryBar people={people} rels={rels} />

      <Toast message={msg} onDismiss={() => setMsg('')} />

      <section className="people-tree">
        <h2>Family tree</h2>
        {roots.length > 0
          ? <TransformWrapper minScale={0.5} maxScale={2.5} initialScale={1} doubleClick={{ disabled: true }}>
              {({ zoomIn, zoomOut, resetTransform }) => (
                <>
                  <div className="tree-zoom-controls">
                    <button className="ghost tiny" onClick={() => zoomIn()} aria-label="Zoom in">+</button>
                    <button className="ghost tiny" onClick={() => zoomOut()} aria-label="Zoom out">−</button>
                    <button className="ghost tiny" onClick={() => resetTransform()}>reset</button>
                  </div>
                  <TransformComponent
                    wrapperClass="tree-scroll"
                    wrapperStyle={{ width: '100%', overflow: 'hidden', position: 'relative' }}
                    contentClass="tree-zoom-content">
                    <ul className="tree">
                      {roots.map((pp) => <TreeNode key={pp.id} pid={pp.id} depth={0} />)}
                    </ul>
                  </TransformComponent>
                </>
              )}
            </TransformWrapper>
          : <p className="muted">{people.length ? 'No roots found — link someone as a child to build the tree.' : 'No people yet — add the first family member above.'}</p>}
      </section>

      <h2 className="manage-head">Manage family</h2>
      <section className="manage">
        <CollapsibleSection title={editingId ? 'Edit person' : 'Add a person'} defaultOpen={false}>
          <form onSubmit={handleSave} className="stack">
            <input placeholder="Full name *" value={form.name} required
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="row">
              <label>Born <input type="date" value={form.birth_date}
                onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></label>
              <label>Died <input type="date" value={form.death_date}
                onChange={(e) => setForm({ ...form, death_date: e.target.value })} /></label>
            </div>
            <textarea placeholder="Notes (optional)" rows="2" value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <label className="file">
              Photo
              <input type="file" accept="image/*" onChange={(e) =>
                setForm({ ...form, photo: e.target.files[0] || null })} />
            </label>
            {editingId && <button type="button" className="ghost" onClick={() => {
              setEditingId(null); setForm(EMPTY_FORM)
            }}>Cancel edit</button>}
            <button type="submit" disabled={busy}>{busy ? 'Working…' : editingId ? 'Save changes' : 'Add person'}</button>
          </form>
        </CollapsibleSection>

        <CollapsibleSection title="Link relatives" defaultOpen={false}>
          <form onSubmit={handleLink} className="stack">
            <SearchableSelect
              people={people}
              excludeId={link.related_person_id}
              value={link.person_id}
              onChange={(id) => setLink({ ...link, person_id: id })}
              placeholder="— person —"
            />
            <select value={link.relationship_type} onChange={(e) => setLink({ ...link, relationship_type: e.target.value })}>
              {Object.entries(REL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <SearchableSelect
              people={people}
              excludeId={link.person_id}
              value={link.related_person_id}
              onChange={(id) => setLink({ ...link, related_person_id: id })}
              placeholder="— related person —"
            />
            <button type="submit">Link them</button>
          </form>

          <h3>Existing links</h3>
          <ul className="links">
            {(showAllLinks ? rels : rels.slice(0, 5)).map((r) =>
              <li key={r.id}>
                <strong>{nameOf(r.person_id)}</strong> {REL_LABELS[r.relationship_type]}{' '}
                <strong>{nameOf(r.related_person_id)}</strong>
                <button className="ghost tiny" onClick={() => handleUnlink(r)}>✕</button>
              </li>)}
            {!rels.length && <li className="muted">No relationships yet.</li>}
            {rels.length > 5 && !showAllLinks && (
              <li><button type="button" className="linklike" onClick={() => setShowAllLinks(true)}>
                Show all ({rels.length})
              </button></li>
            )}
          </ul>
        </CollapsibleSection>
      </section>

      <PersonActionSheet
        person={actionSheetFor}
        onEdit={(pp) => { startEdit(pp); setActionSheetFor(null) }}
        onDelete={(pp) => requestDelete(pp)}
        onClose={() => setActionSheetFor(null)}
      />

      <ConfirmDialog
        open={!!confirmFor}
        message={confirmFor ? `Delete ${confirmFor.name}? Relationships attached will go too.` : ''}
        confirmLabel="Delete"
        onConfirm={doDelete}
        onCancel={() => setConfirmFor(null)}
      />
    </div>
  )
}
