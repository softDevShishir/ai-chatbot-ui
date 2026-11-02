import { useCallback, useEffect, useRef, useState } from 'react'
import { useMatch, useNavigate } from 'react-router-dom'
import { ApiRequestError, describeError } from '../api/client'
import type { ChatDetail, ChatSummary, MessageDto } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { AppHeader } from '../components/AppHeader'
import { ChatSidebar } from '../components/ChatSidebar'
import { Composer, MAX_MESSAGE_CHARS, type ProviderChoice } from '../components/Composer'
import { ErrorBanner } from '../components/ErrorBanner'
import { ExamplePrompts } from '../components/ExamplePrompts'
import { chatTitle, titleFromMessage } from '../components/format'
import { MessageList, type ReplyExtras } from '../components/MessageList'
import { Modal } from '../components/Modal'

/** Statuses where the backend rejects the message *before* saving it, so the optimistic bubble is withdrawn. */
const NOT_SAVED_STATUSES = new Set([400, 409, 429])
/** Placeholder id for "a chat is being created for this message". */
const NEW_CHAT = '__new__'

function statusOf(error: unknown): number | null {
  return error instanceof ApiRequestError ? error.status : null
}

function sortChats(chats: ChatSummary[]): ChatSummary[] {
  return [...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function ChatPage() {
  const { api } = useAuth()
  // One route (/*) renders this page for both / and /chats/:chatId, so state survives switching chats.
  const chatId = useMatch('/chats/:chatId')?.params.chatId
  const navigate = useNavigate()

  const [chats, setChats] = useState<ChatSummary[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [detail, setDetail] = useState<ChatDetail | null>(null)
  const [detailError, setDetailError] = useState<{ id: string; message: string } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // Sources/handoff/fallback per assistant message id, kept for this session only.
  const [extras, setExtras] = useState<Record<string, ReplyExtras>>({})
  const [pendingChatId, setPendingChatId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [provider, setProvider] = useState<ProviderChoice>('default')
  const [creating, setCreating] = useState(false)
  const [toDelete, setToDelete] = useState<ChatSummary | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const loadedIdRef = useRef<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const showDetail = useCallback((value: ChatDetail) => {
    loadedIdRef.current = value.id
    setDetail(value)
  }, [])

  const removeChat = useCallback(
    (id: string) => {
      setChats((prev) => prev && prev.filter((chat) => chat.id !== id))
      if (loadedIdRef.current === id) {
        loadedIdRef.current = null
        setDetail(null)
      }
      if (chatId === id) navigate('/', { replace: true })
    },
    [chatId, navigate],
  )

  // Conversation list
  useEffect(() => {
    let cancelled = false
    api
      .listChats()
      .then((list) => {
        if (!cancelled) setChats(sortChats(list))
      })
      .catch((err: unknown) => {
        if (!cancelled && statusOf(err) !== 401) setListError(describeError(err))
      })
    return () => {
      cancelled = true
    }
  }, [api])

  // Selected conversation
  useEffect(() => {
    if (!chatId || loadedIdRef.current === chatId) return
    let cancelled = false
    api
      .getChat(chatId)
      .then((loaded) => {
        if (!cancelled) showDetail(loaded)
      })
      .catch((err: unknown) => {
        if (cancelled || statusOf(err) === 401) return
        if (statusOf(err) === 404) {
          setError(describeError(err))
          removeChat(chatId)
        } else {
          setDetailError({ id: chatId, message: describeError(err) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [api, chatId, reloadKey, showDetail, removeChat])

  const current = chatId && detail?.id === chatId ? detail : null
  const currentError = chatId && !current && detailError?.id === chatId ? detailError.message : null
  const loadingDetail = Boolean(chatId) && !current && !currentError
  const busy = pendingChatId !== null

  function focusInput() {
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  async function handleNewChat() {
    setCreating(true)
    setError(null)
    try {
      const created = await api.createChat()
      setChats((prev) => sortChats([created, ...(prev ?? [])]))
      showDetail({ ...created, messages: [] })
      setSidebarOpen(false)
      navigate(`/chats/${created.id}`)
      focusInput()
    } catch (err) {
      if (statusOf(err) !== 401) setError(describeError(err))
    } finally {
      setCreating(false)
    }
  }

  async function send(raw: string) {
    const text = raw.trim()
    if (!text || busy || text.length > MAX_MESSAGE_CHARS) return
    setError(null)
    setDraft('')
    const chosenProvider = provider === 'default' ? undefined : provider

    // No chat selected: create one, titled after the first message, then send into it.
    let id = current?.id
    if (!id) {
      setPendingChatId(NEW_CHAT)
      try {
        const created = await api.createChat(titleFromMessage(text))
        setChats((prev) => sortChats([created, ...(prev ?? [])]))
        showDetail({ ...created, messages: [] })
        navigate(`/chats/${created.id}`)
        id = created.id
      } catch (err) {
        setPendingChatId(null)
        if (statusOf(err) === 401) return
        setError(describeError(err))
        setDraft(text)
        return
      }
    }

    const chatIdForSend = id
    const optimistic: MessageDto = {
      id: `local-${Date.now()}`,
      role: 'USER',
      content: text,
      provider: null,
      model: null,
      inputTokens: null,
      outputTokens: null,
      createdAt: new Date().toISOString(),
    }
    const updateIfShown = (fn: (d: ChatDetail) => ChatDetail) =>
      setDetail((d) => (d && d.id === chatIdForSend ? fn(d) : d))

    setPendingChatId(chatIdForSend)
    updateIfShown((d) => ({ ...d, messages: [...d.messages, optimistic] }))

    try {
      const response = await api.sendMessage(chatIdForSend, text, chosenProvider)
      const now = new Date().toISOString()
      const reply: MessageDto = {
        id: response.messageId,
        role: 'ASSISTANT',
        content: response.reply,
        provider: response.provider,
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        createdAt: now,
      }
      setExtras((prev) => ({
        ...prev,
        [response.messageId]: {
          sources: response.sources ?? [],
          handoff: response.handoff,
          fallbackUsed: response.fallbackUsed,
        },
      }))
      updateIfShown((d) => ({ ...d, updatedAt: now, messages: [...d.messages, reply] }))
      setChats((prev) => prev && sortChats(prev.map((c) => (c.id === chatIdForSend ? { ...c, updatedAt: now } : c))))
    } catch (err) {
      const status = statusOf(err)
      if (status === 401) return // AuthProvider has logged out; the router shows the login page.
      setError(describeError(err))
      if (status !== null && NOT_SAVED_STATUSES.has(status)) {
        updateIfShown((d) => ({ ...d, messages: d.messages.filter((m) => m.id !== optimistic.id) }))
        setDraft((currentDraft) => currentDraft || text)
      } else if (status === 404) {
        removeChat(chatIdForSend)
      } else {
        // 502 means the question was saved but no reply was; re-sync with what the server has.
        api
          .getChat(chatIdForSend)
          .then((fresh) => updateIfShown(() => fresh))
          .catch(() => undefined)
      }
    } finally {
      setPendingChatId(null)
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    const target = toDelete
    setDeleting(true)
    try {
      await api.deleteChat(target.id)
      removeChat(target.id)
    } catch (err) {
      const status = statusOf(err)
      if (status === 401) return
      if (status === 404) removeChat(target.id)
      else setError(describeError(err))
    } finally {
      setDeleting(false)
      setToDelete(null)
    }
  }

  const messages = current?.messages ?? []
  const typing = busy && pendingChatId === (current?.id ?? NEW_CHAT)
  const showExamples = !loadingDetail && !currentError && messages.length === 0 && !typing
  const heading = current ? chatTitle(current) : chatId ? 'Loading conversation…' : 'New conversation'

  return (
    <div className="app-shell chat-shell">
      <a className="skip-link" href="#chat-main">
        Skip to chat
      </a>
      <AppHeader />
      <div className={`chat-layout${sidebarOpen ? ' sidebar-open' : ''}`}>
        <aside className="sidebar" id="chat-sidebar">
          <ChatSidebar
            chats={chats}
            error={listError}
            creating={creating}
            busyChatId={pendingChatId}
            onNewChat={handleNewChat}
            onDelete={setToDelete}
            onSelect={() => setSidebarOpen(false)}
          />
        </aside>
        <main id="chat-main" className="chat-main" tabIndex={-1}>
          <div className="chat-header">
            <button
              type="button"
              className="btn btn-secondary btn-small sidebar-toggle"
              aria-expanded={sidebarOpen}
              aria-controls="chat-sidebar"
              onClick={() => setSidebarOpen((open) => !open)}
            >
              {sidebarOpen ? 'Hide chats' : 'Chats'}
            </button>
            <h1 className="chat-heading">{heading}</h1>
          </div>

          {loadingDetail && (
            <p className="chat-status muted" role="status">
              <span className="spinner" aria-hidden="true" /> Loading messages…
            </p>
          )}
          {currentError && (
            <div className="chat-status">
              <ErrorBanner message={currentError} />
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setReloadKey((k) => k + 1)}>
                Try again
              </button>
            </div>
          )}
          {showExamples ? (
            <ExamplePrompts onPick={send} disabled={busy} />
          ) : (
            !loadingDetail && !currentError && <MessageList messages={messages} extras={extras} typing={typing} />
          )}

          <div className="composer-wrap">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
            <Composer
              value={draft}
              onChange={setDraft}
              onSend={send}
              provider={provider}
              onProviderChange={setProvider}
              busy={busy}
              inputRef={inputRef}
            />
          </div>
        </main>
      </div>

      {toDelete && (
        <Modal title="Delete this conversation?" onClose={() => setToDelete(null)} busy={deleting}>
          <p>
            <span className="modal-subject">{chatTitle(toDelete)}</span> and all of its messages will be permanently
            deleted.
          </p>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setToDelete(null)} disabled={deleting}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={confirmDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
