// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { getSession, resetSessionCache, setSession } from '../api/session'
import { ToastProvider } from './Toast'
import { WeeklyReportToggle } from './WeeklyReportToggle'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('WeeklyReportToggle', () => {
  let root: Root
  let host: HTMLDivElement
  const fetchMock = vi.fn<typeof fetch>()
  let smtp = true

  const mount = async (role: 'ADMIN' | 'USER') => {
    resetSessionCache()
    setSession({ accessToken: 'a', refreshToken: 'r', user: { userId: 'u1', username: 'marie', email: 'm@econet.ca', role } })
    expect(getSession()?.user.role).toBe(role)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <AuthProvider>
            <ToastProvider>
              <WeeklyReportToggle />
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>,
      )
    })
    await flush()
  }
  const button = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined

  beforeEach(() => {
    localStorage.clear()
    smtp = true
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/me/preferences') && (init?.method ?? 'GET') === 'GET') return json(200, { weeklyReport: true })
      if (url.endsWith('/api/me/preferences') && init?.method === 'PUT') return json(200, JSON.parse(String(init.body)))
      if (url.endsWith('/api/email/status')) return json(200, { configured: smtp })
      if (url.endsWith('/api/reports/weekly/preview')) return json(200, { subject: 'Votre semaine chez EcoNet Propreté : 5 appels, 3 conversations', text: 'Bonjour marie,\n- Appels : 5', html: '<p>x</p>' })
      if (url.endsWith('/api/reports/weekly/send-now')) return json(202, { status: 'queued' })
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

  it('is on by default and turning it off saves the preference', async () => {
    await mount('USER')
    const box = host.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(box.checked).toBe(true)
    await act(async () => box.click())
    await flush()
    const put = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith('/api/me/preferences') && i?.method === 'PUT')
    expect(JSON.parse(String(put![1]!.body))).toEqual({ weeklyReport: false })
    expect(button('Envoyer maintenant')).toBeUndefined()
  })

  it('previews the email text', async () => {
    await mount('USER')
    await act(async () => button('Voir un aperçu')!.click())
    await flush()
    expect(host.textContent).toContain('5 appels, 3 conversations')
    expect(host.querySelector('pre')?.textContent).toContain('- Appels : 5')
  })

  it('lets an admin send now, and says so when email is not configured', async () => {
    await mount('ADMIN')
    await act(async () => button('Envoyer maintenant')!.click())
    await flush()
    expect(fetchMock.mock.calls.some(([u, i]) => String(u).endsWith('/api/reports/weekly/send-now') && i?.method === 'POST')).toBe(true)

    act(() => root.unmount())
    root = createRoot(host)
    smtp = false
    await mount('ADMIN')
    expect(host.textContent).toContain('SMTP_HOST')
    expect(button('Envoyer maintenant')!.disabled).toBe(true)
  })
})
