// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { AuthProvider } from '../auth/AuthContext'
import { resetSessionCache, setSession } from '../api/session'
import type { ClientDTO } from '../api/types'
import ClientsPage from './ClientsPage'
import ClientDetailDrawer from './ClientDetailDrawer'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const user = { userId: 'u1', username: 'marie', email: 'marie@econet.ca', role: 'USER' as const }
const day = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const client = (over: Partial<ClientDTO>): ClientDTO => ({
  id: 'c1', businessId: 'b1', businessName: 'CPE Soleil', city: 'Laval', phone: '4505550101', email: 'cpe@example.com',
  service: 'Entretien ménager', frequency: 'weekly', pricePerVisit: 100, monthlyValue: 433.33, startDate: '2026-01-05',
  contractEndDate: null, nextVisitAt: null, status: 'active', firstCleaningDoneAt: null, reviewRequestedAt: null, notes: null,
  createdAt: '2026-01-05T10:00:00', updatedAt: '2026-01-05T10:00:00', ...over,
})
const clients: ClientDTO[] = [
  client({}),
  client({ id: 'c2', businessId: 'b2', businessName: 'Resto Bleu', frequency: 'monthly', pricePerVisit: 90, monthlyValue: 90, contractEndDate: day(12) }),
  client({ id: 'c3', businessId: 'b3', businessName: 'Bureau Gris', status: 'paused', monthlyValue: 0, frequency: 'one-time' }),
]
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })

describe('ClientsPage', () => {
  let root: Root
  let host: HTMLDivElement
  let reviewConfig = { googleReviewUrl: true, smtp: true }

  beforeEach(() => {
    localStorage.clear()
    resetSessionCache()
    setSession({ accessToken: 'a', refreshToken: 'r', user })
    reviewConfig = { googleReviewUrl: true, smtp: true }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/dashboard/clients')) return json(200, { active: 2, monthlyRecurringRevenue: 523.33, renewalsNext30Days: 1, reviewsPending: 0 })
      if (url.includes('/api/clients/review-config')) return json(200, reviewConfig)
      const one = /\/api\/clients\/([^/?]+)$/.exec(url)
      if (one) return json(200, clients.find((c) => c.id === one[1]) ?? clients[0])
      if (url.includes('/api/clients')) return json(200, clients)
      return json(404, { error: 'not found' })
    }))
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  const mount = async (path: string) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <AuthProvider>
            <ToastProvider>
              <MemoryRouter initialEntries={[path]}>
                <Routes>
                  <Route path="clients" element={<ClientsPage />}>
                    <Route path=":id" element={<ClientDetailDrawer />} />
                  </Route>
                </Routes>
              </MemoryRouter>
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>,
      )
    })
    await flush()
    await flush()
  }
  const click = (el: Element | null | undefined) => act(async () => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

  it('shows the monthly recurring revenue and the active clients by default', async () => {
    await mount('/clients')
    expect(host.querySelector('[data-testid="mrr"]')?.textContent).toMatch(/523/)
    expect(host.textContent).toContain('CPE Soleil')
    expect(host.textContent).toContain('Resto Bleu')
    expect(host.textContent).not.toContain('Bureau Gris')
    expect(host.textContent).toContain('dans 12 j')
  })

  it('filters by status and by renewal within 30 days', async () => {
    await mount('/clients')
    const paused = [...host.querySelectorAll('.segmented button')].find((b) => b.textContent === 'En pause')
    await click(paused)
    expect(host.textContent).toContain('Bureau Gris')
    expect(host.textContent).not.toContain('CPE Soleil')

    await click([...host.querySelectorAll('.segmented button')].find((b) => b.textContent === 'Actifs'))
    await click(host.querySelector('.cl-check input'))
    expect(host.textContent).toContain('Resto Bleu')
    expect(host.textContent).not.toContain('CPE Soleil')
  })

  it('explains the missing Google review link in the client drawer', async () => {
    reviewConfig = { googleReviewUrl: false, smtp: false }
    await mount('/clients/c1')
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Fiche client')
    expect(host.textContent).toContain('GOOGLE_REVIEW_URL')
    expect(host.textContent).toContain('Premier ménage fait')
    expect([...host.querySelectorAll('button')].some((b) => /Envoyer par courriel/.test(b.textContent ?? ''))).toBe(false)
  })

  it('offers the email and link channels once the review link is configured', async () => {
    await mount('/clients/c1')
    const labels = [...host.querySelectorAll('button')].map((b) => b.textContent ?? '')
    expect(labels.some((t) => /Envoyer par courriel/.test(t))).toBe(true)
    expect(labels.some((t) => /message à copier/.test(t))).toBe(true)
    expect(host.textContent).not.toContain('GOOGLE_REVIEW_URL')
  })
})
