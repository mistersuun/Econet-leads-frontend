// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { ToastProvider } from '../components/Toast'
import { resetSessionCache, setSession } from '../api/session'
import AccountTab from './AccountTab'
import ResetPassword from './ResetPassword'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const me = { userId: 'u2', username: 'marie', email: 'marie@econet.ca', role: 'USER' as const }
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('Mon compte / réinitialisation', () => {
  let root: Root
  let host: HTMLDivElement
  const fetchMock = vi.fn<typeof fetch>()
  const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

  beforeEach(() => {
    localStorage.clear()
    resetSessionCache()
    setSession({ accessToken: 'a', refreshToken: 'r', user: me })
    fetchMock.mockReset()
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

  const setValue = (el: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const submit = (form: HTMLFormElement) => act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
  const click = (el: Element) => act(async () => { (el as HTMLElement).click() })
  const buttonByText = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text))!
  const passwordCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/api/me/password'))

  const renderTab = async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={qc()}>
          <AuthProvider>
            <ToastProvider>
              <AccountTab />
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>,
      )
    })
  }

  it('shows identity read-only and changes the password', async () => {
    fetchMock.mockImplementation(async (input, init) => (String(input).endsWith('/api/me/password') && init?.method === 'POST' ? new Response(null, { status: 204 }) : json(404, { error: 'x' })))
    await renderTab()
    expect(host.textContent).toContain('marie@econet.ca')
    expect(host.textContent).toContain('Appelant')
    // The weekly coaching email preference (P4) lives in Mon compte, under "Préférences".
    expect(host.textContent).toContain('Préférences')
    expect(host.textContent).toContain('Recevoir le courriel hebdomadaire')

    const inputs = host.querySelectorAll<HTMLInputElement>('form input')
    await act(async () => {
      setValue(inputs[0], 'ancien-secret')
      setValue(inputs[1], 'nouveau-secret-12')
      setValue(inputs[2], 'nouveau-secret-12')
    })
    expect(host.textContent).toContain('Solide')
    await submit(host.querySelector('form')!)
    await flush()
    const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/api/me/password'))!
    expect(JSON.parse(String(call[1]!.body))).toEqual({ currentPassword: 'ancien-secret', newPassword: 'nouveau-secret-12' })
    expect(document.body.textContent).toContain('Mot de passe modifié')
  })

  it('blocks a mismatched confirmation and shows the server error in French', async () => {
    fetchMock.mockImplementation(async () => json(400, { error: 'Le mot de passe actuel est incorrect' }))
    await renderTab()
    const inputs = host.querySelectorAll<HTMLInputElement>('form input')
    await act(async () => {
      setValue(inputs[0], 'faux')
      setValue(inputs[1], 'nouveau-secret-12')
      setValue(inputs[2], 'different-secret-12')
    })
    await submit(host.querySelector('form')!)
    expect(host.textContent).toContain('ne correspondent pas')
    expect(passwordCalls()).toHaveLength(0)

    await act(async () => { setValue(inputs[2], 'nouveau-secret-12') })
    await submit(host.querySelector('form')!)
    await flush()
    expect(passwordCalls()).toHaveLength(1)
    expect(host.textContent).toContain('Le mot de passe actuel est incorrect')
  })

  it('admin reset: generates, saves and shows the password once with a copy button', async () => {
    fetchMock.mockImplementation(async (input, init) => (String(input).endsWith('/api/users/u9/password') && init?.method === 'PUT' ? new Response(null, { status: 204 }) : json(404, { error: 'x' })))
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await act(async () => {
      root.render(
        <QueryClientProvider client={qc()}>
          <ToastProvider>
            <ResetPassword userId="u9" username="julien" />
          </ToastProvider>
        </QueryClientProvider>,
      )
    })
    await click(buttonByText('Réinitialiser le mot de passe'))
    await click(buttonByText('Générer'))
    const generated = host.querySelector<HTMLInputElement>('form input')!.value
    expect(generated).toHaveLength(14)
    await submit(host.querySelector('form')!)
    await flush()
    const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/api/users/u9/password'))!
    expect(JSON.parse(String(call[1]!.body))).toEqual({ newPassword: generated })
    expect(host.querySelector('[data-testid="new-password"]')!.textContent).toBe(generated)
    await click(buttonByText('Copier'))
    expect(writeText).toHaveBeenCalledWith(generated)
    await click(buttonByText('Terminé'))
    expect(host.textContent).not.toContain(generated)
  })
})
