import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          window.location.origin + window.location.pathname,
      },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  if (sent) {
    return (
      <div className="card center" style={{ maxWidth: '26rem' }}>
        <h1>Check your inbox</h1>
        <p>
          A magic link has been sent to <strong>{email}</strong>. Click it to
          sign in (only for invited family members).
        </p>
        <button onClick={() => setSent(false)}>Back</button>
      </div>
    )
  }

  return (
    <div className="card center" style={{ maxWidth: '26rem' }}>
      <h1>Owho Family Tree</h1>
      <p className="muted">Sign in with your email — an invite link will be sent.</p>
      <form onSubmit={handleSubmit} className="stack">
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Send magic link'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  )
}