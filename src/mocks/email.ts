// Mock rendering of email templates: placeholders, itemised estimate block,
// long-form visit date. Mirrors what the backend's mail service produces.
import type { BusinessDTO, EmailTemplate, Estimate, ScriptLanguage, SendEmailRequest } from '../api/types'
import { substitutePlaceholders } from '../lib/placeholders'
import { estimatePrice } from './pricing'

const SERVICE_LABEL: Record<ScriptLanguage, Record<string, string>> = {
  fr: { residential: 'Entretien résidentiel', commercial: 'Entretien commercial', deep_cleaning: 'Grand ménage', post_construction: 'Après construction' },
  en: { residential: 'Residential cleaning', commercial: 'Commercial cleaning', deep_cleaning: 'Deep cleaning', post_construction: 'Post-construction' },
}
const AREA_LABEL: Record<ScriptLanguage, Record<string, string>> = {
  fr: { under_800: 'moins de 800 pi²', '800_1500': '800 à 1 500 pi²', '1500_2500': '1 500 à 2 500 pi²', over_2500: 'plus de 2 500 pi²' },
  en: { under_800: 'under 800 sq ft', '800_1500': '800 to 1,500 sq ft', '1500_2500': '1,500 to 2,500 sq ft', over_2500: 'over 2,500 sq ft' },
}
const FREQ_LABEL: Record<ScriptLanguage, Record<string, string>> = {
  fr: { 'one-time': 'une fois', weekly: 'hebdomadaire', 'bi-weekly': 'aux deux semaines', monthly: 'mensuel' },
  en: { 'one-time': 'one-time', weekly: 'weekly', 'bi-weekly': 'bi-weekly', monthly: 'monthly' },
}

const money = (n: number, lang: ScriptLanguage) =>
  new Intl.NumberFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n)

export function estimateText(input: NonNullable<SendEmailRequest['estimate']>, lang: ScriptLanguage): { text: string; estimate: Estimate } {
  const e = estimatePrice(input)
  const L = lang
  const lines: string[] = []
  const service = input.service ? SERVICE_LABEL[L][input.service] ?? input.service : 'Service'
  const m = (n: number | null) => (n === null ? '—' : money(n, L))
  lines.push(`${service}${input.area ? ` (${AREA_LABEL[L][input.area] ?? input.area})` : ''} : ${m(e.basePrice)}`)
  if (e.servicePrice !== null && e.servicePrice !== e.basePrice) lines.push(`${L === 'fr' ? 'Service ajusté (superficie, type)' : 'Adjusted service (area, type)'} : ${m(e.servicePrice)}`)
  for (const a of e.addOns) lines.push(`${L === 'fr' ? a.labelFr : a.labelEn} : ${money(a.price, L)}`)
  if (e.discountRate) lines.push(`${L === 'fr' ? 'Rabais fréquence' : 'Frequency discount'} (${FREQ_LABEL[L][input.frequency] ?? input.frequency}, ${Math.round(e.discountRate * 100)} %) : ${e.discountAmount === null ? '—' : '−' + money(e.discountAmount, L)}`)
  lines.push(`${L === 'fr' ? 'Sous-total' : 'Subtotal'} : ${m(e.subtotal)}`)
  lines.push(`${L === 'fr' ? 'Taxes (TPS + TVQ)' : 'Taxes (GST + QST)'} : ${m(e.taxes)}`)
  lines.push(`${L === 'fr' ? 'Total par visite' : 'Total per visit'} : ${m(e.total)}`)
  if (e.requiresQuote) lines.push(L === 'fr' ? 'Superficie de plus de 2 500 pi² : prix confirmé après visite.' : 'Over 2,500 sq ft: price confirmed after a visit.')
  return { text: lines.join('\n') + '\n', estimate: e }
}

export function visitAtText(iso: string, lang: ScriptLanguage): string {
  const [d, t = '00:00'] = iso.split('T')
  const [y, m, day] = d.split('-').map(Number)
  const [hh, mm] = t.split(':').map(Number)
  const date = new Date(y, m - 1, day, hh, mm)
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', { dateStyle: 'full', timeStyle: 'short' }).format(date)
}

export function renderEmail(
  template: EmailTemplate,
  lead: BusinessDTO,
  callerName: string,
  req: SendEmailRequest,
): { subject: string; body: string } {
  const lang = template.language
  const values = {
    businessName: lead.businessName,
    city: lead.addressCity ?? '',
    decisionMaker: lead.qualification?.decisionMaker ?? '',
    callerName,
    companyName: 'EcoNet Propreté',
    estimate: req.estimate ? estimateText(req.estimate, lang).text : '',
    visitAt: req.visitAt ? visitAtText(req.visitAt, lang) : '',
    extraNote: req.extraNote?.trim() ? `${req.extraNote.trim()}\n` : '',
  }
  const fallbacks = { decisionMaker: lang === 'fr' ? 'madame, monsieur' : 'there', estimate: '', visitAt: lang === 'fr' ? '(date à confirmer)' : '(date to be confirmed)', extraNote: '' }
  const subject = substitutePlaceholders(template.subject, values, fallbacks).replace(/\s+/g, ' ').trim()
  const body = substitutePlaceholders(template.body, values, fallbacks)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { subject, body }
}
