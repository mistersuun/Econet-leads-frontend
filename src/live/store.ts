// Pure state for the live layer: who is online, and the last events worth
// showing. Kept as a reducer so it can be unit-tested without a browser.
import type { LiveEvent, PresenceUser } from '../api/types'

export const ACTIVITY_LIMIT = 50

/** Event kinds shown in the "En direct" feed. */
export type ActivityEvent = Extract<LiveEvent, { type: 'call.logged' | 'lead.claimed' | 'tender.updated' | 'lead.inbound' }>

export interface LiveState {
  connected: boolean
  presence: PresenceUser[]
  /** Newest first, capped at ACTIVITY_LIMIT. */
  activity: ActivityEvent[]
  /** Epoch ms of the last event received (heartbeats excluded). */
  lastEventAt: number | null
}

export const initialLiveState: LiveState = { connected: false, presence: [], activity: [], lastEventAt: null }

export type LiveAction = { kind: 'event'; event: LiveEvent } | { kind: 'connection'; connected: boolean } | { kind: 'reset' }

function isActivity(e: LiveEvent): e is ActivityEvent {
  return e.type === 'call.logged' || e.type === 'lead.claimed' || e.type === 'tender.updated' || e.type === 'lead.inbound'
}

function pushActivity(list: ActivityEvent[], e: ActivityEvent): ActivityEvent[] {
  // Replays after a reconnect can resend an id we already have.
  if (e.id && list.some((x) => x.id === e.id)) return list
  // The backend re-broadcasts lead.claimed when a claim is refreshed: show it once.
  if (e.type === 'lead.claimed' && list.some((x) => x.type === 'lead.claimed' && x.data.userId === e.data.userId && x.data.leadId === e.data.leadId)) return list
  return [e, ...list].slice(0, ACTIVITY_LIMIT)
}

function patchUser(presence: PresenceUser[], userId: string, patch: Partial<PresenceUser>): PresenceUser[] {
  if (!presence.some((u) => u.userId === userId)) return presence
  return presence.map((u) => (u.userId === userId ? { ...u, ...patch } : u))
}

export function liveReducer(state: LiveState, action: LiveAction): LiveState {
  switch (action.kind) {
    case 'reset':
      return initialLiveState
    case 'connection':
      return state.connected === action.connected ? state : { ...state, connected: action.connected }
    case 'event': {
      const e = action.event
      let next: LiveState = { ...state, lastEventAt: e.at }
      switch (e.type) {
        case 'presence':
          next = { ...next, presence: e.data.users }
          break
        case 'lead.claimed':
          // Presence usually follows, but derive it now so the sidebar never lags.
          next = {
            ...next,
            presence: patchUser(next.presence, e.data.userId, {
              status: 'calling',
              leadId: e.data.leadId,
              leadName: e.data.leadName,
              since: new Date(e.at).toISOString(),
            }),
          }
          break
        case 'lead.released':
          next = {
            ...next,
            presence: next.presence.map((u) =>
              u.userId === e.data.userId && u.leadId === e.data.leadId ? { ...u, status: 'idle', leadId: null, leadName: null } : u,
            ),
          }
          break
        case 'call.logged':
          next = {
            ...next,
            presence: next.presence.map((u) =>
              u.userId === e.data.userId && u.leadId === e.data.leadId ? { ...u, status: 'idle', leadId: null, leadName: null } : u,
            ),
          }
          break
        default:
          break
      }
      if (isActivity(e)) next = { ...next, activity: pushActivity(next.activity, e) }
      return next
    }
  }
}

/** Teammates other than `me`, online ones first, then by name. */
export function teammates(presence: PresenceUser[], me: string | null | undefined): PresenceUser[] {
  const rank = (s: PresenceUser['status']) => (s === 'calling' ? 0 : s === 'idle' ? 1 : 2)
  return presence
    .filter((u) => u.userId !== me)
    .sort((a, b) => rank(a.status) - rank(b.status) || a.username.localeCompare(b.username, 'fr'))
}

/** "en appel · CPE X" / "en ligne" / "hors ligne" */
export function presenceLabel(u: PresenceUser): string {
  if (u.status === 'calling') return u.leadName ? `en appel · ${u.leadName}` : 'en appel'
  if (u.status === 'idle') return 'en ligne'
  return 'hors ligne'
}
