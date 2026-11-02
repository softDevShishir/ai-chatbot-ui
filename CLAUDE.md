# CLAUDE.md

React + TypeScript + Vite chat UI for the Spring Boot backend `../ai-chatbot-api`
(https://github.com/softDevShishir/ai-chatbot-api). Mirrors the structure of `../mini-jarvis-ai-agent-ui`.

## Commands

```bash
npm install        # Node ^20.19 or >=22.12 (Node 24 recommended; 22.5.0 breaks npm)
npm run dev        # http://localhost:5173, proxies /api to VITE_API_PROXY_TARGET (default http://localhost:8080)
npm run build      # tsc -b && vite build
npm test           # vitest run (jsdom, fetch mocked; no backend needed)
npm run lint
```

## Structure

- `src/api/types.ts`: mirrors the backend DTOs (`com.example.aichatbot.dto.*`). Keep in sync with them.
- `src/api/client.ts`: the only place that calls `fetch`; `describeError` turns HTTP errors into user text.
- `src/auth/`: JWT kept in memory (React state and a ref). 401 calls `onUnauthorized`, which logs out with "Session expired".
- `src/pages/ChatPage.tsx`: all chat state (list, selected chat, optimistic send, delete confirm).
  It is mounted on `/*` and reads `/chats/:chatId` with `useMatch`, so state survives chat switches.
- `src/components/`: presentational pieces (sidebar, message list, composer, modal, header, theme toggle).
- `src/test/helpers.tsx`: `fakeBackend`, `jsonResponse`, `apiError`, `deferred`.

## Conventions

- Never persist the token (no localStorage/sessionStorage/cookies). A test enforces this.
- Never show raw server errors for 5xx or tokens. Only the backend `message` for 400/409 is shown.
- `sources`/`handoff`/`fallbackUsed` exist only in the POST /messages response, not in GET /api/chats/{id};
  they are cached per `messageId` for the session.
- Send `provider` only when the user picked one (not "Default").
- No secrets in code or `.env.example`; every `VITE_*` used in `src/` ends up in the public bundle.
- Accessibility: label every control, keep keyboard paths working, check contrast in both themes.
- Tests mock `fetch` with `vi.stubGlobal`; query by role/label, not class names.
