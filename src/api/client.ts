import { getSession, sessionFromAuth, setSession } from './session'
import type { AuthResponse } from './types'

export const API_URL: string = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/+$/, '')

export class ApiError extends Error {
  readonly status: number
  readonly fields?: Record<string, string>

  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = fields
  }
}

export type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[]
export type Query = Record<string, QueryValue>

export function buildQuery(query?: Query): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, String(v))
    } else {
      params.append(key, String(value))
    }
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Query
  body?: unknown
  /** Skip the Authorization header and the refresh flow (login/refresh). */
  anonymous?: boolean
  signal?: AbortSignal
}

const AUTH_PATHS = ['/api/auth/login', '/api/auth/refresh']

async function parseError(res: Response): Promise<ApiError> {
  let message = `Erreur ${res.status}`
  let fields: Record<string, string> | undefined
  try {
    const text = await res.text()
    if (text) {
      try {
        const data = JSON.parse(text) as { error?: string; message?: string; fields?: Record<string, string> }
        message = data.error || data.message || message
        fields = data.fields
      } catch {
        message = text.length < 200 ? text : message
      }
    }
  } catch {
    /* ignore */
  }
  if (res.status === 401 && message === `Erreur ${res.status}`) message = 'Session expirée, veuillez vous reconnecter.'
  if (res.status === 403 && message === `Erreur ${res.status}`) message = "Vous n'avez pas les droits pour cette action."
  return new ApiError(message, res.status, fields)
}

let refreshInFlight: Promise<boolean> | null = null

/** Exchange the refresh token once; concurrent 401s share the same refresh. */
export function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight
  const session = getSession()
  if (!session?.refreshToken) return Promise.resolve(false)
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      })
      if (!res.ok) return false
      const auth = (await res.json()) as AuthResponse
      setSession(sessionFromAuth(auth))
      return true
    } catch {
      return false
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json, text/csv;q=0.9, */*;q=0.8' }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getSession()?.accessToken
  if (!opts.anonymous && token) headers.Authorization = `Bearer ${token}`
  return fetch(`${API_URL}${path}${buildQuery(opts.query)}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  })
}

/**
 * Low-level request: adds the bearer token, and on a 401 refreshes the session
 * once and retries once. If that still fails the session is cleared (logout).
 * Non-2xx responses are thrown as ApiError with the server's `{error}` message.
 */
export async function apiRequest(path: string, opts: RequestOptions = {}): Promise<Response> {
  let res: Response
  try {
    res = await send(path, opts)
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError('Impossible de joindre le serveur. Vérifiez votre connexion.', 0)
  }
  const canRefresh = !opts.anonymous && !AUTH_PATHS.includes(path)
  if (res.status === 401 && canRefresh) {
    const refreshed = await refreshSession()
    if (refreshed) {
      res = await send(path, opts)
    }
    if (res.status === 401) {
      setSession(null)
    }
  }
  if (!res.ok) throw await parseError(res)
  return res
}

/** JSON request. Returns `undefined` for empty bodies (204). */
export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await apiRequest(path, opts)
  if (res.status === 204) return undefined as T
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

/** Authenticated download (e.g. CSV export) returned as a Blob. */
export async function apiDownload(path: string, query?: Query): Promise<Blob> {
  const res = await apiRequest(path, { query })
  return res.blob()
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---- Multipart upload with progress (XHR: fetch has no upload progress events)

export interface UploadProgress {
  loaded: number
  total: number
}

export interface UploadRequest {
  url: string
  body: FormData
  headers: Record<string, string>
  onProgress?: (p: UploadProgress) => void
  signal?: AbortSignal
}

/** Raw result of one upload attempt; `status` 0 means the request never reached the server. */
export interface UploadResult {
  status: number
  text: string
}

export type UploadTransport = (req: UploadRequest) => Promise<UploadResult>

const xhrTransport: UploadTransport = (req) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', req.url)
    for (const [k, v] of Object.entries(req.headers)) xhr.setRequestHeader(k, v)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) req.onProgress?.({ loaded: e.loaded, total: e.total })
    }
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText })
    xhr.onerror = () => resolve({ status: 0, text: '' })
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'))
    if (req.signal) {
      if (req.signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      req.signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }
    xhr.send(req.body)
  })

let uploadTransport: UploadTransport = xhrTransport

/** Replace the upload transport (used by the dev-only mock backend). */
export function setUploadTransport(t: UploadTransport): void {
  uploadTransport = t
}

/**
 * POST a multipart body with upload progress. Same auth rules as `apiRequest`:
 * bearer token, one refresh + retry on 401, `{error}` bodies thrown as ApiError.
 */
export async function apiUpload<T>(
  path: string,
  body: FormData,
  opts: { onProgress?: (p: UploadProgress) => void; signal?: AbortSignal } = {},
): Promise<T> {
  const attempt = () => {
    const token = getSession()?.accessToken
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    return uploadTransport({ url: `${API_URL}${path}`, body, headers, onProgress: opts.onProgress, signal: opts.signal })
  }
  let res = await attempt()
  if (res.status === 401) {
    if (await refreshSession()) res = await attempt()
    if (res.status === 401) setSession(null)
  }
  if (res.status === 0) throw new ApiError('Impossible de joindre le serveur. Vérifiez votre connexion.', 0)
  if (res.status < 200 || res.status >= 300) throw await parseError(new Response(res.text, { status: res.status }))
  return (res.text ? JSON.parse(res.text) : undefined) as T
}
