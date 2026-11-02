import { describe, expect, it, vi } from 'vitest'
import { ApiRequestError, createApiClient, describeError } from './client'
import { apiError, jsonResponse, mockFetch } from '../test/helpers'

const reply = {
  reply: 'Hi',
  messageId: 'm1',
  provider: 'claude',
  model: 'claude-haiku-5-5',
  inputTokens: 10,
  outputTokens: 5,
  sources: [],
  handoff: false,
  fallbackUsed: false,
}

describe('api client', () => {
  it('adds the bearer token to authenticated requests', async () => {
    const fetchImpl = mockFetch(jsonResponse(200, []))
    const api = createApiClient({ getToken: () => 'abc.def.ghi', fetchImpl })

    await api.listChats()

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/chats')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer abc.def.ghi')
  })

  it('prefixes the base URL and does not send a token on login', async () => {
    const fetchImpl = mockFetch(jsonResponse(200, { token: 't' }))
    const api = createApiClient({ baseUrl: 'https://api.example.com/', getToken: () => 'old', fetchImpl })

    const response = await api.login('admin', 'secret')

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.example.com/api/auth/login')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({ username: 'admin', password: 'secret' })
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined()
    expect(response.token).toBe('t')
  })

  it('sends the provider field only when one is chosen', async () => {
    const fetchImpl = mockFetch(jsonResponse(200, reply), jsonResponse(200, reply))
    const api = createApiClient({ getToken: () => 't', fetchImpl })

    await api.sendMessage('c1', 'hello')
    await api.sendMessage('c1', 'hello', 'gemini')

    expect(fetchImpl.mock.calls[0][0]).toBe('/api/chats/c1/messages')
    expect(JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)).toEqual({ message: 'hello' })
    expect(JSON.parse(fetchImpl.mock.calls[1][1]?.body as string)).toEqual({ message: 'hello', provider: 'gemini' })
  })

  it('creates a chat with an optional title and deletes with DELETE (204, empty body)', async () => {
    const fetchImpl = mockFetch(
      jsonResponse(201, { id: 'c1', title: null, createdAt: 'x', updatedAt: 'x' }),
      new Response(null, { status: 204 }),
    )
    const api = createApiClient({ getToken: () => 't', fetchImpl })

    await api.createChat()
    await api.deleteChat('c1')

    expect(JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)).toEqual({})
    expect(fetchImpl.mock.calls[1][0]).toBe('/api/chats/c1')
    expect(fetchImpl.mock.calls[1][1]?.method).toBe('DELETE')
  })

  it('maps statuses to friendly text and shows the backend message for 400', () => {
    const err = (status: number, message: string) => new ApiRequestError(apiError(status, message), true)
    expect(describeError(err(400, 'message must not exceed 2000 characters'))).toBe(
      'message must not exceed 2000 characters',
    )
    expect(describeError(err(404, 'Conversation not found'))).toMatch(/no longer exists/)
    expect(describeError(err(429, 'Rate limit exceeded'))).toBe('Too many messages, wait a moment and try again.')
    expect(describeError(err(502, 'claude failed: overloaded'))).toMatch(/assistant is unavailable/)
    expect(describeError(err(503, 'Database is unavailable'))).toMatch(/database is unavailable/)
  })

  it('never shows raw server text for 5xx or non-API errors', () => {
    const internal = new ApiRequestError(apiError(500, 'java.lang.NullPointerException at Foo.java:12'), true)
    expect(describeError(internal)).not.toMatch(/NullPointer/)
    expect(describeError(new Error('Bearer eyJhbGciOi...'))).toBe('Something went wrong. Please try again.')
  })

  it('reports an unreachable backend when a 5xx is not the backend JSON (dev proxy error)', async () => {
    const fetchImpl = mockFetch(new Response('Bad Gateway', { status: 502 }))
    const api = createApiClient({ getToken: () => 't', fetchImpl })

    const error = await api.listChats().catch((e: unknown) => e)
    expect(describeError(error)).toBe('Cannot reach the chat server. Is the backend running?')
  })

  it('calls onUnauthorized on a 401 from an authenticated request', async () => {
    const onUnauthorized = vi.fn()
    const fetchImpl = mockFetch(jsonResponse(401, apiError(401, 'Missing or invalid JWT Bearer token')))
    const api = createApiClient({ getToken: () => 'expired', onUnauthorized, fetchImpl })

    await expect(api.listChats()).rejects.toMatchObject({ status: 401 })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('does not call onUnauthorized when the login itself returns 401', async () => {
    const onUnauthorized = vi.fn()
    const fetchImpl = mockFetch(jsonResponse(401, apiError(401, 'Invalid username or password')))
    const api = createApiClient({ getToken: () => null, onUnauthorized, fetchImpl })

    await expect(api.login('admin', 'wrong')).rejects.toMatchObject({ status: 401 })
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('reports a network failure without crashing', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))
    const api = createApiClient({ getToken: () => 't', fetchImpl })

    const error = await api.listChats().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiRequestError)
    expect(describeError(error)).toMatch(/Cannot reach the chat server/)
  })
})
