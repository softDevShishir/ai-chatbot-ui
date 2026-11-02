import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthProvider'
import { apiError, deferred, jsonResponse, mockFetch } from '../test/helpers'
import { LoginPage } from './LoginPage'

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.test-payload.test-signature'

function renderLogin() {
  return render(
    <AuthProvider baseUrl="">
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<p>Chat home</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

async function signIn(password = 'change-me') {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Username'), 'admin')
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('LoginPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('posts the credentials and goes to the chat on success', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { token: TOKEN }))
    vi.stubGlobal('fetch', fetchMock)
    renderLogin()

    await signIn()

    expect(await screen.findByText('Chat home')).toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/auth/login')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({ username: 'admin', password: 'change-me' })
  })

  it('shows an error for wrong credentials and stays on the login page', async () => {
    vi.stubGlobal('fetch', mockFetch(jsonResponse(401, apiError(401, 'Invalid username or password'))))
    renderLogin()

    await signIn('wrong')

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password.')
    expect(screen.queryByText('Chat home')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('never writes the token to localStorage or sessionStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    vi.stubGlobal('fetch', mockFetch(jsonResponse(200, { token: TOKEN })))
    renderLogin()

    await signIn()
    await screen.findByText('Chat home')

    for (const [, value] of setItem.mock.calls) expect(value).not.toContain(TOKEN)
    const stored = [...Object.values(localStorage), ...Object.values(sessionStorage)].join('|')
    expect(stored).not.toContain(TOKEN)
    expect(document.cookie).not.toContain(TOKEN)
  })
  it('shows the brand, empty fields with autocomplete, and the repo link', () => {
    renderLogin()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Aronno Mart Demo AI')
    expect(screen.getByText('AI customer support assistant')).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toHaveValue('')
    expect(screen.getByLabelText('Username')).toHaveAttribute('autocomplete', 'username')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByRole('link', { name: /GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/softDevShishir/ai-chatbot-ui',
    )
  })

  it('toggles password visibility with an accessible button', async () => {
    const user = userEvent.setup()
    renderLogin()
    const password = screen.getByLabelText('Password')
    const toggle = screen.getByRole('button', { name: 'Show password' })

    expect(password).toHaveAttribute('type', 'password')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await user.click(toggle)
    expect(password).toHaveAttribute('type', 'text')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await user.click(toggle)
    expect(password).toHaveAttribute('type', 'password')
  })

  it('disables the button and shows a spinner while signing in; Enter submits', async () => {
    const pending = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => pending.promise))
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Password'), 'change-me{Enter}')

    const button = screen.getByRole('button', { name: 'Signing in…' })
    expect(button).toBeDisabled()
    expect(button.querySelector('.spinner')).not.toBeNull()

    pending.resolve(jsonResponse(200, { token: TOKEN }))
    expect(await screen.findByText('Chat home')).toBeInTheDocument()
  })

  it('says when the chat server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')))
    renderLogin()

    await signIn()

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the chat server')
  })

  it('shows a wait message when rate limited', async () => {
    vi.stubGlobal('fetch', mockFetch(jsonResponse(429, apiError(429, 'Rate limit exceeded'))))
    renderLogin()

    await signIn()

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many sign-in attempts. Wait a moment')
  })

  it('does not reveal which credential was wrong', async () => {
    vi.stubGlobal('fetch', mockFetch(jsonResponse(401, apiError(401, 'Unknown user admin'))))
    renderLogin()

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'x' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Invalid username or password.')
    expect(alert).not.toHaveTextContent(/unknown user/i)
  })
})
