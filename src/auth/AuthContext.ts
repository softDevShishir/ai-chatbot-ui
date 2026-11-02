import { createContext, useContext } from 'react'
import type { ApiClient } from '../api/client'

export interface AuthState {
  isAuthenticated: boolean
  username: string | null
  /** Set when the user was logged out because the token expired or was rejected. */
  notice: string | null
  api: ApiClient
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
