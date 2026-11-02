import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../App'
import type { ChatDetail, HandoffDto } from '../api/types'
import { AuthProvider } from '../auth/AuthProvider'
import { apiError, fakeBackend, jsonResponse } from '../test/helpers'

const CHAT_A = 'aaaaaaaa-1111-1111-1111-111111111111'
const CHAT_B = 'bbbbbbbb-2222-2222-2222-222222222222'
const CHAT_C = 'cccccccc-3333-3333-3333-333333333333'

function handoff(id: string, conversationId: string, message: string, extra: Partial<HandoffDto> = {}): HandoffDto {
  return {
    id,
    conversationId,
    status: 'OPEN',
    lastCustomerMessage: message,
    notified: true,
    createdAt: '2026-11-03T08:05:00Z',
    resolvedAt: null,
    ...extra,
  }
}

const OPEN_A = handoff('h-1', CHAT_A, 'I want to talk to a person.', { createdAt: '2026-11-03T09:00:00Z' })
const OPEN_B = handoff('h-2', CHAT_B, 'Do you have a discount code?')
const DONE_C = handoff('h-3', CHAT_C, 'Can you deliver to India?', {
  status: 'RESOLVED',
  resolvedAt: '2026-11-03T10:00:00Z',
})

interface BackendOptions {
  open?: HandoffDto[]
  resolved?: HandoffDto[]
  onResolve?: (id: string) => Response | undefined
}

/** Fake API with a mutable handoff list, so resolving really moves a handoff between the two lists. */
function setupBackend({ open = [OPEN_A, OPEN_B], resolved = [DONE_C], onResolve }: BackendOptions = {}) {
  let openList = [...open]
  let resolvedList = [...resolved]
  const chat: ChatDetail = {
    id: CHAT_A,
    title: 'Customer chat A',
    createdAt: '2026-11-03T08:00:00Z',
    updatedAt: '2026-11-03T08:00:00Z',
    messages: [],
  }
  const fetchMock = fakeBackend(async (method, path) => {
    if (method === 'POST' && path === '/api/auth/login') return jsonResponse(200, { token: 'test.jwt.token' })
    if (method === 'GET' && path === '/api/chats') return jsonResponse(200, [])
    if (method === 'GET' && path === `/api/chats/${CHAT_A}`) return jsonResponse(200, chat)
    if (method === 'GET' && path === '/api/handoffs?status=OPEN') return jsonResponse(200, openList)
    if (method === 'GET' && path === '/api/handoffs?status=RESOLVED') return jsonResponse(200, resolvedList)
    const match = /^\/api\/handoffs\/([^/]+)\/resolve$/.exec(path)
    if (method === 'POST' && match) {
      const custom = onResolve?.(match[1])
      if (custom) return custom
      const found = openList.find((h) => h.id === match[1])
      if (!found) return jsonResponse(404, apiError(404, 'Handoff not found'))
      const done: HandoffDto = { ...found, status: 'RESOLVED', resolvedAt: '2026-11-03T11:00:00Z' }
      openList = openList.filter((h) => h.id !== found.id)
      resolvedList = [done, ...resolvedList]
      return jsonResponse(200, done)
    }
    return jsonResponse(404, apiError(404, 'Not found'))
  })
  vi.stubGlobal('fetch', fetchMock)
  return {
    fetchMock,
    /** Simulates another staff member resolving a handoff in the meantime. */
    dropOpen: (id: string) => {
      openList = openList.filter((h) => h.id !== id)
    },
  }
}

const calls = (fetchMock: ReturnType<typeof setupBackend>['fetchMock'], method: string, path: string) =>
  fetchMock.mock.calls.filter(([input, init]) => input === path && (init?.method ?? 'GET') === method)

/** Renders the app, logs in and opens the Handoffs page from the header link. */
async function openHandoffs() {
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
  await user.click(await screen.findByRole('link', { name: /^Handoffs/ }))
  await screen.findByRole('heading', { name: 'Handoffs', level: 1 })
  return user
}

const headerLink = () => screen.getByRole('link', { name: /^Handoffs/ })

describe('HandoffsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists open handoffs with message, status, short conversation id and a badge in the header', async () => {
    const { fetchMock } = setupBackend()
    await openHandoffs()

    const cards = await screen.findAllByRole('listitem')
    expect(cards).toHaveLength(2)
    // Newest first.
    expect(within(cards[0]).getByText('I want to talk to a person.')).toBeInTheDocument()
    expect(within(cards[0]).getByText('Open')).toBeInTheDocument()
    expect(within(cards[0]).getByText('aaaaaaaa')).toBeInTheDocument()
    expect(within(cards[0]).queryByText(CHAT_A)).not.toBeInTheDocument()
    expect(within(cards[0]).getByRole('button', { name: /Resolve/ })).toBeInTheDocument()
    expect(within(cards[1]).getByText('Do you have a discount code?')).toBeInTheDocument()

    expect(screen.getByRole('tab', { name: 'Open', selected: true })).toBeInTheDocument()
    await waitFor(() => expect(headerLink()).toHaveAccessibleName('Handoffs, 2 open'))
    expect(calls(fetchMock, 'GET', '/api/handoffs?status=OPEN').length).toBeGreaterThan(0)
  })

  it('loads the Resolved tab, without a Resolve button', async () => {
    const { fetchMock } = setupBackend()
    const user = await openHandoffs()
    await screen.findByText('Do you have a discount code?')

    await user.click(screen.getByRole('tab', { name: 'Resolved' }))

    expect(await screen.findByText('Can you deliver to India?')).toBeInTheDocument()
    expect(screen.queryByText('Do you have a discount code?')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Resolved', selected: true })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Resolve/ })).not.toBeInTheDocument()
    const card = screen.getByText('Can you deliver to India?').closest('li') as HTMLElement
    expect(within(card).getByText('Resolved')).toBeInTheDocument()
    expect(calls(fetchMock, 'GET', '/api/handoffs?status=RESOLVED')).toHaveLength(1)
  })

  it('resolves a handoff: the card moves to Resolved and the badge drops', async () => {
    const { fetchMock } = setupBackend()
    const user = await openHandoffs()
    await waitFor(() => expect(headerLink()).toHaveAccessibleName('Handoffs, 2 open'))

    const card = (await screen.findByText('I want to talk to a person.')).closest('li') as HTMLElement
    await user.click(within(card).getByRole('button', { name: /Resolve/ }))

    await waitFor(() => expect(screen.queryByText('I want to talk to a person.')).not.toBeInTheDocument())
    expect(screen.getByText('Do you have a discount code?')).toBeInTheDocument()
    await waitFor(() => expect(headerLink()).toHaveAccessibleName('Handoffs, 1 open'))
    expect(calls(fetchMock, 'POST', '/api/handoffs/h-1/resolve')).toHaveLength(1)

    await user.click(screen.getByRole('tab', { name: 'Resolved' }))
    expect(await screen.findByText('I want to talk to a person.')).toBeInTheDocument()
  })

  it('on 404 while resolving, says the request is gone and refreshes the list', async () => {
    const { fetchMock, dropOpen } = setupBackend({ open: [OPEN_A, OPEN_B] })
    const user = await openHandoffs()
    const card = (await screen.findByText('I want to talk to a person.')).closest('li') as HTMLElement
    const listCallsBefore = calls(fetchMock, 'GET', '/api/handoffs?status=OPEN').length

    dropOpen('h-1') // someone else resolved it, so the server now answers 404
    await user.click(within(card).getByRole('button', { name: /Resolve/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This request no longer exists.')
    await waitFor(() => expect(screen.queryByText('I want to talk to a person.')).not.toBeInTheDocument())
    expect(calls(fetchMock, 'GET', '/api/handoffs?status=OPEN').length).toBeGreaterThan(listCallsBefore)
    expect(screen.getByText('Do you have a discount code?')).toBeInTheDocument()
  })

  it('returns to the login page with "Session expired" on 401', async () => {
    setupBackend({ onResolve: () => jsonResponse(401, apiError(401, 'Unauthorized')) })
    const user = await openHandoffs()
    const card = (await screen.findByText('I want to talk to a person.')).closest('li') as HTMLElement

    await user.click(within(card).getByRole('button', { name: /Resolve/ }))

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByText(/Session expired/)).toBeInTheDocument()
  })

  it('shows a friendly message and no raw error when the server is unavailable', async () => {
    setupBackend({ onResolve: () => jsonResponse(503, apiError(503, 'jdbc: connection refused to db:5432')) })
    const user = await openHandoffs()
    const card = (await screen.findByText('I want to talk to a person.')).closest('li') as HTMLElement

    await user.click(within(card).getByRole('button', { name: /Resolve/ }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The server is unavailable right now. Please try again shortly.')
    expect(alert).not.toHaveTextContent('jdbc')
    expect(screen.getByText('I want to talk to a person.')).toBeInTheDocument()
  })

  it('shows an empty state when nothing is open, and no badge', async () => {
    setupBackend({ open: [] })
    await openHandoffs()

    expect(await screen.findByText('No open handoffs. Everything is handled.')).toBeInTheDocument()
    expect(headerLink()).toHaveAccessibleName('Handoffs')
  })

  it('"View chat" opens that conversation on the chat page', async () => {
    setupBackend()
    const user = await openHandoffs()
    const card = (await screen.findByText('I want to talk to a person.')).closest('li') as HTMLElement

    await user.click(within(card).getByRole('link', { name: /View chat/ }))

    expect(await screen.findByRole('heading', { name: 'Customer chat A', level: 1 })).toBeInTheDocument()
  })
})
