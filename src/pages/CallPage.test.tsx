// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { AuthProvider } from '../auth/AuthContext'
import { resetSessionCache, setSession } from '../api/session'
import type { BusinessDTO } from '../api/types'
import * as api from '../api/endpoints'
import CallPage from './CallPage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../api/endpoints')
vi.mock('../components/AddLead', () => ({ useAddLead: () => ({ open: () => undefined }) }))
vi.mock('../live/LiveProvider', () => ({ useLiveEvent: () => undefined }))

const user = { userId: 'u1', username: 'marie', email: 'marie@econet.ca', role: 'USER' as const }
const lead = (id: string, name: string) => ({ id, businessName: name, businessType: 'Garderie', phone: '5145550101', email: null, qualification: null, status: 'NEW' }) as unknown as BusinessDTO
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(10) })
const setVisibility = (state: 'hidden' | 'visible') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('CallPage one-tap outcomes', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    localStorage.clear()
    resetSessionCache()
    setSession({ accessToken: 'a', refreshToken: 'r', user })
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined }))
    vi.mocked(api.getQueue).mockResolvedValue([lead('l1', 'CPE Soleil'), lead('l2', 'Resto Bleu')])
    vi.mocked(api.getContacts).mockResolvedValue([])
    vi.mocked(api.getMyToday).mockResolvedValue({ callsToday: 0, conversationsToday: 0, quotesToday: 0, wonToday: 0, callTarget: 40, conversationTarget: 10, streakDays: 0, rankToday: { pos: 1, of: 1 }, connectRate: 0 } as never)
    vi.mocked(api.getIntegrationsStatus).mockResolvedValue({ sms: false } as never)
    vi.mocked(api.claimLead).mockResolvedValue(undefined as never)
    vi.mocked(api.releaseLead).mockResolvedValue(undefined as never)
    vi.mocked(api.logCall).mockResolvedValue({ lead: lead('l1', 'CPE Soleil'), contact: { outcome: 'NO_ANSWER' } } as never)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <ToastProvider>
            <AuthProvider>
              <MemoryRouter>
                <CallPage />
              </MemoryRouter>
            </AuthProvider>
          </ToastProvider>
        </QueryClientProvider>,
      )
    })
    await flush()
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  const tapNoAnswer = async () => {
    const tel = host.querySelector<HTMLAnchorElement>('a[href^="tel:"]')!
    tel.addEventListener('click', (e) => e.preventDefault())
    await act(async () => { tel.click() })
    await act(async () => { setVisibility('hidden') })
    await act(async () => { setVisibility('visible') })
    const btn = [...document.querySelectorAll<HTMLButtonElement>('.quick-btn')].find((b) => b.textContent?.includes('Pas de réponse'))!
    await act(async () => { btn.click() })
  }

  it('advances at once, then sends the log with the duration after 5 s', async () => {
    await tapNoAnswer()
    expect(api.logCall).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Resto Bleu')
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(api.logCall).toHaveBeenCalledTimes(1)
    const [id, body] = vi.mocked(api.logCall).mock.calls[0]
    expect(id).toBe('l1')
    expect(body).toMatchObject({ outcome: 'NO_ANSWER' })
    expect(body.durationSeconds).toBeGreaterThanOrEqual(1)
  })

  it('Annuler cancels the log and brings the lead back', async () => {
    await tapNoAnswer()
    const undo = [...document.querySelectorAll<HTMLButtonElement>('.toast button')].find((b) => b.textContent?.includes('Annuler'))!
    await act(async () => { undo.click() })
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(api.logCall).not.toHaveBeenCalled()
    expect(host.textContent).toContain('CPE Soleil')
  })

  it('hiding the page sends the pending log early', async () => {
    await tapNoAnswer()
    await act(async () => { setVisibility('hidden') })
    expect(api.logCall).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.logCall).mock.calls[0][2]).toEqual({ keepalive: true })
  })
})
