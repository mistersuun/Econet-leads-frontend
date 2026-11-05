import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { LiveEvent, TodayStats } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { initialLiveState, liveReducer, type LiveState } from './store'
import { useEventSource } from './useEventSource'

type Listener = (e: LiveEvent) => void

interface LiveContextValue {
  state: LiveState
  subscribe: (fn: Listener) => () => void
}

const LiveContext = createContext<LiveContextValue | null>(null)

export function LiveProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [state, dispatch] = useReducer(liveReducer, initialLiveState)
  const listeners = useRef(new Set<Listener>())

  const onEvent = useCallback((e: LiveEvent) => {
    dispatch({ kind: 'event', event: e })
    listeners.current.forEach((fn) => {
      try {
        fn(e)
      } catch (err) {
        console.error('[live] listener failed', err)
      }
    })
  }, [])
  const onConnection = useCallback((connected: boolean) => dispatch({ kind: 'connection', connected }), [])

  useEventSource(!!user, { onEvent, onConnection })

  useEffect(() => {
    if (!user) dispatch({ kind: 'reset' })
  }, [user])

  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn)
    return () => {
      listeners.current.delete(fn)
    }
  }, [])

  const value = useMemo(() => ({ state, subscribe }), [state, subscribe])
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLive(): LiveState {
  const ctx = useContext(LiveContext)
  if (!ctx) throw new Error('useLive must be used inside <LiveProvider>')
  return ctx.state
}

/** Run `handler` for every live event while the component is mounted (always the latest handler). */
// eslint-disable-next-line react-refresh/only-export-components
export function useLiveEvent(handler: Listener): void {
  const ctx = useContext(LiveContext)
  if (!ctx) throw new Error('useLiveEvent must be used inside <LiveProvider>')
  const latest = useRef(handler)
  useEffect(() => {
    latest.current = handler
  })
  useEffect(() => ctx.subscribe((e) => latest.current(e)), [ctx])
}

/**
 * Keep TanStack Query in step with the team: invalidate what an event makes
 * stale, and patch today's numbers in place so the ring moves without a refetch.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useLiveInvalidate(): void {
  const qc = useQueryClient()
  const { user } = useAuth()
  const me = user?.userId
  useLiveEvent((e) => {
    const invalidate = (...keys: unknown[][]) => keys.forEach((key) => void qc.invalidateQueries({ queryKey: key }))
    switch (e.type) {
      case 'call.logged':
        invalidate(
          ['summary'],
          ['activity'],
          ['outcomes'],
          ['leaderboard'],
          ['funnel'],
          ['best-hours'],
          ['team-today'],
          ['conversion-by-type'],
          ['contacts', e.data.leadId],
          ['followups'],
          ['pipeline'],
        )
        if (e.data.userId !== me) invalidate(['queue'])
        break
      case 'lead.updated':
        invalidate(['lead', e.data.leadId], ['leads'], ['followups'], ['pipeline'], ['notifications'], ['summary'])
        break
      case 'lead.claimed':
      case 'lead.released':
        invalidate(['team-today'])
        break
      case 'target.progress':
        if (e.data.userId === me) {
          qc.setQueryData<TodayStats>(['today', 'me'], (old) =>
            old
              ? {
                  ...old,
                  callsToday: e.data.callsToday,
                  conversationsToday: e.data.conversationsToday,
                  callTarget: e.data.target || old.callTarget,
                  conversationTarget: e.data.conversationTarget ?? old.conversationTarget,
                }
              : old,
          )
          invalidate(['today'])
        }
        invalidate(['team-today'])
        break
      case 'tender.updated':
        invalidate(['tenders'], ['tender-summary'], ['tender', e.data.tenderId], ['notifications'])
        break
      default:
        break
    }
  })
}
