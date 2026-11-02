import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiRequestError, describeError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ThemeToggle } from '../components/ThemeToggle'

const REPO_URL = 'https://github.com/softDevShishir/ai-chatbot-ui'

/** Login-specific wording. 401 never says which of username or password was wrong. */
function loginErrorMessage(err: unknown): string {
  const status = err instanceof ApiRequestError ? err.status : null
  if (status === 401) return 'Invalid username or password.'
  if (status === 400) return 'Enter your username and password.'
  if (status === 429) return 'Too many sign-in attempts. Wait a moment and try again.'
  return describeError(err)
}

export function LoginPage() {
  const { login, isAuthenticated, notice } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (isAuthenticated && !submitting) return <Navigate to={from} replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await login(username.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(loginErrorMessage(err))
      setSubmitting(false)
    }
  }

  // One alert at a time: a fresh sign-in error replaces the "Session expired" notice.
  const alertMessage = error ?? notice

  return (
    <div className="login-page">
      <div className="login-theme">
        <ThemeToggle />
      </div>
      <main className="login-main">
        <div className="login-card">
          <header className="login-brand">
            <span className="login-logo" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                <path
                  d="M5 6.5A2.5 2.5 0 017.5 4h9A2.5 2.5 0 0119 6.5v7a2.5 2.5 0 01-2.5 2.5H11l-4 3.5V16h0.5A2.5 2.5 0 015 13.5z"
                  strokeLinejoin="round"
                />
                <path d="M9 10h.01M12 10h.01M15 10h.01" strokeLinecap="round" strokeWidth="2.5" />
              </svg>
            </span>
            <div className="login-brand-text">
              <h1 className="login-title">
                Aronno Mart <span className="badge-demo">Demo</span> <span className="badge-ai">AI</span>
              </h1>
              <p className="login-subtitle">AI customer support assistant</p>
            </div>
          </header>

          {alertMessage && (
            <div className="login-alert" role="alert">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7.5v5M12 16h.01" strokeLinecap="round" />
              </svg>
              <span>{alertMessage}</span>
            </div>
          )}

          <form className="login-form" onSubmit={handleSubmit} aria-busy={submitting}>
            <div className="login-field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                autoFocus
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
            <div className="login-field">
              <label htmlFor="password">Password</label>
              <div className="password-field">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((shown) => !shown)}
                  aria-label="Show password"
                  aria-pressed={showPassword}
                  aria-controls="password"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c5 0 9 4.5 10 7a12.6 12.6 0 01-3.2 4.3M6.6 6.6C4.4 8 2.8 10.1 2 12c1 2.5 5 7 10 7a9.7 9.7 0 004.4-1.1" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" strokeLinejoin="round" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-block login-submit" disabled={submitting}>
              {submitting && <span className="spinner spinner-light" aria-hidden="true" />}
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="login-note">Your session is kept in memory only. Refreshing the page signs you out.</p>
        </div>
        <p className="login-footer">
          Demo project. Answers come from fictional store data.{' '}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            View on GitHub<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      </main>
    </div>
  )
}
