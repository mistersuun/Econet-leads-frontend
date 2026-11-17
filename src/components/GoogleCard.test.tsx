// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BusinessDTO, PlacesData } from '../api/types'
import { formatRating } from '../lib/format'
import { GoogleCard } from './GoogleCard'
import { ToastProvider } from './Toast'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const fresh: PlacesData = {
  placeId: 'ChIJ1',
  rating: 4.3,
  reviewCount: 187,
  mapsUrl: 'https://maps.google.com/?cid=1',
  openingHours: ['lundi : 9 h 00 – 17 h 00'],
  businessStatus: 'OPERATIONAL',
  cleanlinessSignals: [{ text: 'Les toilettes étaient sales.', rating: 2, publishedAt: '2026-09-01T12:00:00' }],
  fetchedAt: '2026-11-01T10:00:00',
}

function lead(places: PlacesData | null): BusinessDTO {
  return { id: 'l1', businessName: 'Bistro Le Comptoir', places } as unknown as BusinessDTO
}

describe('GoogleCard', () => {
  let root: Root
  let host: HTMLDivElement
  let configured = true
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    configured = true
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/places/status')) return json(200, { configured, usedToday: 3, dailyLimit: 100, attribution: 'Données Google' })
      if (url.endsWith('/enrich/places') && init?.method === 'POST') return json(200, lead(fresh))
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

  const render = async (l: BusinessDTO, canEdit = true) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <ToastProvider>
            <GoogleCard lead={l} canEdit={canEdit} />
          </ToastProvider>
        </QueryClientProvider>,
      )
    })
    await flush()
  }

  it('formats the rating with a French decimal comma', () => {
    expect(formatRating(4.3)).toBe('4,3')
  })

  it('shows rating, reviews, hours, cleanliness quotes, the Maps link and the attribution', async () => {
    await render(lead(fresh))
    expect(host.textContent).toContain('4,3')
    expect(host.textContent).toContain('187 avis')
    expect(host.textContent).toContain('Données Google')
    expect(host.textContent).toContain('Les toilettes étaient sales.')
    expect(host.textContent).toContain('3 / 100 recherches Google aujourd’hui')
    expect(host.querySelector('a[href="https://maps.google.com/?cid=1"]')?.getAttribute('rel')).toContain('noopener')
    expect([...host.querySelectorAll('button')].some((b) => b.textContent?.includes('Actualiser'))).toBe(true)
  })

  it('refreshes through the API when the button is pressed', async () => {
    await render(lead(fresh))
    const btn = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Actualiser'))!
    await act(async () => { btn.click() })
    await flush()
    expect(fetchMock.mock.calls.some(([u, i]) => String(u).endsWith('/api/businesses/l1/enrich/places') && i?.method === 'POST')).toBe(true)
  })

  it('explains that Google is not configured and offers no refresh', async () => {
    configured = false
    await render(lead(null))
    expect(host.textContent).toContain('GOOGLE_PLACES_API_KEY')
    expect([...host.querySelectorAll('button')].length).toBe(0)
  })

  it('invites a first lookup when there is no data, and a refresh when the data expired', async () => {
    await render(lead(null))
    expect(host.textContent).toContain('Aucune donnée Google')
    expect([...host.querySelectorAll('button')].some((b) => b.textContent?.includes('Chercher sur Google'))).toBe(true)
    act(() => root.unmount())
    root = createRoot(host)
    await render(lead({ placeId: 'ChIJ1', fetchedAt: '2026-08-01T10:00:00', expired: true }))
    expect(host.textContent).toContain('plus de 30 jours')
  })

  it('disables the refresh for read-only users', async () => {
    await render(lead(fresh), false)
    const btn = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Actualiser'))!
    expect(btn.disabled).toBe(true)
  })
})
