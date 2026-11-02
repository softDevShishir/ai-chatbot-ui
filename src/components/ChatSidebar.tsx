import { NavLink } from 'react-router-dom'
import type { ChatSummary } from '../api/types'
import { chatTitle, formatTime } from './format'

interface ChatSidebarProps {
  chats: ChatSummary[] | null
  error: string | null
  creating: boolean
  /** Id of the chat with a message in flight; it cannot be deleted until the reply arrives. */
  busyChatId: string | null
  onNewChat: () => void
  onDelete: (chat: ChatSummary) => void
  onSelect: () => void
}

export function ChatSidebar({ chats, error, creating, busyChatId, onNewChat, onDelete, onSelect }: ChatSidebarProps) {
  return (
    <nav className="sidebar-inner" aria-label="Conversations">
      <button type="button" className="btn btn-primary btn-block new-chat" onClick={onNewChat} disabled={creating}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        {creating ? 'Creating…' : 'New chat'}
      </button>
      <h2 className="sidebar-heading">Your conversations</h2>
      {error && (
        <p className="small error-text" role="alert">
          {error}
        </p>
      )}
      {chats === null && !error && <p className="small muted">Loading…</p>}
      {chats && chats.length === 0 && <p className="small muted">No conversations yet.</p>}
      {chats && chats.length > 0 && (
        <ul className="chat-list">
          {chats.map((chat) => {
            const title = chatTitle(chat)
            return (
              <li key={chat.id} className="chat-item">
                <NavLink to={`/chats/${chat.id}`} className="chat-link" onClick={onSelect}>
                  <span className="chat-title">{title}</span>
                  <span className="chat-time">{formatTime(chat.updatedAt)}</span>
                </NavLink>
                <button
                  type="button"
                  className="icon-btn chat-delete"
                  onClick={() => onDelete(chat)}
                  disabled={busyChatId === chat.id}
                  aria-label={`Delete conversation: ${title}`}
                  title="Delete conversation"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </nav>
  )
}
