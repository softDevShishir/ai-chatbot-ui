import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../App'
import type { ChatDetail, SendMessageResponse } from '../api/types'
import { AuthProvider } from '../auth/AuthProvider'
import { apiError, deferred, fakeBackend, jsonResponse, type Handler } from '../test/helpers'

const CHAT: ChatDetail = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'Shoe question',
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T10:00:00Z',
  messages: [],
}

function replyWith(overrides: Partial<SendMessageResponse> = {}): SendMessageResponse {
  return {
    reply: 'You can return unused items within 7 days of delivery.',
    messageId: 'a-1',
    provider: 'claude',
    model: 'claude-haiku-5-5',
    inputTokens: 812,
    outputTokens: 64,
    sources: [],
    handoff: false,
    fallbackUsed: false,
    ...overrides,
  }
}

/**
 * Backend with one empty chat. `onSend` answers POST /messages; other routes behave like the real API.
 * Returns the fetch mock so tests can inspect calls.
 */
function setupBackend(
  onSend: Handler = () => jsonResponse(200, replyWith()),
  extra?: (method: string, path: string) => Response | undefined,
) {
  const fetchMock = fakeBackend(async (method, path, body) => {
    const custom = extra?.(method, path)
    if (custom) return custom
    if (method === 'POST' && path === '/api/auth/login') return jsonResponse(200, { token: 'test.jwt.token' })
    if (method === 'GET' && path === '/api/chats') {
      return jsonResponse(200, [{ id: CHAT.id, title: CHAT.title, createdAt: CHAT.createdAt, updatedAt: CHAT.updatedAt }])
    }
    if (method === 'GET' && path === `/api/chats/${CHAT.id}`) return jsonResponse(200, CHAT)
    if (method === 'POST' && path === `/api/chats/${CHAT.id}/messages`) return onSend(method, path, body)
    if (method === 'DELETE' && path === `/api/chats/${CHAT.id}`) return new Response(null, { status: 204 })
    return jsonResponse(404, apiError(404, 'Not found'))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Renders the whole app, logs in and opens the test chat. */
async function openChat() {
  const user = userEvent.setup()
  render(
    <AuthProvider baseUrl="">
      <MemoryRouter initialEntries={['/login']}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  )
  await user.type(screen.getByLabelText('Username'), 'admin')
  await user.type(screen.getByLabelText('Password'), 'change-me')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  await user.click(await screen.findByRole('link', { name: /Shoe question/ }))
  await screen.findByRole('heading', { name: 'Shoe question', level: 1 })
  return user
}

const messageBox = () => screen.getByRole('textbox', { name: 'Message' })

describe('ChatPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the customer message at once, a typing indicator, then the reply with details', async () => {
    const pending = deferred<Response>()
    const fetchMock = setupBackend(() => pending.promise)
    const user = await openChat()

    await user.type(messageBox(), 'Can I return shoes?')
    await user.keyboard('{Enter}')

    const log = screen.getByRole('log', { name: 'Messages' })
    expect(within(log).getByText('Can I return shoes?')).toBeInTheDocument()
    expect(within(log).getByText('AI assistant is typing…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled()
    expect(messageBox()).toHaveValue('')

    pending.resolve(jsonResponse(200, replyWith()))

    expect(await within(log).findByText('You can return unused items within 7 days of delivery.')).toBeInTheDocument()
    expect(within(log).queryByText('AI assistant is typing…')).not.toBeInTheDocument()
    expect(within(log).getAllByText('AI assistant')).toHaveLength(1) // label on the reply only, not the customer bubble
    expect(within(log).getByText('Claude')).toBeInTheDocument()
    expect(within(log).getByText('claude-haiku-5-5')).toBeInTheDocument()
    expect(within(log).getByText('812 in / 64 out tokens')).toBeInTheDocument()

    const sendCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/messages'))
    expect(JSON.parse(sendCall?.[1]?.body as string)).toEqual({ message: 'Can I return shoes?' })
  })

  it('sends the provider only when one other than Default is selected', async () => {
    const fetchMock = setupBackend()
    const user = await openChat()

    await user.selectOptions(screen.getByLabelText('AI provider'), 'Gemini')
    await user.type(messageBox(), 'Hi')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText(/within 7 days/)

    const sendCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/messages'))
    expect(JSON.parse(sendCall?.[1]?.body as string)).toEqual({ message: 'Hi', provider: 'gemini' })
  })

  it('renders sources as chips', async () => {
    setupBackend(() =>
      jsonResponse(
        200,
        replyWith({
          sources: [
            { type: 'policy', id: 'returns', title: 'Returns & exchanges' },
            { type: 'product', id: 'p-7', title: 'Linen Summer Shirt' },
          ],
        }),
      ),
    )
    const user = await openChat()

    await user.type(messageBox(), 'Do you have a linen shirt?{Enter}')

    const sources = await screen.findByRole('list', { name: 'Sources' })
    const chips = within(sources).getAllByRole('listitem')
    expect(chips).toHaveLength(2)
    expect(chips[0]).toHaveTextContent('PolicyReturns & exchanges')
    expect(chips[1]).toHaveTextContent('ProductLinen Summer Shirt')
  })

  it('shows the handoff banner and never the [[HANDOFF]] marker', async () => {
    setupBackend(() =>
      jsonResponse(200, replyWith({ reply: 'I do not have that information. [[HANDOFF]]', handoff: true })),
    )
    const user = await openChat()

    await user.type(messageBox(), 'Do you sell iPhones?{Enter}')

    expect(await screen.findByRole('note', { name: /handoff/i })).toHaveTextContent('A support person will help you')
    expect(screen.getByText('I do not have that information.')).toBeInTheDocument()
    expect(screen.queryByText(/\[\[HANDOFF\]\]/)).not.toBeInTheDocument()
  })

  it('Shift+Enter adds a new line instead of sending', async () => {
    const fetchMock = setupBackend()
    const user = await openChat()

    await user.type(messageBox(), 'line one{Shift>}{Enter}{/Shift}line two')

    expect(messageBox()).toHaveValue('line one\nline two')
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/messages'))).toBe(false)
  })

  it('limits input to 2000 characters and shows a counter', async () => {
    setupBackend()
    await openChat()

    expect(messageBox()).toHaveAttribute('maxlength', '2000')
    expect(screen.getByText('0 / 2000')).toBeInTheDocument()
  })

  it('sends an example question when clicked on an empty chat', async () => {
    setupBackend()
    const user = await openChat()

    await user.click(screen.getByRole('button', { name: 'What is your return policy?' }))

    expect(await screen.findByText(/within 7 days/)).toBeInTheDocument()
    expect(screen.getByText('What is your return policy?')).toBeInTheDocument()
  })

  it('returns to the login page with "Session expired" on a 401', async () => {
    setupBackend(() => jsonResponse(401, apiError(401, 'Missing or invalid JWT Bearer token')))
    const user = await openChat()

    await user.type(messageBox(), 'Hello{Enter}')

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Session expired')
    expect(screen.queryByText(/test\.jwt\.token/)).not.toBeInTheDocument()
  })

  it('shows the wait message on a 429 and gives the text back', async () => {
    setupBackend(() => jsonResponse(429, apiError(429, 'Rate limit exceeded: 20 messages per minute')))
    const user = await openChat()

    await user.type(messageBox(), 'Hello again{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many messages, wait a moment')
    expect(messageBox()).toHaveValue('Hello again')
    expect(screen.queryByRole('log')).not.toBeInTheDocument() // optimistic bubble withdrawn, chat empty again
  })

  it('says the assistant is unavailable on a 502', async () => {
    setupBackend(() => jsonResponse(502, apiError(502, 'claude call failed: overloaded')))
    const user = await openChat()

    await user.type(messageBox(), 'Hello{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('The assistant is unavailable')
    expect(screen.queryByText(/overloaded/)).not.toBeInTheDocument()
  })

  it('asks for confirmation before deleting a conversation', async () => {
    const fetchMock = setupBackend()
    const user = await openChat()
    const deleteCalls = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')

    await user.click(screen.getByRole('button', { name: 'Delete conversation: Shoe question' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete this conversation?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(deleteCalls()).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Delete conversation: Shoe question' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByRole('link', { name: /Shoe question/ })).not.toBeInTheDocument())
    expect(deleteCalls()).toHaveLength(1)
    expect(deleteCalls()[0][0]).toBe(`/api/chats/${CHAT.id}`)
    expect(screen.getByRole('heading', { name: 'New conversation', level: 1 })).toBeInTheDocument()
  })

  it('creates a chat via "New chat"', async () => {
    const created = { id: 'c-2', title: null, createdAt: '2026-11-02T09:00:00Z', updatedAt: '2026-11-02T09:00:00Z' }
    const fetchMock = setupBackend(undefined, (method, path) =>
      method === 'POST' && path === '/api/chats' ? jsonResponse(201, created) : undefined,
    )
    const user = await openChat()

    await user.click(screen.getByRole('button', { name: 'New chat' }))

    expect(await screen.findByRole('link', { name: /^New chat ·/ })).toHaveAttribute('aria-current', 'page')
    const createCall = fetchMock.mock.calls.find(([url, init]) => url === '/api/chats' && init?.method === 'POST')
    expect(JSON.parse(createCall?.[1]?.body as string)).toEqual({})
  })
})
