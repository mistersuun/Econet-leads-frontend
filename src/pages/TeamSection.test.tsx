// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { getSession, resetSessionCache, setSession } from '../api/session'
import TeamSection from './TeamSection'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const admin = { userId: 'a1', username: 'admin', email: 'a@econet.ca', role: 'ADMIN' as const }
const members = [
  { id: 'a1', username: 'admin', email: 'a@econet.ca', role: 'ADMIN', callTarget: 40, conversationTarget: 6, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'u2', username: 'marie', email: 'marie@econet.ca', role: 'USER', callTarget: 50, conversationTarget: 8, createdAt: '2026-01-02T00:00:00Z' },
]
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('TeamSection', () => {
  let root: Root
  let host: HTMLDivElement
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    localStorage.clear()
    resetSessionCache()
    setSession({ accessToken: 'admin-access', refreshToken: 'admin-refresh', user: admin })
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/users')) return json(200, members)
      if (url.endsWith('/api/auth/register') && init?.method === 'POST') {
        const b = JSON.parse(String(init.body))
        return json(201, { accessToken: 'NEW-access', refreshToken: 'NEW-refresh', tokenType: 'Bearer', userId: 'u3', username: b.username, email: b.email, role: b.role })
      }
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

  const setValue = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  }

  it('lists members and registers a user without touching the stored session', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <ToastProvider>
            <TeamSection />
          </ToastProvider>
        </QueryClientProvider>,
      )
    })
    await flush()
    expect(host.textContent).toContain('marie')
    expect(host.textContent).toContain('50 appels · 8 conversations')
    expect(host.textContent).toContain('Appelant')

    const inputs = host.querySelectorAll('form input')
    await act(async () => {
      setValue(inputs[0] as HTMLInputElement, 'paul')
      setValue(inputs[1] as HTMLInputElement, 'paul@econet.ca')
      setValue(inputs[2] as HTMLInputElement, 'motdepasse1')
    })
    await act(async () => {
      host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await flush()

    const reg = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/api/auth/register'))
    expect(reg).toBeTruthy()
    expect(JSON.parse(String(reg![1]!.body))).toEqual({ username: 'paul', email: 'paul@econet.ca', password: 'motdepasse1', role: 'USER' })
    expect(getSession()?.accessToken).toBe('admin-access')
    expect(getSession()?.user.username).toBe('admin')
    expect(localStorage.getItem('econet.session') ?? JSON.stringify(localStorage)).not.toContain('NEW-access')
    expect(document.body.textContent).toContain('Compte créé pour paul')
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/api/users')).length).toBeGreaterThanOrEqual(2)
  })
})
