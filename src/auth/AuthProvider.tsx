import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { createApiClient } from '../api/client'
import { AuthContext, type AuthState } from './AuthContext'

/**
 * Holds the JWT in memory only (React state + a ref for the API client).
 * Nothing is written to localStorage or cookies, so a page refresh means logging in again.
 */
export function AuthProvider({ children, baseUrl }: { children: ReactNode; baseUrl?: string }) {
  const [token, setToken] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // The client reads the token through this ref, updated in the same handlers that set state,
  // so requests made right after login already carry it.
  const tokenRef = useRef<string | null>(null)

  const clear = useCallback(() => {
    tokenRef.current = null
    setToken(null)
    setUsername(null)
  }, [])

  const api = useMemo(
    () =>
      // The ref is only read inside these callbacks when a request runs, never during render.
      // eslint-disable-next-line react-hooks/refs
      createApiClient({
        baseUrl: baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? '',
        getToken: () => tokenRef.current,
        onUnauthorized: () => {
          if (tokenRef.current === null) return
          clear()
          setNotice('Session expired. Please log in again.')
        },
      }),
    [baseUrl, clear],
  )

  const login = useCallback(
    async (user: string, password: string) => {
      const response = await api.login(user, password)
      tokenRef.current = response.token
      setToken(response.token)
      setUsername(user)
      setNotice(null)
    },
    [api],
  )

  const logout = useCallback(() => {
    clear()
    setNotice(null)
  }, [clear])

  const value = useMemo<AuthState>(
    () => ({ isAuthenticated: token !== null, username, notice, api, login, logout }),
    [token, username, notice, api, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
