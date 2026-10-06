// Dev-only mock backend. Loaded via a dynamic import guarded by
// `import.meta.env.VITE_USE_MOCKS === 'true'`, so it is dropped from
// production builds. It patches window.fetch for requests to VITE_API_URL/api.
import { API_URL, setUploadTransport } from '../api/client'
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
  // Uploads go through XHR, not fetch: simulate the transfer (≈ 40 MB/s, so the
  // 225 MB register file takes a few seconds) and then answer like the server.
  setUploadTransport(async (req) => {
    const file = req.body.get('file')
    const size = file instanceof File ? file.size : 0
    const total = Math.max(size, 1)
    const steps = Math.min(60, Math.max(8, Math.round(size / 4_000_000)))
    for (let i = 1; i <= steps; i++) {
      await delay(100)
      if (req.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      req.onProgress?.({ loaded: Math.round((total * i) / steps), total })
    }
    const u = new URL(req.url)
    const res = toResponse(() =>
      handle({
        method: 'POST',
        path: u.pathname,
        query: u.searchParams,
        body: file instanceof File ? { name: file.name, size: file.size } : {},
        headers: new Headers(req.headers),
      }),
    )
    return { status: res.status === 200 ? 202 : res.status, text: await res.text() }
  })
  console.info('%c[EcoNet] Mode démo : API simulée en mémoire', 'color:#2f7a5c;font-weight:bold')
}
