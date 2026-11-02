import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useHandoffCount } from './HandoffContext'
import { ThemeToggle } from './ThemeToggle'

export function AppHeader() {
  const { isAuthenticated, username, logout } = useAuth()
  const { openCount } = useHandoffCount()
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 8h12l-1 11H7L6 8z" strokeLinejoin="round" />
            <path d="M9 8V6a3 3 0 016 0v2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="brand-name">Aronno Mart · AI Assistant</span>
        <span className="badge-demo" title="Fictional store with demo data">
          Demo
        </span>
      </div>
      <div className="header-actions">
        {isAuthenticated && username && <span className="header-user muted">Signed in as {username}</span>}
        <ThemeToggle />
        {isAuthenticated && (
          <NavLink to="/handoffs" className="btn btn-secondary btn-small header-link">
            Handoffs
            {openCount !== null && openCount > 0 && (
              <>
                <span className="count-badge" aria-hidden="true">
                  {openCount}
                </span>
                <span className="sr-only">, {openCount} open</span>
              </>
            )}
          </NavLink>
        )}
        {isAuthenticated && (
          <button type="button" className="btn btn-secondary btn-small" onClick={logout}>
            Log out
          </button>
        )}
      </div>
    </header>
  )
}
