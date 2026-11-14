// Mock routes for the faster-calls package: preferences and the weekly coaching email.
import type { WeeklyReportPreview } from '../api/types'
import type { Db } from './db'
import { parseLocal } from './db'
import { HttpError, type Req, type Result } from './http'
import type { MockUser } from './seed'

const weeklyReport = new Map<string, boolean>()

function lastWeek(now: Date): [Date, Date] {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const start = new Date(monday)
  start.setDate(start.getDate() - 7)
  return [start, monday]
}

function preview(d: Db, user: MockUser, now: Date): WeeklyReportPreview {
  const [from, to] = lastWeek(now)
  const mine = d.contacts.filter((c) => c.contactType === 'APPEL' && c.userId === user.userId && parseLocal(c.contactDate) >= from && parseLocal(c.contactDate) < to)
  const conv = mine.filter((c) => ['INTERESTED', 'QUOTE_SENT', 'WON', 'NOT_INTERESTED', 'CALLBACK'].includes(String(c.outcome))).length
  const counts = new Map<string, number>()
  for (const c of mine) for (const o of c.objections ?? []) counts.set(o, (counts.get(o) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  const lines = [
    `Bonjour ${user.username},`,
    '',
    'Voici votre semaine.',
    '',
    `- Appels : ${mine.length}`,
    `- Conversations : ${conv}`,
    ...(top.length ? ['', 'Objections les plus entendues :', ...top.map(([o, n]) => `- ${o} (${n} fois)`)] : []),
    '',
    'Ouvrir le CRM : http://localhost:5173/call',
  ]
  const text = lines.join('\n')
  return { subject: `Votre semaine chez EcoNet Propreté : ${mine.length} appels, ${conv} conversations`, text, html: `<pre>${text}</pre>` }
}

export function handleP4(req: Req, d: Db, user: MockUser, now: Date): Result | null {
  const { method, path } = req
  if (path === '/api/me/preferences' && method === 'GET') return { json: { weeklyReport: weeklyReport.get(user.userId) ?? true } }
  if (path === '/api/me/preferences' && method === 'PUT') {
    if (user.role === 'VIEWER') throw new HttpError(403, 'Accès refusé pour votre rôle')
    const b = (req.body ?? {}) as { weeklyReport?: unknown }
    if (typeof b.weeklyReport !== 'boolean') throw new HttpError(400, 'weeklyReport requis', { weeklyReport: 'Requis' })
    weeklyReport.set(user.userId, b.weeklyReport)
    return { json: { weeklyReport: b.weeklyReport } }
  }
  if (path === '/api/reports/weekly/preview' && method === 'POST') {
    if (user.role === 'VIEWER') throw new HttpError(403, 'Accès refusé pour votre rôle')
    return { json: preview(d, user, now) }
  }
  if (path === '/api/reports/weekly/send-now' && method === 'POST') {
    if (user.role !== 'ADMIN') throw new HttpError(403, 'Accès refusé pour votre rôle')
    return { status: 202, json: { status: 'queued' } }
  }
  return null
}
