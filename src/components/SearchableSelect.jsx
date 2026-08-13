import { useState, useRef, useEffect } from 'react'

export default function SearchableSelect({ people, excludeId, value, onChange, placeholder }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const wrapRef = useRef(null)

  const filtered = people
    .filter((pp) => pp.id !== excludeId)
    .filter((pp) => pp.name.toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const selected = people.find((pp) => pp.id === value)

  function choose(pp) {
    onChange(pp.id)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="combo" ref={wrapRef}>
      <input
        className="combo-input"
        value={open ? query : (selected ? selected.name : '')}
        placeholder={placeholder}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange('') }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter' && active >= 0 && filtered[active]) { e.preventDefault(); choose(filtered[active]) }
          else if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && (
        <ul className="combo-list" role="listbox">
          {filtered.length === 0 && <li className="combo-empty">No matches</li>}
          {filtered.map((pp, i) => (
            <li
              key={pp.id}
              role="option"
              aria-selected={pp.id === value}
              className={i === active ? 'combo-opt active' : 'combo-opt'}
              onMouseDown={(e) => { e.preventDefault(); choose(pp) }}
              onMouseEnter={() => setActive(i)}
            >{pp.name}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
