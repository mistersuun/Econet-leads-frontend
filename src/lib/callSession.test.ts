import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SESSION_FILTERS,
  createSession,
  endSession,
  formatClock,
  formatDuration,
  pauseSession,
  recordCall,
  recordSkip,
  resumeSession,
  sessionElapsedSeconds,
  sessionQueueParams,
  sessionSummaryText,
  summarizeSession,
  type CallSession,
} from './callSession'

const T0 = 1_760_000_000_000

function withCalls(outcomes: { o: CallSession['calls'][number]['outcome']; d?: number | null }[]): CallSession {
  let s = createSession(DEFAULT_SESSION_FILTERS, 10, 3, T0)
  outcomes.forEach((x, i) => {
    s = recordCall(s, { leadId: `l${i}`, leadName: `Lead ${i}`, outcome: x.o, durationSeconds: x.d ?? null, at: T0 + i * 60_000 })
  })
  return s
}

describe('summarizeSession', () => {
  it('counts dials, connects, conversations, positives and the outcome mix', () => {
    const s = withCalls([
      { o: 'NO_ANSWER', d: 12 },
      { o: 'VOICEMAIL' },
      { o: 'INTERESTED', d: 240 },
      { o: 'QUOTE_SENT', d: 180 },
      { o: 'CALLBACK', d: 60 },
      { o: 'WON', d: 300 },
      { o: 'WRONG_NUMBER' },
      { o: 'NOT_INTERESTED', d: 45 },
    ])
    const sum = summarizeSession(s, T0 + 30 * 60_000)
    expect(sum.dials).toBe(8)
    expect(sum.connects).toBe(5) // everything but NO_ANSWER, VOICEMAIL, WRONG_NUMBER
    expect(sum.conversations).toBe(5) // INTERESTED, QUOTE_SENT, CALLBACK, WON, NOT_INTERESTED
    expect(sum.positive).toBe(3)
    expect(sum.won).toBe(1)
    expect(sum.outcomes[0]).toEqual({ outcome: 'NO_ANSWER', count: 1 }) // all ones: stable insertion order
    expect(sum.outcomes).toHaveLength(8)
    expect(sum.target).toBe(3)
  })

  it('averages only timed calls and finds the best positive streak', () => {
    const s = withCalls([
      { o: 'INTERESTED', d: 100 },
      { o: 'QUOTE_SENT', d: 200 },
      { o: 'NO_ANSWER' },
      { o: 'WON', d: 300 },
      { o: 'INTERESTED', d: 400 },
      { o: 'QUOTE_SENT', d: 0 },
    ])
    const sum = summarizeSession(s, T0 + 10 * 60_000)
    expect(sum.avgCallSeconds).toBe(250) // (100+200+300+400)/4, the 0 s call does not count
    expect(sum.bestPositiveStreak).toBe(3) // WON, INTERESTED, QUOTE_SENT
  })

  it('reports dials per hour once the session is long enough', () => {
    const s = withCalls([{ o: 'NO_ANSWER' }, { o: 'NO_ANSWER' }, { o: 'CALLBACK' }])
    expect(summarizeSession(s, T0 + 2 * 60_000).dialsPerHour).toBeNull()
    expect(summarizeSession(s, T0 + 30 * 60_000).dialsPerHour).toBe(6)
  })

  it('handles an empty session', () => {
    const sum = summarizeSession(createSession(DEFAULT_SESSION_FILTERS, 25, null, T0), T0 + 1000)
    expect(sum).toMatchObject({ dials: 0, connects: 0, conversations: 0, avgCallSeconds: null, bestPositiveStreak: 0, outcomes: [] })
  })
})

describe('pause / resume / end', () => {
  it('excludes paused time from the elapsed seconds', () => {
    let s = createSession(DEFAULT_SESSION_FILTERS, 10, null, T0)
    s = pauseSession(s, T0 + 60_000)
    expect(sessionElapsedSeconds(s, T0 + 5 * 60_000)).toBe(60)
    s = resumeSession(s, T0 + 4 * 60_000)
    expect(sessionElapsedSeconds(s, T0 + 5 * 60_000)).toBe(120)
    s = endSession(s, T0 + 6 * 60_000)
    expect(s.endedAt).toBe(T0 + 6 * 60_000)
    expect(sessionElapsedSeconds(s, T0 + 60 * 60_000)).toBe(180)
  })

  it('ending a paused session closes the pause first', () => {
    const s = endSession(pauseSession(createSession(DEFAULT_SESSION_FILTERS, 10, null, T0), T0 + 30_000), T0 + 90_000)
    expect(s.pausedAt).toBeNull()
    expect(sessionElapsedSeconds(s)).toBe(30)
  })

  it('records skips once', () => {
    const s = recordSkip(recordSkip(createSession(DEFAULT_SESSION_FILTERS, 10, null, T0), 'a'), 'a')
    expect(s.skippedIds).toEqual(['a'])
  })
})

describe('queue params and formatting', () => {
  it('maps session filters to the contract’s queue filters', () => {
    expect(sessionQueueParams({ size: 25, filters: { ...DEFAULT_SESSION_FILTERS, businessType: ['CPE'], scope: 'new', minQualityScore: 60 } })).toEqual({
      size: 25,
      businessType: ['CPE'],
      city: [],
      sourceIn: [],
      minQualityScore: 60,
      newOnly: true,
      followUpsOnly: false,
    })
  })

  it('formats clocks and durations in French', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(754)).toBe('12:34')
    expect(formatClock(3661)).toBe('1:01:01')
    expect(formatDuration(45)).toBe('45 s')
    expect(formatDuration(130)).toBe('2 min 10 s')
    expect(formatDuration(3900)).toBe('1 h 05')
  })

  it('produces a copyable summary', () => {
    const s = withCalls([{ o: 'WON', d: 300 }, { o: 'NO_ANSWER' }])
    const text = sessionSummaryText(summarizeSession(s, T0 + 20 * 60_000), T0)
    expect(text).toContain('Appels : 2 · joints : 1 · conversations : 1 / 3')
    expect(text).toContain('Contrat gagné : 1')
    expect(text).toContain('Durée moyenne d’appel : 5 min')
  })
})
