import type { TodayStats } from '../../api/types'
import { Skeleton } from '../States'
import './today-ring.css'

function ordinal(n: number) {
  return n === 1 ? '1er' : `${n}e`
}

/** Calls vs target as a ring, plus conversations, streak and rank. */
export function TodayRing({ stats, size = 56 }: { stats: TodayStats | undefined; size?: number }) {
  if (!stats) {
    return (
      <div className="today">
        <Skeleton height={size} width={size} style={{ borderRadius: '50%' }} />
        <div className="today-text">
          <Skeleton height={14} width={120} />
          <Skeleton height={12} width={90} />
        </div>
      </div>
    )
  }
  const r = (size - 6) / 2
  const c = 2 * Math.PI * r
  const ratio = stats.callTarget > 0 ? Math.min(1, stats.callsToday / stats.callTarget) : 0
  const convRatio = stats.conversationTarget > 0 ? Math.min(1, stats.conversationsToday / stats.conversationTarget) : 0
  const done = ratio >= 1
  const bits: string[] = []
  if (stats.streakDays > 1) bits.push(`${stats.streakDays} jours d’affilée`)
  if (stats.rankToday.of > 1) bits.push(`${ordinal(stats.rankToday.position)} sur ${stats.rankToday.of}`)
  if (stats.wonToday > 0) bits.push(`${stats.wonToday} gagné${stats.wonToday > 1 ? 's' : ''}`)
  return (
    <div className="today" title={`Aujourd’hui : ${stats.callsToday} appels sur ${stats.callTarget}, ${stats.conversationsToday} conversations sur ${stats.conversationTarget}. Meilleure journée : ${stats.bestDayCalls} appels.`}>
      <svg className="today-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${stats.callsToday} appels sur ${stats.callTarget}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-strong)" strokeWidth={5} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={done ? 'var(--green-strong)' : 'var(--deep)'}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.4s' }}
        />
        <text x="50%" y="50%" dy="0.36em" textAnchor="middle" className="today-ring-num">
          {stats.callsToday}
        </text>
      </svg>
      <div className="today-text">
        <div className="today-line">
          <strong className="num">{stats.callsToday}</strong>
          <span className="muted"> / {stats.callTarget} appels</span>
          <span className="today-sep" aria-hidden="true" />
          <strong className="num">{stats.conversationsToday}</strong>
          <span className="muted"> / {stats.conversationTarget} conv.</span>
          <span className="today-mini" aria-hidden="true">
            <span style={{ width: `${convRatio * 100}%` }} />
          </span>
        </div>
        <div className="today-meta xs muted">{bits.length ? bits.join(' · ') : 'Première journée d’appels'}</div>
      </div>
    </div>
  )
}
