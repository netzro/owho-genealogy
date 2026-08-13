import { useEffect } from 'react'

export default function PersonActionSheet({ person, onEdit, onDelete, onClose }) {
  useEffect(() => {
    if (!person) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [person, onClose])

  if (!person) return null
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="action-sheet" role="dialog" aria-modal="true"
           aria-label={`Actions for ${person.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-title">{person.name}</div>
        <button type="button" className="sheet-btn" onClick={() => onEdit(person)}>Edit</button>
        <button type="button" className="sheet-btn danger" onClick={() => onDelete(person)}>Delete</button>
        <button type="button" className="sheet-btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
