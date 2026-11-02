import { useEffect, useRef } from 'react'
import type { MessageDto, SourceDto } from '../api/types'
import { cleanContent, formatCount, providerLabel } from './format'

/** Details only present in a live POST /messages response (GET /api/chats/{id} does not return them). */
export interface ReplyExtras {
  sources: SourceDto[]
  handoff: boolean
  fallbackUsed: boolean
}

interface MessageListProps {
  messages: MessageDto[]
  extras: Record<string, ReplyExtras>
  typing: boolean
}

export function MessageList({ messages, extras, typing }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, typing])

  return (
    <div ref={scrollRef} className="message-scroll" role="log" aria-label="Messages" aria-live="polite">
      <ol className="message-list">
        {messages.map((message) =>
          message.role === 'USER' ? (
            <li key={message.id} className="msg msg-user">
              <span className="sr-only">You said:</span>
              <div className="bubble bubble-user">{message.content}</div>
            </li>
          ) : (
            <li key={message.id} className="msg msg-assistant">
              <span className="msg-label">AI assistant</span>
              <div className="bubble bubble-assistant">{cleanContent(message.content)}</div>
              <ReplyDetails message={message} extras={extras[message.id]} />
              {extras[message.id]?.handoff && <HandoffBanner />}
            </li>
          ),
        )}
        {typing && (
          <li className="msg msg-assistant">
            <div className="bubble bubble-assistant typing" role="status">
              AI assistant is typing…
            </div>
          </li>
        )}
      </ol>
    </div>
  )
}

function ReplyDetails({ message, extras }: { message: MessageDto; extras?: ReplyExtras }) {
  const hasTokens = message.inputTokens != null || message.outputTokens != null
  const sources = extras?.sources ?? []
  return (
    <div className="reply-details">
      <p className="reply-meta">
        <span>{providerLabel(message.provider)}</span>
        {message.model && (
          <>
            <span aria-hidden="true"> · </span>
            <span className="mono">{message.model}</span>
          </>
        )}
        {hasTokens && (
          <>
            <span aria-hidden="true"> · </span>
            <span>
              {formatCount(message.inputTokens)} in / {formatCount(message.outputTokens)} out tokens
            </span>
          </>
        )}
        {extras?.fallbackUsed && <span className="tag">fallback provider</span>}
      </p>
      {sources.length > 0 && (
        <ul className="source-list" aria-label="Sources">
          {sources.map((source) => (
            <li key={`${source.type}-${source.id}`} className={`source-chip source-${source.type}`}>
              <span className="source-type">{source.type === 'policy' ? 'Policy' : source.type === 'product' ? 'Product' : source.type}</span>
              <span className="source-title">{source.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function HandoffBanner() {
  return (
    <div className="handoff-banner" role="note" aria-label="Handoff to a support person">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0116 0" strokeLinecap="round" />
      </svg>
      <div>
        <strong>A support person will help you</strong>
        <p>The assistant could not fully answer this, so the conversation has been flagged for a human agent.</p>
      </div>
    </div>
  )
}
