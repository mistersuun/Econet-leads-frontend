// Mock backend for P1: password change (self) and reset (ADMIN). Mirrors the server's rules.
import { HttpError, type Req, type Result } from './http'
import { USERS, type MockUser } from './seed'

function checkNew(user: MockUser, pw: unknown): string {
  if (typeof pw !== 'string' || pw.length < 10) throw new HttpError(400, 'Le mot de passe doit contenir au moins 10 caractères')
  if (pw.toLowerCase() === user.username.toLowerCase()) throw new HttpError(400, "Le mot de passe ne doit pas être identique au nom d'utilisateur")
  return pw
}

export function handleAccounts(req: Req, user: MockUser): Result | null {
  const { method, path } = req
  const body = (req.body ?? {}) as { currentPassword?: string; newPassword?: string }
  if (method === 'POST' && path === '/api/me/password') {
    const me = USERS.find((u) => u.userId === user.userId)
    if (!me) throw new HttpError(404, 'Utilisateur introuvable')
    if (!body.currentPassword || body.currentPassword !== me.password) throw new HttpError(400, 'Le mot de passe actuel est incorrect')
    const next = checkNew(me, body.newPassword)
    if (next === me.password) throw new HttpError(400, "Le nouveau mot de passe doit être différent de l'actuel")
    me.password = next
    return { status: 204 }
  }
  const m = /^\/api\/users\/([^/]+)\/password$/.exec(path)
  if (m && method === 'PUT') {
    if (user.role !== 'ADMIN') throw new HttpError(403, 'Accès refusé')
    const target = USERS.find((u) => u.userId === m[1])
    if (!target) throw new HttpError(404, `Utilisateur introuvable : ${m[1]}`)
    target.password = checkNew(target, body.newPassword)
    return { status: 204 }
  }
  return null
}
