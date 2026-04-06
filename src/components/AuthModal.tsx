import { useEffect, useId, useRef, useState } from 'react'
import { signUp, signIn, type AuthUser } from '../lib/supabase'

type Props = {
  open: boolean
  onClose: () => void
  onAuth: (user: AuthUser) => void
}

export function AuthModal({ open, onClose, onAuth }: Props) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [tab, setTab] = useState<'signup' | 'signin'>('signup')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmationSent, setConfirmationSent] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setConfirmationSent(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (tab === 'signup') {
      if (!username.trim() || !email.trim() || !password) {
        setError('Preencha todos os campos.')
        setLoading(false)
        return
      }
      const result = await signUp(email.trim(), password, username.trim())
      if (result.error) {
        setError(result.error)
      } else if (result.needsConfirmation) {
        setConfirmationSent(true)
      } else if (result.user) {
        onAuth(result.user)
        onClose()
      }
    } else {
      if (!email.trim() || !password) {
        setError('Preencha todos os campos.')
        setLoading(false)
        return
      }
      const result = await signIn(email.trim(), password)
      if (result.error) {
        setError(result.error)
      } else if (result.user) {
        onAuth(result.user)
        onClose()
      }
    }
    setLoading(false)
  }

  if (confirmationSent) {
    return (
      <div
        className="modal-backdrop"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div
          className="modal-panel"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2 className="modal-title">Confirme seu e-mail</h2>
            <button
              ref={closeRef}
              type="button"
              className="modal-close"
              onClick={onClose}
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
          <div className="modal-body" style={{ textAlign: 'center' }}>
            <p style={{ marginBottom: 12 }}>
              Enviamos um link de confirmação para <strong>{email}</strong>.
            </p>
            <p className="modal-muted">
              Confirme o e-mail e depois clique em <strong>Entrar</strong> com suas credenciais.
            </p>
            <button
              type="button"
              className="btn-primary"
              style={{ marginTop: 16, padding: '8px 24px' }}
              onClick={() => {
                setConfirmationSent(false)
                setTab('signin')
              }}
            >
              Ir para Entrar
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id={titleId} className="modal-title">
            {tab === 'signup' ? 'Criar conta' : 'Entrar'}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab${tab === 'signup' ? ' auth-tab--active' : ''}`}
              onClick={() => {
                setTab('signup')
                setError(null)
              }}
            >
              Criar conta
            </button>
            <button
              type="button"
              className={`auth-tab${tab === 'signin' ? ' auth-tab--active' : ''}`}
              onClick={() => {
                setTab('signin')
                setError(null)
              }}
            >
              Entrar
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {tab === 'signup' && (
              <input
                type="text"
                className="auth-input"
                placeholder="Nome de jogador"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={30}
                disabled={loading}
                autoComplete="username"
              />
            )}
            <input
              type="email"
              className="auth-input"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              autoComplete="email"
            />
            <input
              type="password"
              className="auth-input"
              placeholder="Senha (min. 6 caracteres)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              minLength={6}
              autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
            />
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" className="btn-primary auth-submit" disabled={loading}>
              {loading ? 'Aguarde…' : tab === 'signup' ? 'Criar conta' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
