// Dev-only mock backend. Loaded via a dynamic import guarded by
// `import.meta.env.VITE_USE_MOCKS === 'true'`, so it is dropped from
// production builds. It patches window.fetch for requests to VITE_API_URL/api.
import { API_URL } from '../api/client'
import { handle, toResponse } from './handlers'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function installMocks(): void {
  const realFetch = window.fetch.bind(window)
  const prefix = `${API_URL}/api/`
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.startsWith(prefix)) return realFetch(input, init)
    const u = new URL(url)
    let body: unknown = undefined
    if (typeof init?.body === 'string' && init.body) {
      try {
        body = JSON.parse(init.body)
      } catch {
        body = init.body
      }
    }
    await delay(120 + Math.random() * 230)
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return toResponse(() =>
      handle({
        method: (init?.method ?? 'GET').toUpperCase(),
        path: u.pathname,
        query: u.searchParams,
        body,
        headers: new Headers(init?.headers),
      }),
    )
  }
  console.info('%c[EcoNet] Mode démo : API simulée en mémoire', 'color:#2f7a5c;font-weight:bold')
}
