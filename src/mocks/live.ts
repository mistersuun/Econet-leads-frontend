// Fake server-sent events for mock mode: an EventSource replacement for
// `${API_URL}/api/events`, plus the bus the mock handlers broadcast on.
import type { LiveEventMap, LiveEventType } from '../api/types'

type Listener = (type: string, data: unknown, id: string) => void
const sources = new Set<MockEventSource>()
let nextId = 1

export interface LiveHooks {
  /** A client connected: send it the current presence, start the simulation. */
  onOpen: (userId: string, send: (type: LiveEventType, data: unknown) => void) => void
  onClose: (userId: string) => void
  /** Token check shared with the HTTP mock: returns the userId or null. */
  authenticate: (token: string) => string | null
}

let hooks: LiveHooks | null = null
export function setLiveHooks(h: LiveHooks): void {
  hooks = h
}

/** Broadcast an event to every open stream (the mock equivalent of the server's emitter list). */
export function emit<K extends LiveEventType>(type: K, data: LiveEventMap[K]): void {
  const id = String(nextId++)
  for (const s of sources) s.deliver(type, data, id)
}

export function openStreams(): number {
  return sources.size
}

class MockEventSource extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSED = 2
  readonly url: string
  readonly withCredentials = false
  readyState = 0
  onopen: ((ev: Event) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  private userId: string | null = null
  private expiryTimer: ReturnType<typeof setTimeout> | null = null
  private listener: Listener | null = null

  constructor(url: string) {
    super()
    this.url = url
    const token = new URL(url).searchParams.get('token') ?? ''
    const m = /^mock-access\.([^.]+)\.(\d+)$/.exec(token)
    const userId = hooks?.authenticate(token) ?? null
    if (!userId || !m) {
      // 401: the browser fails the connection and does not retry.
      setTimeout(() => this.fail(), 60)
      return
    }
    this.userId = userId
    const expiresIn = Number(m[2]) - Date.now()
    setTimeout(() => {
      if (this.readyState === 2) return
      this.readyState = 1
      sources.add(this)
      const ev = new Event('open')
      this.onopen?.(ev)
      this.dispatchEvent(ev)
      hooks?.onOpen(userId, (type, data) => this.deliver(type, data, String(nextId++)))
    }, 80)
    // The server closes the stream when the token expires; the client refreshes and reconnects.
    this.expiryTimer = setTimeout(() => this.fail(), Math.max(1000, expiresIn))
  }

  private fail() {
    if (this.readyState === 2) return
    this.close()
    const ev = new Event('error')
    this.onerror?.(ev)
    this.dispatchEvent(ev)
  }

  deliver(type: string, data: unknown, id: string) {
    if (this.readyState !== 1) return
    const ev = new MessageEvent(type, { data: JSON.stringify(data), lastEventId: id })
    this.dispatchEvent(ev)
    this.listener?.(type, data, id)
  }

  close() {
    const wasOpen = sources.delete(this)
    this.readyState = 2
    if (this.expiryTimer) clearTimeout(this.expiryTimer)
    if (wasOpen && this.userId) hooks?.onClose(this.userId)
  }
}

/** Replace window.EventSource for the mock API prefix; other URLs keep the real one. */
export function installMockEventSource(prefix: string): void {
  const Real = window.EventSource
  function Wrapper(this: unknown, url: string | URL, init?: EventSourceInit) {
    const u = typeof url === 'string' ? url : url.href
    if (u.startsWith(prefix)) return new MockEventSource(u)
    return new Real(u, init)
  }
  Wrapper.CONNECTING = 0
  Wrapper.OPEN = 1
  Wrapper.CLOSED = 2
  Wrapper.prototype = MockEventSource.prototype
  window.EventSource = Wrapper as unknown as typeof EventSource
}
