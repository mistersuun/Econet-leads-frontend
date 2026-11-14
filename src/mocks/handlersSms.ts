// Mock backend for owner alerts / SMS follow-ups (P2): integrations status, test alert, follow-up texts.
import type { IntegrationsStatus, SmsTemplateKey } from '../api/types'
import type { Db } from './db'
import { HttpError, type Req, type Result } from './http'
import type { MockUser } from './seed'
import { isoLocal, mockId } from './seed'

const STATUS: IntegrationsStatus = {
  smtp: true,
  sms: true,
  alertsPhone: true,
  alertsEmail: false,
  places: false,
  placesUsedToday: 0,
  placesDailyLimit: 100,
  googleReviewUrl: false,
  websiteDb: false,
  publicUrl: 'http://localhost:8080',
  crmUrl: 'http://localhost:5173',
}

const KEYS: SmsTemplateKey[] = ['missed_call', 'after_voicemail', 'quote_followup']
const FR: Record<SmsTemplateKey, string> = {
  missed_call: 'Bonjour, ici {callerName} de EcoNet Propreté. J’ai essayé de joindre {businessName} au sujet de l’entretien ménager. Rappelez-moi quand cela vous convient.',
  after_voicemail: 'Bonjour, ici {callerName} de EcoNet Propreté. Je vous ai laissé un message vocal au sujet de l’entretien ménager de {businessName}. Une évaluation gratuite et sans engagement vous intéresse?',
  quote_followup: 'Bonjour, ici {callerName} de EcoNet Propreté. Je fais suite à notre soumission pour {businessName}. Avez-vous des questions? Je suis disponible pour en discuter.',
}
const EN: Record<SmsTemplateKey, string> = {
  missed_call: 'Hello, this is {callerName} from EcoNet Propreté. I tried to reach {businessName} about commercial cleaning. Call me back whenever suits you.',
  after_voicemail: 'Hello, this is {callerName} from EcoNet Propreté. I left you a voicemail about cleaning for {businessName}. Would a free, no-obligation assessment interest you?',
  quote_followup: 'Hello, this is {callerName} from EcoNet Propreté. I’m following up on our quote for {businessName}. Any questions? I’m happy to go over it.',
}

function render(key: string, language: string, businessName: string, callerName: string): string {
  if (!KEYS.includes(key as SmsTemplateKey)) throw new HttpError(400, 'Modèle inconnu', { templateKey: 'Valeur inconnue' })
  const en = language === 'en'
  const text = (en ? EN : FR)[key as SmsTemplateKey].replace('{callerName}', callerName).replace('{businessName}', businessName)
  return `${text} ${en ? 'Reply STOP to opt out.' : 'Répondez STOP pour vous désabonner.'}`
}

const sentByUser = new Map<string, number[]>()

export function handleSms(req: Req, d: Db, user: MockUser, now: Date): Result | null {
  const { method, path } = req
  let m: RegExpExecArray | null
  if (path === '/api/integrations/status' && method === 'GET') {
    if (user.role === 'VIEWER') throw new HttpError(403, 'Accès refusé pour votre rôle')
    return { json: STATUS }
  }
  if (path === '/api/integrations/test-alert' && method === 'POST') {
    if (user.role !== 'ADMIN') throw new HttpError(403, 'Accès refusé pour votre rôle')
    return { json: { smsConfigured: true, smsTargets: 1, smsSent: 1, emailConfigured: STATUS.smtp, emailTargets: 0, emailSent: 0 } }
  }
  if ((m = /^\/api\/leads\/([^/]+)\/sms(\/preview)?$/.exec(path))) {
    if (user.role === 'VIEWER') throw new HttpError(403, 'Accès refusé pour votre rôle')
    const lead = d.leads.find((l) => l.id === m![1])
    if (!lead) throw new HttpError(404, 'Lead introuvable')
    if (m[2] && method === 'GET') {
      const language = req.query.get('language') ?? lead.qualification?.language ?? 'fr'
      return { json: { body: render(req.query.get('templateKey') ?? '', language, lead.businessName, user.username) } }
    }
    if (!m[2] && method === 'POST') {
      const b = (req.body ?? {}) as { templateKey?: string; language?: string; consent?: boolean }
      if (b.consent !== true) throw new HttpError(400, 'Le consentement du client est requis pour envoyer un texto')
      if (!lead.phone) throw new HttpError(400, 'Ce lead n’a pas de numéro de téléphone valide pour un texto')
      const body = render(b.templateKey ?? '', b.language ?? lead.qualification?.language ?? 'fr', lead.businessName, user.username)
      const recent = (sentByUser.get(user.userId) ?? []).filter((t) => t > now.getTime() - 3600_000)
      if (recent.length >= 20) throw new HttpError(429, 'Limite atteinte : au plus 20 textos par heure par utilisateur')
      recent.push(now.getTime())
      sentByUser.set(user.userId, recent)
      d.contacts.push({
        id: mockId('c'), businessId: lead.id, businessName: lead.businessName, contactDate: isoLocal(now), contactType: 'NOTE', contactStatus: 'SMS_SENT',
        contactPerson: null, notes: `Texto envoyé : ${body}\nConsentement verbal obtenu par ${user.username}`, nextAction: null, nextActionDate: null,
        userId: user.userId, username: user.username, outcome: null, createdAt: isoLocal(now), durationSeconds: null,
      })
      lead.lastContactedAt = isoLocal(now)
      lead.contactCount += 1
      lead.updatedAt = isoLocal(now)
      return { status: 201, json: { status: 'sent' } }
    }
  }
  return null
}
