// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSessionCache, setSession } from '../api/session'
import { SmsFollowUpSheet } from './SmsFollowUpSheet'
import { ToastProvider } from './Toast'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const lead = { id: 'l1', businessName: 'Clinique Soleil', phone: '(514) 555-1234', qualification: null }

describe('SmsFollowUpSheet', () => {
  let root: Root
  let host: HTMLDivElement
  let smsConfigured = true
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    localStorage.clear()
    resetSessionCache()
    setSession({ accessToken: 'a', refreshToken: 'r', user: { userId: 'u1', username: 'marie', email: 'm@econet.ca', role: 'USER' } })
    smsConfigured = true
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes('/api/integrations/status')) return json(200, { sms: smsConfigured })
      if (url.includes('/api/leads/l1/sms/preview')) return json(200, { body: 'Bonjour, ici marie. Répondez STOP pour vous désabonner.' })
      if (url.endsWith('/api/leads/l1/sms') && init?.method === 'POST') return json(201, { status: 'sent' })
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

  const render = async (onClose = vi.fn()) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <ToastProvider>
            <SmsFollowUpSheet lead={lead} onClose={onClose} />
          </ToastProvider>
        </QueryClientProvider>,
      )
    })
    await flush()
    return onClose
  }
  const sendButton = () => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Envoyer le texto') as HTMLButtonElement

  it('shows the preview and only sends once the consent box is ticked', async () => {
    const onClose = await render()
    expect(host.textContent).toContain('Répondez STOP pour vous désabonner.')
    expect(sendButton().disabled).toBe(true)

    await act(async () => {
      ;(host.querySelector('input[type=checkbox]') as HTMLInputElement).click()
    })
    expect(sendButton().disabled).toBe(false)
    await act(async () => {
      sendButton().click()
    })
    await flush()

    const post = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith('/api/leads/l1/sms') && i?.method === 'POST')
    expect(post).toBeTruthy()
    expect(JSON.parse(String(post![1]!.body))).toEqual({ templateKey: 'missed_call', language: 'fr', consent: true })
    expect(onClose).toHaveBeenCalled()
  })

  it('explains the missing configuration and cannot send', async () => {
    smsConfigured = false
    await render()
    expect(host.textContent).toContain('TWILIO_ACCOUNT_SID')
    await act(async () => {
      ;(host.querySelector('input[type=checkbox]') as HTMLInputElement).click()
    })
    expect(sendButton().disabled).toBe(true)
  })
})
