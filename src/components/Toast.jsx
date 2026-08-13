import { useEffect, useState } from 'react'

// Fixed top-center overlay toast. Auto-dismisses after 3.5s; manual × to
// dismiss early. Parent owns the message state (all existing setMsg calls
// stay as-is) and passes onDismiss to clear it.
export default function Toast({ message, onDismiss }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!message) { setVisible(false); return }
    setVisible(true)
    const t = setTimeout(() => onDismiss(), 3500)
    return () => clearTimeout(t)
  }, [message, onDismiss])

  if (!message) return null

  return (
    <div className={`toast-fixed ${visible ? 'show' : ''}`} role="status">
      <span>{message}</span>
      <button className="toast-x" aria-label="Dismiss" onClick={() => onDismiss()}>×</button>
    </div>
  )
}
