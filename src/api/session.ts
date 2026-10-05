import type { AuthResponse, CurrentUser } from './types'

const STORAGE_KEY = 'econet.session'

export interface Session {
  accessToken: string
  refreshToken: string
  user: CurrentUser
}

type Listener = (session: Session | null) => void
const listeners = new Set<Listener>()
let cached: Session | null | undefined

function read(): Session | null {
  if (cached !== undefined) return cached
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    cached = raw ? (JSON.parse(raw) as Session) : null
  } catch {
    cached = null
  }
  return cached
}

export function getSession(): Session | null {
  return read()
}

export function setSession(session: Session | null): void {
  cached = session
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage unavailable: keep the in-memory copy */
  }
  listeners.forEach((l) => l(session))
}

export function sessionFromAuth(auth: AuthResponse): Session {
  return {
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    user: { userId: auth.userId, username: auth.username, email: auth.email, role: auth.role },
  }
}

export function subscribeSession(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Test helper: forget the in-memory cache so the next read hits storage. */
export function resetSessionCache(): void {
  cached = undefined
}
