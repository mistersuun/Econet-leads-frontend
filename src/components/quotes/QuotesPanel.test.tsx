// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSessionCache, setSession } from '../../api/session'
import type { BusinessDTO, Quote } from '../../api/types'
import { ToastProvider } from '../Toast'
import { QuotesPanel } from './QuotesPanel'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const lead = { id: 'l1', businessName: 'Clinique Soleil', email: 'client@example.com', qualification: null } as unknown as BusinessDTO
const quote = (over: Partial<Quote>): Quote => ({
  id: 'q1',
  leadId: 'l1',
  number: 'Q-2026-0001',
  language: 'fr',
  input: {},
  lines: [],
  subtotal: 128,
  tax: 19,
  total: 147,
  status: 'draft',
  validUntil: '2026-12-14',
  publicUrl: 'https://api.test/public/quotes/abc',
  pdfUrl: 'https://api.test/public/quotes/abc/pdf',
  createdAt: '2026-11-14T10:00:00',
  ...over,
})
const estimate = {
  service: 'commercial', basePrice: 200, area: '800_1500', areaMultiplier: 1.25, propertyType: 'office', propertyTypeMultiplier: 1, frequency: 'weekly',
  discountRate: 0.15, addOns: [], addOnsTotal: 0, servicePrice: 250, discountAmount: 38, subtotal: 212, taxes: 32, total: 244, currency: 'CAD', requiresQuote: false,
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('QuotesPanel', () => {
  let root: Root
  let host: HTMLDivElement
  const fetchMock = vi.fn<typeof fetch>()
  let quotes: Quote[]
  let smtp: boolean

  beforeEach(() => {
    localStorage.clear()
    resetSessionCache()
    setSession({ accessToken: 'a', refreshToken: 'r', user: { userId: 'u1', username: 'marie', email: 'm@econet.ca', role: 'USER' } })
    quotes = [quote({ status: 'accepted', acceptedName: 'Marie Tremblay', acceptedAt: '2026-11-14T11:00:00' }), quote({ id: 'q2', number: 'Q-2026-0002' })]
    smtp = true
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url.endsWith('/api/leads/l1/quotes') && method === 'GET') return json(200, quotes)
      if (url.endsWith('/api/leads/l1/quotes') && method === 'POST') return json(201, quote({ id: 'q3', number: 'Q-2026-0003' }))
      if (url.endsWith('/api/email/status')) return json(200, { configured: smtp, from: 'ventes@econet.ca', fromName: 'EcoNet', rateLimitPerHour: 20 })
      if (url.endsWith('/api/pricing/estimate')) return json(200, estimate)
      if (url.endsWith('/api/quotes/q2/send') && method === 'POST') return json(200, quote({ id: 'q2', number: 'Q-2026-0002', status: 'sent' }))
      return json(404, { error: 'not found' })
    })
    vi.stubGlobal('fetch', fetchMock)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  const mount = async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <ToastProvider>
            <QuotesPanel lead={lead} canEdit />
          </ToastProvider>
        </QueryClientProvider>,
      )
    })
    await flush()
  }
  const button = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined
  const click = (el: Element | undefined) => act(async () => { el!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

  it('lists quotes with their status and who accepted', async () => {
    await mount()
    expect(host.textContent).toContain('Q-2026-0001')
    expect(host.textContent).toContain('Acceptée')
    expect(host.textContent).toContain('Acceptée par Marie Tremblay')
    expect(host.textContent).toContain('Brouillon')
    // the accepted quote cannot be sent again, the draft can
    expect([...host.querySelectorAll('button')].filter((b) => b.textContent?.includes('Envoyer')).length).toBe(1)
  })

  it('creates a quote from the estimate with the chosen language', async () => {
    await mount()
    await click(button('Nouvelle soumission'))
    await flush()
    expect(host.textContent).toContain('244')
    await click(button('EN'))
    await click(button('Créer la soumission'))
    await flush()
    const post = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith('/api/leads/l1/quotes') && i?.method === 'POST')
    expect(post).toBeTruthy()
    expect(JSON.parse(String(post![1]!.body))).toEqual({
      estimate: { service: 'commercial', area: '800_1500', propertyType: 'office', addOnIds: [], frequency: 'weekly' },
      language: 'en',
    })
    expect(document.body.textContent).toContain('Soumission Q-2026-0003 créée')
  })

  it('sends a quote to the lead email, and disables sending without SMTP', async () => {
    await mount()
    await click([...host.querySelectorAll('button')].find((b) => b.textContent?.trim().endsWith('Envoyer')))
    const email = host.querySelector('input[type="email"]') as HTMLInputElement
    expect(email.value).toBe('client@example.com')
    await act(async () => {
      host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await flush()
    const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/api/quotes/q2/send'))
    expect(JSON.parse(String(call![1]!.body))).toEqual({ to: 'client@example.com' })
    expect(document.body.textContent).toContain('Soumission Q-2026-0002 envoyée')

    act(() => root.unmount())
    root = createRoot(host)
    smtp = false
    await mount()
    expect(host.textContent).toContain('SMTP_HOST')
    expect([...host.querySelectorAll('button')].find((b) => b.textContent?.trim().endsWith('Envoyer'))!.disabled).toBe(true)
  })
})
