import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiRequestError, describeHandoffError } from '../api/client'
import type { HandoffDto, HandoffStatus } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { AppHeader } from '../components/AppHeader'
import { ErrorBanner } from '../components/ErrorBanner'
import { formatTime } from '../components/format'
import { useHandoffCount } from '../components/HandoffContext'

const TABS: { status: HandoffStatus; label: string }[] = [
  { status: 'OPEN', label: 'Open' },
  { status: 'RESOLVED', label: 'Resolved' },
]

const EMPTY_TEXT: Record<HandoffStatus, string> = {
  OPEN: 'No open handoffs. Everything is handled.',
  RESOLVED: 'No resolved handoffs yet.',
}

function statusOf(error: unknown): number | null {
  return error instanceof ApiRequestError ? error.status : null
}

function newestFirst(items: HandoffDto[]): HandoffDto[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** First part of the conversation id; enough to tell conversations apart. */
function shortId(id: string): string {
  return id.slice(0, 8)
}

export function HandoffsPage() {
  const { api } = useAuth()
  const { refresh: refreshCount } = useHandoffCount()
  const [tab, setTab] = useState<HandoffStatus>('OPEN')
  // Results are tagged with their tab so a late answer for another tab is never shown.
  const [loaded, setLoaded] = useState<{ tab: HandoffStatus; items: HandoffDto[] } | null>(null)
  const [loadError, setLoadError] = useState<{ tab: HandoffStatus; message: string } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const tabRefs = useRef<Record<HandoffStatus, HTMLButtonElement | null>>({ OPEN: null, RESOLVED: null })

  useEffect(() => {
    let cancelled = false
    api
      .listHandoffs(tab)
      .then((items) => {
        if (cancelled) return
        setLoaded({ tab, items: newestFirst(items) })
        setLoadError(null)
      })
      .catch((err: unknown) => {
        if (!cancelled && statusOf(err) !== 401) setLoadError({ tab, message: describeHandoffError(err) })
      })
    return () => {
      cancelled = true
    }
  }, [api, tab, reloadKey])

  const items = loaded?.tab === tab ? loaded.items : null
  const error = loadError?.tab === tab ? loadError.message : null
  const loading = items === null && error === null

  const selectTab = useCallback((next: HandoffStatus) => {
    setTab(next)
    setActionError(null)
    setLoadError(null)
  }, [])

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex((t) => t.status === tab)
    let next: number
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = TABS.length - 1
    else return
    event.preventDefault()
    selectTab(TABS[next].status)
    tabRefs.current[TABS[next].status]?.focus()
  }

  async function resolve(item: HandoffDto) {
    setResolvingId(item.id)
    setActionError(null)
    try {
      await api.resolveHandoff(item.id)
      // Moves to Resolved: drop it here; the Resolved tab loads fresh when opened.
      setLoaded((prev) => prev && { ...prev, items: prev.items.filter((h) => h.id !== item.id) })
    } catch (err) {
      const status = statusOf(err)
      if (status === 401) return // AuthProvider has logged out; the router shows the login page.
      setActionError(describeHandoffError(err))
      if (status === 404) setReloadKey((k) => k + 1)
    } finally {
      setResolvingId(null)
      void refreshCount()
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#handoffs-main">
        Skip to handoffs
      </a>
      <AppHeader />
      <main id="handoffs-main" className="page-main" tabIndex={-1}>
        <div className="page-inner">
          <h1>Handoffs</h1>
          <p className="muted">Customers the assistant could not fully help. Follow up, then mark each one as resolved.</p>

          <div role="tablist" aria-label="Handoff status" className="tabs">
            {TABS.map(({ status, label }) => (
              <button
                key={status}
                ref={(el) => {
                  tabRefs.current[status] = el
                }}
                type="button"
                role="tab"
                id={`handoff-tab-${status}`}
                aria-selected={tab === status}
                aria-controls="handoff-panel"
                tabIndex={tab === status ? 0 : -1}
                className="tab"
                onClick={() => selectTab(status)}
                onKeyDown={onTabKeyDown}
              >
                {label}
              </button>
            ))}
          </div>

          <div role="tabpanel" id="handoff-panel" aria-labelledby={`handoff-tab-${tab}`} className="tab-panel">
            <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />

            {loading && (
              <div role="status" aria-label="Loading handoffs">
                <ul className="handoff-list" aria-hidden="true">
                  {[0, 1, 2].map((n) => (
                    <li key={n} className="handoff-card skeleton-card">
                      <span className="skeleton-line short" />
                      <span className="skeleton-line" />
                      <span className="skeleton-line medium" />
                    </li>
                  ))}
                </ul>
                <span className="sr-only">Loading handoffs…</span>
              </div>
            )}

            {error && (
              <div>
                <ErrorBanner message={error} />
                <button type="button" className="btn btn-secondary btn-small" onClick={() => setReloadKey((k) => k + 1)}>
                  Try again
                </button>
              </div>
            )}

            {items && items.length === 0 && <p className="empty-state">{EMPTY_TEXT[tab]}</p>}

            {items && items.length > 0 && (
              <ul className="handoff-list">
                {items.map((item) => (
                  <HandoffCard key={item.id} item={item} resolving={resolvingId === item.id} onResolve={resolve} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function HandoffCard({
  item,
  resolving,
  onResolve,
}: {
  item: HandoffDto
  resolving: boolean
  onResolve: (item: HandoffDto) => void
}) {
  const open = item.status === 'OPEN'
  const short = shortId(item.conversationId)
  return (
    <li className="handoff-card">
      <div className="handoff-card-top">
        <time dateTime={item.createdAt} className="muted small">
          {formatTime(item.createdAt)}
        </time>
        <span className={`status-chip ${open ? 'status-open' : 'status-resolved'}`}>{open ? 'Open' : 'Resolved'}</span>
      </div>
      <p className="handoff-message">{item.lastCustomerMessage}</p>
      <p className="muted small handoff-meta">
        Conversation <span className="mono">{short}</span>
        {!open && item.resolvedAt && <> · Resolved {formatTime(item.resolvedAt)}</>}
      </p>
      <div className="handoff-actions">
        <Link
          to={`/chats/${item.conversationId}`}
          className="btn btn-secondary btn-small"
          aria-label={`View chat ${short}`}
        >
          View chat
        </Link>
        {open && (
          <button
            type="button"
            className="btn btn-primary btn-small"
            onClick={() => onResolve(item)}
            disabled={resolving}
            aria-label={`Resolve handoff ${short}`}
          >
            {resolving ? 'Resolving…' : 'Resolve'}
          </button>
        )}
      </div>
    </li>
  )
}
