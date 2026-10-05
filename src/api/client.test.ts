import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_URL, ApiError, apiFetch, buildQuery } from './client'
import { getSession, resetSessionCache, setSession } from './session'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const user = { userId: 'u1', username: 'marie', email: 'm@econet.ca', role: 'USER' as const }
const authBody = (n: number) => ({
  accessToken: `access-${n}`,
  refreshToken: `refresh-${n}`,
  tokenType: 'Bearer',
  ...user,
})

function authHeader(init?: RequestInit): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.Authorization
}

describe('apiFetch', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    localStorage.clear()
    resetSessionCache()
    setSession({ accessToken: 'access-1', refreshToken: 'refresh-1', user })
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sends the bearer token and parses JSON', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }))
    await expect(apiFetch('/api/x')).resolves.toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API_URL}/api/x`)
    expect(authHeader(init)).toBe('Bearer access-1')
  })

  it('refreshes once on 401 and retries with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { error: 'expired' }))
      .mockResolvedValueOnce(json(200, authBody(2)))
      .mockResolvedValueOnce(json(200, { value: 42 }))

    await expect(apiFetch('/api/data')).resolves.toEqual({ value: 42 })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [refreshUrl, refreshInit] = fetchMock.mock.calls[1]
    expect(refreshUrl).toBe(`${API_URL}/api/auth/refresh`)
    expect(JSON.parse(String(refreshInit?.body))).toEqual({ refreshToken: 'refresh-1' })
    expect(authHeader(fetchMock.mock.calls[2][1])).toBe('Bearer access-2')
    expect(getSession()?.accessToken).toBe('access-2')
    expect(getSession()?.refreshToken).toBe('refresh-2')
  })

  it('logs out when the refresh fails', async () => {
    fetchMock.mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(401, { error: 'bad refresh' }))
    const err = await apiFetch('/api/data').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(getSession()).toBeNull()
  })

  it('logs out when the retried request is still 401 (no refresh loop)', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(200, authBody(2)))
      .mockResolvedValueOnce(json(401, { error: 'still no' }))
    await expect(apiFetch('/api/data')).rejects.toThrow('still no')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(getSession()).toBeNull()
  })

  it('shares a single refresh between concurrent 401s', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/auth/refresh')) return json(200, authBody(2))
      return authHeader(init) === 'Bearer access-2' ? json(200, { url }) : json(401, {})
    })
    const [a, b] = await Promise.all([apiFetch('/api/a'), apiFetch('/api/b')])
    expect(a).toEqual({ url: `${API_URL}/api/a` })
    expect(b).toEqual({ url: `${API_URL}/api/b` })
    const refreshCalls = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/api/auth/refresh'))
    expect(refreshCalls).toHaveLength(1)
  })

  it('does not try to refresh for the login endpoint', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { error: 'Identifiants invalides' }))
    await expect(apiFetch('/api/auth/login', { method: 'POST', body: {}, anonymous: true })).rejects.toThrow('Identifiants invalides')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getSession()).not.toBeNull()
  })

  it('turns {error, fields} bodies into ApiError', async () => {
    fetchMock.mockResolvedValueOnce(json(400, { error: 'Validation échouée', fields: { outcome: 'Requis' } }))
    const err = (await apiFetch('/api/x', { method: 'POST', body: {} }).catch((e: unknown) => e)) as ApiError
    expect(err.message).toBe('Validation échouée')
    expect(err.status).toBe(400)
    expect(err.fields).toEqual({ outcome: 'Requis' })
  })

  it('maps network failures to a readable ApiError', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(apiFetch('/api/x')).rejects.toMatchObject({ status: 0 })
  })
})

describe('buildQuery', () => {
  it('skips empty values and repeats arrays', () => {
    expect(buildQuery({ a: 1, b: '', c: undefined, d: null, s: ['NEW', 'WON'], t: true })).toBe('?a=1&s=NEW&s=WON&t=true')
    expect(buildQuery({})).toBe('')
  })
})
