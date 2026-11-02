import { createContext, useContext } from 'react'

export interface HandoffCountState {
  /** Number of OPEN handoffs, or null until the first load succeeds (the badge stays hidden). */
  openCount: number | null
  /** Reloads the count from the server. Failures are ignored; the badge keeps its last value. */
  refresh: () => Promise<void>
}

export const HandoffCountContext = createContext<HandoffCountState | null>(null)

export function useHandoffCount(): HandoffCountState {
  const value = useContext(HandoffCountContext)
  if (!value) throw new Error('useHandoffCount must be used inside <HandoffProvider>')
  return value
}
