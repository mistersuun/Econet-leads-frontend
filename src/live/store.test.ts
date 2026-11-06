import { describe, expect, it } from 'vitest'
import type { LiveEvent, PresenceUser } from '../api/types'
import { ACTIVITY_LIMIT, initialLiveState, liveReducer, presenceLabel, teammates, type LiveAction, type LiveState } from './store'

const marie: PresenceUser = { userId: 'u2', username: 'marie.lavoie', status: 'idle', since: '2026-10-05T09:00:00' }
const julien: PresenceUser = { userId: 'u3', username: 'julien.roy', status: 'offline', since: '2026-10-04T16:00:00' }
const me: PresenceUser = { userId: 'u1', username: 'admin', status: 'idle', since: '2026-10-05T09:00:00' }

let n = 0
const ev = <T extends LiveEvent['type']>(type: T, data: Extract<LiveEvent, { type: T }>['data'], id = String(++n)): LiveAction => ({
  kind: 'event',
  event: { type, data, id, at: 1_760_000_000_000 + n * 1000 } as LiveEvent,
})

const claimed = (id = String(++n)) => ev('lead.claimed', { leadId: 'l1', leadName: 'CPE Les Lucioles', userId: 'u2', username: 'marie.lavoie', expiresAt: '2026-10-05T10:10:00' }, id)
const logged = (id = String(++n)) =>
  ev('call.logged', { contactId: 'c1', leadId: 'l1', leadName: 'CPE Les Lucioles', userId: 'u2', username: 'marie.lavoie', outcome: 'INTERESTED', durationSeconds: 180, at: '2026-10-05T10:03:00' }, id)

describe('liveReducer', () => {
  it('shows a refreshed claim (same user and lead, new id) once in the feed', () => {
    let s = liveReducer(initialLiveState, claimed())
    s = liveReducer(s, claimed())
    expect(s.activity).toHaveLength(1)
  })

  it('tracks the connection flag without churning state', () => {
    const s1 = liveReducer(initialLiveState, { kind: 'connection', connected: true })
    expect(s1.connected).toBe(true)
    expect(liveReducer(s1, { kind: 'connection', connected: true })).toBe(s1)
  })

  it('replaces presence on a presence event', () => {
    const s = liveReducer(initialLiveState, ev('presence', { users: [me, marie, julien] }))
    expect(s.presence).toHaveLength(3)
    expect(s.lastEventAt).toBeGreaterThan(0)
  })

  it('derives "calling" from lead.claimed and back to idle on call.logged', () => {
    let s: LiveState = liveReducer(initialLiveState, ev('presence', { users: [me, marie] }))
    s = liveReducer(s, claimed())
    const m = s.presence.find((u) => u.userId === 'u2')!
    expect(m.status).toBe('calling')
    expect(m.leadName).toBe('CPE Les Lucioles')
    expect(presenceLabel(m)).toBe('en appel · CPE Les Lucioles')
    s = liveReducer(s, logged())
    expect(s.presence.find((u) => u.userId === 'u2')).toMatchObject({ status: 'idle', leadId: null, leadName: null })
    expect(s.activity.map((e) => e.type)).toEqual(['call.logged', 'lead.claimed'])
  })

  it('lead.released only clears the matching lead', () => {
    let s: LiveState = liveReducer(initialLiveState, ev('presence', { users: [marie] }))
    s = liveReducer(s, claimed())
    s = liveReducer(s, ev('lead.released', { leadId: 'other', userId: 'u2' }))
    expect(s.presence[0].status).toBe('calling')
    s = liveReducer(s, ev('lead.released', { leadId: 'l1', userId: 'u2' }))
    expect(s.presence[0].status).toBe('idle')
  })

  it('keeps the newest 50 activity items, newest first, and ignores replayed ids', () => {
    let s: LiveState = initialLiveState
    for (let i = 0; i < 60; i++) s = liveReducer(s, logged(`id-${i}`))
    expect(s.activity).toHaveLength(ACTIVITY_LIMIT)
    expect(s.activity[0].id).toBe('id-59')
    expect(s.activity[ACTIVITY_LIMIT - 1].id).toBe('id-10')
    const again = liveReducer(s, logged('id-59'))
    expect(again.activity).toHaveLength(ACTIVITY_LIMIT)
  })

  it('does not put presence, lead.updated or target.progress in the feed', () => {
    let s: LiveState = liveReducer(initialLiveState, ev('lead.updated', { leadId: 'l1', leadStatus: 'CONTACTED', nextFollowUpAt: null }))
    s = liveReducer(s, ev('target.progress', { userId: 'u2', callsToday: 3, conversationsToday: 1, target: 40 }))
    s = liveReducer(s, ev('tender.updated', { tenderId: 't1', status: 'BIDDING' }))
    expect(s.activity.map((e) => e.type)).toEqual(['tender.updated'])
  })

  it('puts website requests in the feed', () => {
    const s = liveReducer(initialLiveState, ev('lead.inbound', { leadId: 'l9', leadName: 'Marie Tremblay', kind: 'booking', at: '2026-10-05T10:05:00' }, '9'))
    expect(s.activity.map((e) => e.type)).toEqual(['lead.inbound'])
  })

  it('reset clears everything', () => {
    const s = liveReducer(liveReducer(initialLiveState, claimed()), { kind: 'reset' })
    expect(s).toEqual(initialLiveState)
  })
})

describe('teammates', () => {
  it('excludes me and orders calling, idle, offline', () => {
    const list = teammates([julien, me, { ...marie, status: 'calling' }], 'u1')
    expect(list.map((u) => u.username)).toEqual(['marie.lavoie', 'julien.roy'])
    expect(presenceLabel(julien)).toBe('hors ligne')
    expect(presenceLabel(marie)).toBe('en ligne')
  })
})
