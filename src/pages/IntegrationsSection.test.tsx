// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSessionCache, setSession } from '../api/session'
import { ToastProvider } from '../components/Toast'
import IntegrationsSection from './IntegrationsSection'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const status = { smtp: false, sms: true, alertsPhone: true, alertsEmail: false, places: true, placesUsedToday: 12, placesDailyLimit: 100, googleReviewUrl: false, websiteDb: false, publicUrl: 'https://api.example.test', crmUrl: 'https://crm.example.test' }

describe('IntegrationsSection', () => {
  let root: Root
  let host: HTMLDivElement
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    localStorage.clear()
    resetSessionCache()
    setSession({ accessToken: 'a', refreshToken: 'r', user: { userId: 'a1', username: 'admin', email: 'a@econet.ca', role: 'ADMIN' } })
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/integrations/status')) return json(200, status)
      if (url.endsWith('/api/integrations/test-alert') && init?.method === 'POST') return json(200, { smsConfigured: true, smsTargets: 1, smsSent: 1, emailConfigured: false, emailTargets: 0, emailSent: 0 })
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

  it('lists each provider with its state and env vars, and sends a test alert', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <ToastProvider>
            <IntegrationsSection />
          </ToastProvider>
        </QueryClientProvider>,
      )
    })
    await flush()
    expect(host.textContent).toContain('Non configuré')
    expect(host.textContent).toContain('SMTP_HOST')
    expect(host.textContent).toContain('TWILIO_AUTH_TOKEN')
    expect(host.textContent).toContain('12 / 100 appels aujourd’hui')
    expect(host.textContent).toContain('https://crm.example.test')

    const button = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Envoyer une alerte test') as HTMLButtonElement
    expect(button.disabled).toBe(false)
    await act(async () => {
      button.click()
    })
    await flush()
    expect(fetchMock.mock.calls.some(([u, i]) => String(u).endsWith('/api/integrations/test-alert') && i?.method === 'POST')).toBe(true)
    expect(document.body.textContent).toContain('Alerte test envoyée : 1 / 1 texto')
  })
})
