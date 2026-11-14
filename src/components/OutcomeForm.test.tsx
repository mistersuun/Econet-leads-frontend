// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSessionCache, setSession } from '../api/session'
import type { BusinessDTO } from '../api/types'
import { OutcomeForm } from './OutcomeForm'
import { ToastProvider } from './Toast'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const lead = { id: 'l1', businessName: 'CPE Les Lucioles', estimatedValue: null } as unknown as BusinessDTO

describe('OutcomeForm objections, voicemail and preset', () => {
  let root: Root
  let host: HTMLDivElement
  const fetchMock = vi.fn<typeof fetch>()

  const render = async (props: Partial<Parameters<typeof OutcomeForm>[0]> = {}) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <ToastProvider>
            <OutcomeForm lead={lead} objectionOptions={['Déjà un fournisseur', 'Pas de budget']} voicemailText="Bonjour, ici Marie." {...props} />
          </ToastProvider>
        </QueryClientProvider>,
      )
    })
  }
  const byText = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(label)) as HTMLButtonElement

  beforeEach(() => {
    localStorage.clear()
    resetSessionCache()
    setSession({ accessToken: 'a', refreshToken: 'r', user: { userId: 'u1', username: 'marie', email: 'm@econet.ca', role: 'USER' } })
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (input) => {
      if (String(input).endsWith('/api/leads/l1/calls')) return json(200, { lead: { ...lead }, contact: { outcome: 'NOT_INTERESTED' } })
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

  it('sends the chosen and typed objections with the call', async () => {
    await render()
    await act(async () => byText('Pas intéressé').click())
    await act(async () => byText('Pas de budget').click())
    const other = host.querySelector('input[aria-label="Autre objection"]') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(other, 'Contrat de 3 ans')
      other.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => byText('Ajouter').click())
    await act(async () => byText('Enregistrer').click())
    await flush()
    const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/api/leads/l1/calls'))!
    expect(JSON.parse(String(call[1]!.body))).toMatchObject({ outcome: 'NOT_INTERESTED', objections: ['Pas de budget', 'Contrat de 3 ans'] })
  })

  it('shows the voicemail script next to the voicemail outcome', async () => {
    await render()
    expect(host.textContent).not.toContain('Bonjour, ici Marie.')
    await act(async () => byText('Messagerie').click())
    expect(host.textContent).toContain('Message vocal à laisser')
    expect(host.textContent).toContain('Bonjour, ici Marie.')
  })

  it('applies an outcome preset from outside', async () => {
    await render({ preset: null })
    await render({ preset: { outcome: 'CALLBACK', nonce: 1 } })
    await flush()
    expect(byText('Rappeler').getAttribute('aria-pressed')).toBe('true')
  })
})
