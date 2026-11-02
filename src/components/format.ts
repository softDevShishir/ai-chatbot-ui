import type { ChatSummary } from '../api/types'

const PROVIDER_LABELS: Record<string, string> = {
  claude: 'Claude',
  gemini: 'Gemini',
  openai: 'OpenAI',
}

export function providerLabel(provider: string | null | undefined): string {
  if (!provider) return 'Unknown provider'
  return PROVIDER_LABELS[provider] ?? provider
}

const numberFormat = new Intl.NumberFormat('en-US')

export function formatCount(value: number | null | undefined): string {
  return value == null ? '–' : numberFormat.format(value)
}

export function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** The backend allows a null title; fall back to the creation time so list items stay distinguishable. */
export function chatTitle(chat: Pick<ChatSummary, 'title' | 'createdAt'>): string {
  return chat.title?.trim() || `New chat · ${formatTime(chat.createdAt)}`
}

/** A chat title derived from the first message (backend limit is 200; keep it short for the sidebar). */
export function titleFromMessage(message: string): string {
  const oneLine = message.replace(/\s+/g, ' ').trim()
  return oneLine.length > 60 ? `${oneLine.slice(0, 57)}…` : oneLine
}

const HANDOFF_MARKER = /\s*\[\[HANDOFF\]\]\s*/g

/** The backend already strips the marker; this is a defensive second pass so it never reaches the screen. */
export function cleanContent(content: string): string {
  return content.replace(HANDOFF_MARKER, ' ').trim()
}

/** Shown as clickable buttons on an empty chat. */
export const EXAMPLE_QUESTIONS = [
  'What is your return policy?',
  'Do you have a linen shirt?',
  'How much is delivery outside Dhaka?',
  'When is customer support open?',
  'I want to talk to a person.',
]
