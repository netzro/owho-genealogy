export default function SummaryBar({ people, rels }) {
  const total = people.length
  const links = rels.length
  const generations = computeGenerations(people, rels)
  const years = people
    .map((p) => p.birth_date)
    .filter(Boolean)
    .map((d) => parseInt(String(d).slice(0, 4), 10))
    .filter((n) => !Number.isNaN(n))
  const earliest = years.length ? Math.min(...years) : null

  return (
    <div className="summary-bar card">
      <Stat label="People" value={total} />
      <Stat label="Relationships" value={links} />
      <Stat label="Generations" value={generations} />
      <Stat label="Earliest birth" value={earliest ?? '—'} />
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

// BFS generation depth: roots (no parent) = depth 0, walk parentOf() per
// level. Returns the count of distinct depth values present.
function computeGenerations(people, rels) {
  const parentOf = (pid) =>
    rels
      .filter((r) =>
        (r.relationship_type === 'parent' && r.person_id === pid) ||
        (r.relationship_type === 'child' && r.related_person_id === pid))
      .map((r) => (r.relationship_type === 'parent' ? r.related_person_id : r.person_id))

  const isChild = (pid) =>
    rels.some((r) =>
      (r.relationship_type === 'parent' && r.related_person_id === pid) ||
      (r.relationship_type === 'child' && r.person_id === pid))

  const roots = people.filter((p) => !isChild(p.id))
  if (!roots.length) return 0

  const depth = new Map()
  const queue = []
  roots.forEach((r) => { depth.set(r.id, 0); queue.push(r.id) })
  while (queue.length) {
    const pid = queue.shift()
    const d = depth.get(pid)
    for (const kid of parentOf(pid)) {
      if (!depth.has(kid) || depth.get(kid) < d + 1) {
        depth.set(kid, d + 1)
        queue.push(kid)
      }
    }
  }
  return new Set(depth.values()).size
}
