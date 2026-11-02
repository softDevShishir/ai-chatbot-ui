import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { HandoffCountContext, type HandoffCountState } from './HandoffContext'

/** Keeps the number of OPEN handoffs for the header badge. Loads when the user logs in. */
export function HandoffProvider({ children }: { children: ReactNode }) {
  const { api, isAuthenticated } = useAuth()
  const [openCount, setOpenCount] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    try {
      const open = await api.listHandoffs('OPEN')
      setOpenCount(open.length)
    } catch {
      // The badge is a hint. A 401 is handled by AuthProvider; other errors just leave it as it was.
    }
  }, [api])

  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    api
      .listHandoffs('OPEN')
      .then((open) => {
        if (!cancelled) setOpenCount(open.length)
      })
      .catch(() => undefined) // Hint only; a 401 is handled by AuthProvider.
    return () => {
      cancelled = true
    }
  }, [api, isAuthenticated])

  const value = useMemo<HandoffCountState>(
    () => ({ openCount: isAuthenticated ? openCount : null, refresh }),
    [isAuthenticated, openCount, refresh],
  )
  return <HandoffCountContext.Provider value={value}>{children}</HandoffCountContext.Provider>
}
