// One EventSource on /api/events for the whole app. EventSource cannot send
// headers, so the access token travels as a query parameter (HTTPS only).
//
// Reconnection: the browser retries on its own after a network blip (the
// stream stays in CONNECTING and keeps the Last-Event-ID). When the server
// rejects the request (expired token → 401) the browser gives up (CLOSED); we
// then refresh the session and open a new stream with the fresh token, with an
// exponential backoff capped at 30 s. A stream stuck in CONNECTING for more
// than 30 s is also replaced, since its token may have expired meanwhile.
import { useEffect, useRef } from 'react'
import { API_URL, refreshSession } from '../api/client'
import { getSession, subscribeSession } from '../api/session'
import { LIVE_EVENT_TYPES, type LiveEvent, type LiveEventType } from '../api/types'

const MAX_BACKOFF_MS = 30_000
const STUCK_CONNECTING_MS = 30_000

export function eventsUrl(token: string): string {
  return `${API_URL}/api/events?token=${encodeURIComponent(token)}`
}

export function parseLiveEvent(type: string, raw: string, lastEventId: string, at = Date.now()): LiveEvent | null {
  if (!(LIVE_EVENT_TYPES as readonly string[]).includes(type)) return null
  try {
    const data = JSON.parse(raw) as LiveEvent['data']
    return { type: type as LiveEventType, data, id: lastEventId, at } as LiveEvent
  } catch {
    return null
  }
}

interface Handlers {
  onEvent: (e: LiveEvent) => void
  onConnection: (connected: boolean) => void
}

export function useEventSource(enabled: boolean, handlers: Handlers): void {
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return
    let es: EventSource | null = null
    let attempts = 0
    let stopped = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let stuckTimer: ReturnType<typeof setTimeout> | null = null

    const clearTimers = () => {
      if (retryTimer) clearTimeout(retryTimer)
      if (stuckTimer) clearTimeout(stuckTimer)
      retryTimer = stuckTimer = null
    }

    const close = () => {
      if (es) {
        es.close()
        es = null
      }
      latest.current.onConnection(false)
    }

    const scheduleReconnect = (refresh: boolean) => {
      if (stopped || retryTimer) return
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempts)
      attempts++
      retryTimer = setTimeout(async () => {
        retryTimer = null
        if (stopped) return
        if (refresh) await refreshSession()
        if (!stopped) connect()
      }, delay)
    }

    const connect = () => {
      const token = getSession()?.accessToken
      if (!token || stopped) return
      close()
      const source = new EventSource(eventsUrl(token))
      es = source
      source.onopen = () => {
        attempts = 0
        if (stuckTimer) clearTimeout(stuckTimer)
        stuckTimer = null
        latest.current.onConnection(true)
      }
      for (const type of LIVE_EVENT_TYPES) {
        source.addEventListener(type, (ev) => {
          const msg = ev as MessageEvent<string>
          const parsed = parseLiveEvent(type, msg.data, msg.lastEventId)
          if (parsed) latest.current.onEvent(parsed)
        })
      }
      source.onerror = () => {
        if (stopped || es !== source) return
        latest.current.onConnection(false)
        if (source.readyState === EventSource.CLOSED) {
          // Server refused (most likely an expired token): refresh, then reopen.
          es = null
          scheduleReconnect(true)
        } else if (!stuckTimer) {
          // Browser is retrying by itself; give it a while, then start over with a fresh token.
          stuckTimer = setTimeout(() => {
            stuckTimer = null
            if (stopped || es !== source) return
            close()
            scheduleReconnect(true)
          }, STUCK_CONNECTING_MS)
        }
      }
    }

    connect()
    const unsubscribe = subscribeSession((session) => {
      if (!session) {
        stopped = true
        clearTimers()
        close()
      }
    })
    const onVisible = () => {
      // Coming back to a backgrounded tab: make sure the stream is alive.
      if (document.visibilityState === 'visible' && !stopped && (!es || es.readyState === EventSource.CLOSED)) {
        attempts = 0
        void refreshSession().then(() => connect())
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      stopped = true
      clearTimers()
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
      close()
    }
  }, [enabled])
}
