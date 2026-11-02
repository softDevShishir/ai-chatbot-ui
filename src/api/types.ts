// Mirrors the ai-chatbot-api DTOs (com.example.aichatbot.dto.*).
// Java `Instant` fields are serialised by Jackson as ISO-8601 strings; `UUID` as strings.

/** domain.MessageRole */
export type MessageRole = 'USER' | 'ASSISTANT'

/** Provider ids accepted by POST /api/chats/{id}/messages. */
export type ProviderId = 'claude' | 'gemini' | 'openai'

/** dto.LoginRequest */
export interface LoginRequest {
  username: string
  password: string
}

/** dto.LoginResponse */
export interface LoginResponse {
  token: string
}

/** dto.CreateChatRequest (body is optional; title max 200 chars) */
export interface CreateChatRequest {
  title?: string
}

/** dto.ChatSummaryResponse. `title` is null when the chat was created without one. */
export interface ChatSummary {
  id: string
  title: string | null
  createdAt: string
  updatedAt: string
}

/** dto.MessageResponse. Provider/model/tokens are null on USER messages. */
export interface MessageDto {
  id: string
  role: MessageRole
  content: string
  provider: string | null
  model: string | null
  inputTokens: number | null
  outputTokens: number | null
  createdAt: string
}

/** dto.ChatDetailResponse */
export interface ChatDetail extends ChatSummary {
  messages: MessageDto[]
}

/** dto.SendMessageRequest. `provider` omitted means the backend's DEFAULT_PROVIDER. */
export interface SendMessageRequest {
  message: string
  provider?: ProviderId
}

/** dto.SourceResponse. `type` is the knowledge source kind (e.g. product or policy). */
export interface SourceDto {
  type: string
  id: string
  title: string
}

/** dto.SendMessageResponse */
export interface SendMessageResponse {
  reply: string
  messageId: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  sources: SourceDto[]
  handoff: boolean
  fallbackUsed: boolean
}

/** dto.ErrorResponse: the shared error shape for every 4xx/5xx. */
export interface ApiError {
  timestamp: string
  status: number
  error: string
  message: string
  path: string
}
