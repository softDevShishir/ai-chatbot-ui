import { vi } from 'vitest'

/** A fetch mock that answers every call with the given status and JSON body. */
export function jsonResponse(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function mockFetch(...responses: Response[]) {
  const fn = vi.fn<typeof fetch>()
  for (const response of responses) fn.mockResolvedValueOnce(response)
  return fn
}

export function apiError(status: number, message: string, extra: Record<string, unknown> = {}) {
  return {
    timestamp: '2026-10-26T00:00:00Z',
    status,
    error: 'Error',
    message,
    path: '/api/test',
    ...extra,
  }
}

export type Handler = (method: string, path: string, body: unknown) => Response | Promise<Response>

/** A fetch mock that routes each call to `handler` by method and path, with the parsed JSON body. */
export function fakeBackend(handler: Handler) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    return handler(init?.method ?? 'GET', url, body)
  })
}

/** A promise whose resolution the test controls, to observe in-flight UI such as "typing…". */
export function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
