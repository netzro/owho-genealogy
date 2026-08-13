import { useState } from 'react'

export default function CollapsibleSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="collapsible card">
      <button type="button" className="collapsible-head" aria-expanded={open}
              onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <span className="chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </section>
  )
}
