import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getUsers, registerUser, setUserTargets } from '../api/endpoints'
import type { Role, TeamMember } from '../api/types'
import { EmptyState, ErrorState, SkeletonRows } from '../components/States'
import { useToast } from '../components/Toast'
import { errorMessage } from '../lib/errors'

const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Admin', USER: 'Appelant', VIEWER: 'Lecture' }

/** Équipe (ADMIN): list members, edit their daily targets, create accounts. */
export default function TeamSection() {
  const users = useQuery({ queryKey: ['users'], queryFn: getUsers })
  return (
    <div className="stack team">
      <section className="card">
        <header className="settings-list-head">
          <h2>Membres de l’équipe</h2>
          <span className="hint muted small">Comptes, rôles et objectifs quotidiens.</span>
        </header>
        {users.isPending ? (
          <div style={{ padding: 24 }}>
            <SkeletonRows rows={4} />
          </div>
        ) : users.isError ? (
          <ErrorState error={users.error} onRetry={() => void users.refetch()} />
        ) : users.data.length === 0 ? (
          <EmptyState title="Aucun membre">Ajoutez le premier compte ci-dessous.</EmptyState>
        ) : (
          <ul className="team-list">
            {users.data.map((m) => (
              <MemberRow key={m.id} member={m} />
            ))}
          </ul>
        )}
      </section>
      <AddMemberForm />
    </div>
  )
}

function MemberRow({ member }: { member: TeamMember }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [calls, setCalls] = useState<string | null>(null)
  const [conv, setConv] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const c = calls ?? String(member.callTarget)
  const v = conv ?? String(member.conversationTarget)
  const valid = c !== '' && v !== ''
  const dirty = valid && (Number(c) !== member.callTarget || Number(v) !== member.conversationTarget)
  const save = useMutation({
    mutationFn: () => setUserTargets(member.id, { callTarget: Number(c), conversationTarget: Number(v) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] })
      void qc.invalidateQueries({ queryKey: ['team-today'] })
      setCalls(null)
      setConv(null)
      setEditing(false)
      toast(`Objectifs de ${member.username} enregistrés`)
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  return (
    <li className="team-row">
      <div className="team-id">
        <span className="avatar sm">{member.username.slice(0, 2).toUpperCase()}</span>
        <span className="team-who">
          <span className="lead-name">{member.username}</span>
          <span className="xs muted truncate">{member.email}</span>
        </span>
        <span className="lang-tag">{ROLE_LABEL[member.role]}</span>
      </div>
      {editing ? (
        <div className="team-edit">
          <label className="field">
            <span>Appels / jour</span>
            <input className="input num" inputMode="numeric" value={c} onChange={(e) => setCalls(e.target.value.replace(/\D/g, ''))} aria-label={`Appels par jour pour ${member.username}`} />
          </label>
          <label className="field">
            <span>Conversations / jour</span>
            <input className="input num" inputMode="numeric" value={v} onChange={(e) => setConv(e.target.value.replace(/\D/g, ''))} aria-label={`Conversations par jour pour ${member.username}`} />
          </label>
          <button type="button" className="btn btn-sm btn-primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? '…' : 'Enregistrer'}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => { setEditing(false); setCalls(null); setConv(null) }}>
            Annuler
          </button>
        </div>
      ) : (
        <div className="team-targets">
          <span className="small muted">
            {member.callTarget} appels · {member.conversationTarget} conversations
          </span>
          <button type="button" className="btn btn-sm" onClick={() => setEditing(true)} aria-label={`Modifier les objectifs de ${member.username}`}>
            Modifier
          </button>
        </div>
      )}
    </li>
  )
}

function AddMemberForm() {
  const qc = useQueryClient()
  const toast = useToast()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [role, setRole] = useState<Role>('USER')
  const create = useMutation({
    // The response carries the NEW user's tokens: deliberately ignored, the admin's session is untouched.
    mutationFn: () => registerUser({ username: username.trim(), email: email.trim(), password, role }),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: ['users'] })
      toast(`Compte créé pour ${created.username}`)
      setUsername('')
      setEmail('')
      setPassword('')
      setShow(false)
      setRole('USER')
    },
  })
  const ready = username.trim().length >= 3 && email.includes('@') && password.length >= 8
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (ready && !create.isPending) create.mutate()
  }
  return (
    <section className="card card-pad">
      <h2>Ajouter un membre</h2>
      <form className="stack team-form" onSubmit={submit}>
        <label className="field">
          <span>Nom d’utilisateur</span>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" autoCapitalize="none" required minLength={3} />
        </label>
        <label className="field">
          <span>Courriel</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required />
        </label>
        <label className="field">
          <span>Mot de passe (8 caractères minimum)</span>
          <span className="row">
            <input className="input" style={{ flex: 1 }} type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={8} />
            <button type="button" className="btn btn-sm" onClick={() => setShow((s) => !s)} aria-pressed={show}>
              {show ? 'Masquer' : 'Afficher'}
            </button>
          </span>
        </label>
        <label className="field">
          <span>Rôle</span>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="USER">{ROLE_LABEL.USER}</option>
            <option value="VIEWER">{ROLE_LABEL.VIEWER}</option>
            <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
          </select>
        </label>
        {create.isError && (
          <div className="field-error" role="alert">
            {errorMessage(create.error)}
          </div>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn-primary" disabled={!ready || create.isPending}>
            {create.isPending ? 'Création…' : 'Créer le compte'}
          </button>
        </div>
      </form>
    </section>
  )
}
