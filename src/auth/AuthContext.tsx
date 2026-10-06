import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { login as apiLogin } from '../api/endpoints'
import { getSession, sessionFromAuth, setSession, subscribeSession, type Session } from '../api/session'
import type { CurrentUser, Role } from '../api/types'

interface AuthValue {
  user: CurrentUser | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  hasRole: (...roles: Role[]) => boolean
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setLocal] = useState<Session | null>(() => getSession())
  const queryClient = useQueryClient()

  useEffect(() => subscribeSession(setLocal), [])

  // When the session disappears (logout or failed refresh) drop cached data.
  useEffect(() => {
    if (!session) queryClient.clear()
  }, [session, queryClient])

  const login = useCallback(async (username: string, password: string) => {
    const auth = await apiLogin(username, password)
    setSession(sessionFromAuth(auth))
  }, [])

  const logout = useCallback(() => setSession(null), [])

  const value = useMemo<AuthValue>(
    () => ({
      user: session?.user ?? null,
      login,
      logout,
      hasRole: (...roles) => !!session && roles.includes(session.user.role),
    }),
    [session, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
