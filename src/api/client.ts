import type {
  ApiError,
  ChatDetail,
  ChatSummary,
  HandoffDto,
  HandoffStatus,
  LoginResponse,
  ProviderId,
  SendMessageRequest,
  SendMessageResponse,
} from './types'

/** Thrown for every failed request. `body` is the backend's ErrorResponse, or a synthesised one. */
export class ApiRequestError extends Error {
  readonly status: number
  readonly body: ApiError
  /** False when the response was not the backend's JSON error shape (network error, proxy error page). */
  readonly fromServer: boolean

  constructor(body: ApiError, fromServer: boolean) {
    super(body.message)
    this.name = 'ApiRequestError'
    this.status = body.status
    this.body = body
    this.fromServer = fromServer
  }
}

export interface ApiClientOptions {
  /** Prefix for every path. Empty in development (the Vite proxy forwards /api). */
  baseUrl?: string
  getToken: () => string | null
  /** Called when an authenticated request gets a 401 (expired or invalid token). */
  onUnauthorized?: () => void
  fetchImpl?: typeof fetch
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  /** False for the login call: no token is sent and a 401 means wrong credentials, not "log out". */
  auth?: boolean
}

function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiError).status === 'number' &&
    typeof (value as ApiError).message === 'string'
  )
}

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '')
  const doFetch = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))

  async function request<T>(path: string, { method = 'GET', body, auth = true }: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (auth) {
      const token = options.getToken()
      if (token) headers.Authorization = `Bearer ${token}`
    }

    let response: Response
    try {
      response = await doFetch(baseUrl + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new ApiRequestError(
        {
          timestamp: new Date().toISOString(),
          status: 0,
          error: 'Network Error',
          message: 'Cannot reach the chat server. Is the backend running?',
          path,
        },
        false,
      )
    }

    const text = await response.text()
    let parsed: unknown = undefined
    if (text) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = undefined
      }
    }

    if (!response.ok) {
      if (response.status === 401 && auth) options.onUnauthorized?.()
      if (isApiError(parsed)) throw new ApiRequestError(parsed, true)
      throw new ApiRequestError(
        {
          timestamp: new Date().toISOString(),
          status: response.status,
          error: response.statusText || 'Error',
          message: `The server returned HTTP ${response.status}.`,
          path,
        },
        false,
      )
    }

    return parsed as T
  }

  const chatPath = (id: string) => `/api/chats/${encodeURIComponent(id)}`

  return {
    login: (username: string, password: string) =>
      request<LoginResponse>('/api/auth/login', { method: 'POST', body: { username, password }, auth: false }),

    listChats: () => request<ChatSummary[]>('/api/chats'),

    createChat: (title?: string) => {
      const trimmed = title?.trim()
      return request<ChatSummary>('/api/chats', { method: 'POST', body: trimmed ? { title: trimmed } : {} })
    },

    getChat: (id: string) => request<ChatDetail>(chatPath(id)),

    deleteChat: (id: string) => request<void>(chatPath(id), { method: 'DELETE' }),

    sendMessage: (id: string, message: string, provider?: ProviderId) => {
      const body: SendMessageRequest = provider ? { message, provider } : { message }
      return request<SendMessageResponse>(`${chatPath(id)}/messages`, { method: 'POST', body })
    },

    listHandoffs: (status: HandoffStatus) => request<HandoffDto[]>(`/api/handoffs?status=${status}`),

    resolveHandoff: (id: string) =>
      request<HandoffDto>(`/api/handoffs/${encodeURIComponent(id)}/resolve`, { method: 'POST' }),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>

/**
 * Turns any error into short, user-facing text. Never includes tokens or stack traces:
 * only the backend's own `message` field (already sanitised server-side) or fixed wording.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return 'Something went wrong. Please try again.'
  const { status } = error
  // Network failure, or a 5xx that isn't the backend's JSON (e.g. the dev proxy when the backend is down).
  if (status === 0 || (!error.fromServer && status >= 500)) return 'Cannot reach the chat server. Is the backend running?'
  const serverMessage = error.fromServer ? error.body.message : null
  switch (status) {
    case 400:
      return serverMessage ?? 'The request was not accepted.'
    case 401:
      return 'Session expired. Please log in again.'
    case 404:
      return 'This conversation no longer exists. It may have been deleted.'
    case 409:
      return serverMessage ?? 'This conversation is full. Start a new chat.'
    case 429:
      return 'Too many messages, wait a moment and try again.'
    case 502:
      return 'The assistant is unavailable right now. Please try again shortly.'
    case 503:
      return 'The database is unavailable right now. Please try again shortly.'
    default:
      return status >= 500 ? 'The server had a problem. Please try again.' : (serverMessage ?? 'Something went wrong.')
  }
}

/** Like `describeError`, with wording that fits the Handoffs page. */
export function describeHandoffError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 404) return 'This request no longer exists.'
    if (error.status === 502 || error.status === 503) return 'The server is unavailable right now. Please try again shortly.'
  }
  return describeError(error)
}
