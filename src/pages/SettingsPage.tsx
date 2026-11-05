import { useEffect, useState } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createScript,
  getLeadFilters,
  getMyTargets,
  getTeamToday,
  getUserTargets,
  listEmailTemplates,
  listScripts,
  updateEmailTemplate,
  updateMyTargets,
  updateScript,
  updateUserTargets,
} from '../api/endpoints'
import {
  SCRIPT_SECTION_KEYS,
  type CallScript,
  type EmailTemplate,
  type ScriptLanguage,
  type ScriptSection,
  type ScriptSectionKey,
  type ScriptUpsert,
  type UserTargets,
} from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { EmptyState, ErrorState, SkeletonRows } from '../components/States'
import { useToast } from '../components/Toast'
import { errorMessage } from '../lib/errors'
import { formatRelative } from '../lib/format'
import { placeholderKeys } from '../lib/placeholders'
import './settings.css'

const TABS = [
  { key: 'scripts', label: 'Scripts d’appel' },
  { key: 'emails', label: 'Modèles de courriel' },
  { key: 'targets', label: 'Objectifs' },
] as const
type Tab = (typeof TABS)[number]['key']

const SECTION_LABEL: Record<ScriptSectionKey, string> = { opening: 'Ouverture', questions: 'Questions', objections: 'Objections', closing: 'Clôture' }
const PLACEHOLDERS: { key: string; help: string }[] = [
  { key: 'businessName', help: 'nom de l’entreprise' },
  { key: 'city', help: 'ville du lead' },
  { key: 'callerName', help: 'vous (utilisateur connecté)' },
  { key: 'companyName', help: 'EcoNet Propreté' },
  { key: 'decisionMaker', help: 'décideur saisi dans la qualification' },
]
const EMAIL_PLACEHOLDERS: { key: string; help: string }[] = [
  ...PLACEHOLDERS,
  { key: 'estimate', help: 'lignes de l’estimation (si incluse)' },
  { key: 'visitAt', help: 'date de visite en toutes lettres' },
  { key: 'extraNote', help: 'note ajoutée par l’agent' },
]

export default function SettingsPage() {
  const { tab } = useParams<{ tab?: string }>()
  const navigate = useNavigate()
  const current: Tab = (TABS.find((t) => t.key === tab)?.key ?? 'scripts') as Tab
  useEffect(() => {
    if (!tab) navigate('/settings/scripts', { replace: true })
  }, [tab, navigate])

  return (
    <div className="page settings">
      <div className="page-header">
        <div>
          <h1>Réglages</h1>
          <p className="subtitle">Scripts, modèles de courriel et objectifs de l’équipe.</p>
        </div>
      </div>
      <nav className="segmented settings-tabs" aria-label="Sections des réglages">
        {TABS.map((t) => (
          <NavLink key={t.key} to={`/settings/${t.key}`} aria-pressed={current === t.key} role="button">
            {t.label}
          </NavLink>
        ))}
      </nav>
      {current === 'scripts' && <ScriptsTab />}
      {current === 'emails' && <EmailsTab />}
      {current === 'targets' && <TargetsTab />}
    </div>
  )
}

/* ------------------------------------------------------------- Scripts */

function PlaceholderHelp({ items }: { items: { key: string; help: string }[] }) {
  return (
    <details className="ph-help">
      <summary>Espaces réservés</summary>
      <ul>
        {items.map((p) => (
          <li key={p.key}>
            <code>{`{{${p.key}}}`}</code> <span className="muted">{p.help}</span>
          </li>
        ))}
        <li className="muted xs">Objections : une paire par paragraphe, « objection → réponse » (ou l’objection sur la première ligne, la réponse ensuite).</li>
      </ul>
    </details>
  )
}

function emptyScript(language: ScriptLanguage): ScriptUpsert {
  return {
    name: '',
    businessType: null,
    language,
    sections: SCRIPT_SECTION_KEYS.map((key) => ({ key, title: SECTION_LABEL[key], body: '' })),
    active: true,
  }
}

function ScriptsTab() {
  const qc = useQueryClient()
  const toast = useToast()
  const scripts = useQuery({ queryKey: ['scripts'], queryFn: listScripts })
  const filters = useQuery({ queryKey: ['lead-filters'], queryFn: getLeadFilters, staleTime: 5 * 60_000 })
  const [selected, setSelected] = useState<string | 'new' | null>(null)
  const [lang, setLang] = useState<ScriptLanguage | 'all'>('all')

  const list = (scripts.data ?? []).filter((s) => lang === 'all' || s.language === lang).sort((a, b) => (a.businessType ?? '').localeCompare(b.businessType ?? '', 'fr') || b.language.localeCompare(a.language))
  const editing: CallScript | 'new' | null = selected === 'new' ? 'new' : (scripts.data?.find((s) => s.id === selected) ?? null)

  const save = useMutation({
    mutationFn: ({ id, body }: { id: string | null; body: ScriptUpsert }) => (id ? updateScript(id, body) : createScript(body)),
    onSuccess: (s) => {
      toast(`Script « ${s.name} » enregistré`)
      void qc.invalidateQueries({ queryKey: ['scripts'] })
      void qc.invalidateQueries({ queryKey: ['script'] })
      setSelected(s.id)
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  return (
    <div className="settings-split">
      <section className="card settings-list">
        <header className="settings-list-head">
          <h2>Scripts</h2>
          <div className="segmented" role="group" aria-label="Langue">
            {(['all', 'fr', 'en'] as const).map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>
                {l === 'all' ? 'Tous' : l.toUpperCase()}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-sm" onClick={() => setSelected('new')}>
            Nouveau
          </button>
        </header>
        {scripts.isPending ? (
          <div style={{ padding: 24 }}>
            <SkeletonRows rows={6} />
          </div>
        ) : scripts.isError ? (
          <ErrorState error={scripts.error} onRetry={() => void scripts.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState title="Aucun script" />
        ) : (
          <ul className="settings-items">
            {list.map((s) => (
              <li key={s.id}>
                <button type="button" className={selected === s.id ? 'selected' : undefined} onClick={() => setSelected(s.id)} aria-current={selected === s.id}>
                  <span className="item-main">
                    <span className="item-title">
                      {s.businessType ?? 'Par défaut'} <span className="lang-tag">{s.language.toUpperCase()}</span>
                    </span>
                    <span className="xs muted">
                      {s.name}
                      {s.active === false ? ' · inactif' : ''}
                      {s.updatedAt ? ` · ${formatRelative(s.updatedAt)}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card card-pad settings-editor">
        {editing === null ? (
          <EmptyState title="Choisissez un script">Ou créez-en un nouveau pour un type d’entreprise.</EmptyState>
        ) : (
          <ScriptEditor
            key={editing === 'new' ? 'new' : editing.id}
            initial={editing === 'new' ? emptyScript('fr') : { name: editing.name, businessType: editing.businessType, language: editing.language, sections: editing.sections, active: editing.active ?? true }}
            types={filters.data?.businessTypes ?? []}
            saving={save.isPending}
            onSave={(body) => save.mutate({ id: editing === 'new' ? null : editing.id, body })}
            onCancel={() => setSelected(null)}
          />
        )}
      </section>
    </div>
  )
}

function ScriptEditor({ initial, types, saving, onSave, onCancel }: { initial: ScriptUpsert; types: string[]; saving: boolean; onSave: (b: ScriptUpsert) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<ScriptUpsert>(initial)
  const setSection = (key: ScriptSectionKey, patch: Partial<ScriptSection>) =>
    setDraft((d) => ({ ...d, sections: d.sections.map((s) => (s.key === key ? { ...s, ...patch } : s)) }))
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const unknown = draft.sections.flatMap((s) => placeholderKeys(s.body)).filter((k) => !PLACEHOLDERS.some((p) => p.key === k))
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(draft)
      }}
    >
      <div className="editor-row">
        <label className="field" style={{ flex: 2 }}>
          <span>Nom</span>
          <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="ex. Cliniques" required />
        </label>
        <label className="field">
          <span>Type d’entreprise</span>
          <input className="input" list="script-types" value={draft.businessType ?? ''} onChange={(e) => setDraft({ ...draft, businessType: e.target.value || null })} placeholder="Par défaut" />
          <datalist id="script-types">
            {['CPE', 'Clinique', 'Restaurant', 'Bureau', 'Chantier', ...types].filter((t, i, a) => a.indexOf(t) === i).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <div className="field">
          <span className="field-label">Langue</span>
          <div className="segmented">
            {(['fr', 'en'] as const).map((l) => (
              <button key={l} type="button" aria-pressed={draft.language === l} onClick={() => setDraft({ ...draft, language: l })} style={{ height: 36 }}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <label className="check" style={{ alignSelf: 'flex-end', height: 40 }}>
          <input type="checkbox" checked={draft.active !== false} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Actif
        </label>
      </div>
      <PlaceholderHelp items={PLACEHOLDERS} />
      {draft.sections.map((s) => (
        <label key={s.key} className="field">
          <span>{SECTION_LABEL[s.key]}</span>
          <textarea className="textarea" rows={s.key === 'opening' ? 5 : 7} value={s.body} onChange={(e) => setSection(s.key, { body: e.target.value })} />
        </label>
      ))}
      {unknown.length > 0 && (
        <div className="field-error">
          Espace réservé inconnu : {unknown.map((k) => `{{${k}}}`).join(', ')} — il restera tel quel à l’écran.
        </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onCancel}>
          Fermer
        </button>
        <button type="submit" className="btn btn-primary" disabled={!dirty || saving || !draft.name.trim()}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------- Emails */

const TEMPLATE_LABEL: Record<EmailTemplate['key'], string> = {
  intro: 'Présentation',
  quote_followup: 'Suivi de devis',
  visit_confirmation: 'Confirmation de visite',
  missed_you: 'Tentative d’appel',
}

function EmailsTab() {
  const qc = useQueryClient()
  const toast = useToast()
  const q = useQuery({ queryKey: ['email-templates'], queryFn: listEmailTemplates })
  const [selected, setSelected] = useState<string | null>(null)
  const list = [...(q.data ?? [])].sort((a, b) => TEMPLATE_LABEL[a.key].localeCompare(TEMPLATE_LABEL[b.key], 'fr') || b.language.localeCompare(a.language))
  const editing = q.data?.find((t) => t.id === selected) ?? null
  const save = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { subject: string; body: string; active: boolean } }) => updateEmailTemplate(id, body),
    onSuccess: (t) => {
      toast(`Modèle « ${TEMPLATE_LABEL[t.key]} (${t.language.toUpperCase()}) » enregistré`)
      void qc.invalidateQueries({ queryKey: ['email-templates'] })
      void qc.invalidateQueries({ queryKey: ['email-preview'] })
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  return (
    <div className="settings-split">
      <section className="card settings-list">
        <header className="settings-list-head">
          <h2>Modèles</h2>
        </header>
        {q.isPending ? (
          <div style={{ padding: 24 }}>
            <SkeletonRows rows={6} />
          </div>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : (
          <ul className="settings-items">
            {list.map((t) => (
              <li key={t.id}>
                <button type="button" className={selected === t.id ? 'selected' : undefined} onClick={() => setSelected(t.id)} aria-current={selected === t.id}>
                  <span className="item-main">
                    <span className="item-title">
                      {TEMPLATE_LABEL[t.key]} <span className="lang-tag">{t.language.toUpperCase()}</span>
                    </span>
                    <span className="xs muted truncate">{t.subject}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card card-pad settings-editor">
        {!editing ? (
          <EmptyState title="Choisissez un modèle">Objet et corps, avec les mêmes espaces réservés que les scripts.</EmptyState>
        ) : (
          <TemplateEditor key={editing.id} template={editing} saving={save.isPending} onSave={(body) => save.mutate({ id: editing.id, body })} />
        )}
      </section>
    </div>
  )
}

function TemplateEditor({ template, saving, onSave }: { template: EmailTemplate; saving: boolean; onSave: (b: { subject: string; body: string; active: boolean }) => void }) {
  const [subject, setSubject] = useState(template.subject)
  const [body, setBody] = useState(template.body)
  const [active, setActive] = useState(template.active)
  const dirty = subject !== template.subject || body !== template.body || active !== template.active
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ subject, body, active })
      }}
    >
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <h3>
          {TEMPLATE_LABEL[template.key]} <span className="lang-tag">{template.language.toUpperCase()}</span>
        </h3>
        <label className="check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Actif
        </label>
      </div>
      <PlaceholderHelp items={EMAIL_PLACEHOLDERS} />
      <label className="field">
        <span>Objet</span>
        <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} required />
      </label>
      <label className="field">
        <span>Corps (texte)</span>
        <textarea className="textarea" rows={14} value={body} onChange={(e) => setBody(e.target.value)} required />
      </label>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="submit" className="btn btn-primary" disabled={!dirty || saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------- Targets */

function TargetsTab() {
  const { user } = useAuth()
  const team = useQuery({ queryKey: ['team-today'], queryFn: getTeamToday })
  return (
    <section className="card">
      <header className="settings-list-head">
        <h2>Objectifs quotidiens</h2>
        <span className="hint muted small">Par agent : appels et conversations visés chaque jour. Défaut 40 / 6.</span>
      </header>
      {team.isPending ? (
        <div style={{ padding: 24 }}>
          <SkeletonRows rows={4} />
        </div>
      ) : team.isError ? (
        <ErrorState error={team.error} onRetry={() => void team.refetch()} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Agent</th>
                <th className="num">Aujourd’hui</th>
                <th>Appels / jour</th>
                <th>Conversations / jour</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {team.data.map((u) => (
                <TargetRow key={u.userId} userId={u.userId} username={u.username} me={u.userId === user?.userId} today={`${u.callsToday} appels · ${u.conversationsToday} conv.`} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function TargetRow({ userId, username, me, today }: { userId: string; username: string; me: boolean; today: string }) {
  const qc = useQueryClient()
  const toast = useToast()
  const q = useQuery({ queryKey: ['targets', userId], queryFn: () => (me ? getMyTargets() : getUserTargets(userId)), retry: false })
  const [calls, setCalls] = useState<string | null>(null)
  const [conv, setConv] = useState<string | null>(null)
  const current: UserTargets = q.data ?? { callTarget: 40, conversationTarget: 6 }
  const save = useMutation({
    mutationFn: (body: UserTargets) => (me ? updateMyTargets(body) : updateUserTargets(userId, body)),
    onSuccess: (t) => {
      qc.setQueryData(['targets', userId], t)
      void qc.invalidateQueries({ queryKey: ['today'] })
      setCalls(null)
      setConv(null)
      toast(`Objectifs de ${username} enregistrés`)
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const c = calls ?? String(current.callTarget)
  const v = conv ?? String(current.conversationTarget)
  const dirty = Number(c) !== current.callTarget || Number(v) !== current.conversationTarget
  return (
    <tr>
      <td>
        <span className="row">
          <span className="avatar sm">{username.slice(0, 2).toUpperCase()}</span>
          <span className="lead-name">{username}</span>
          {me && <span className="xs muted">(vous)</span>}
        </span>
      </td>
      <td className="num muted small">{today}</td>
      <td>
        <input className="input num" style={{ width: 96, height: 36 }} inputMode="numeric" value={c} onChange={(e) => setCalls(e.target.value.replace(/\D/g, ''))} aria-label={`Appels par jour pour ${username}`} />
      </td>
      <td>
        <input className="input num" style={{ width: 96, height: 36 }} inputMode="numeric" value={v} onChange={(e) => setConv(e.target.value.replace(/\D/g, ''))} aria-label={`Conversations par jour pour ${username}`} />
      </td>
      <td className="num">
        <button type="button" className="btn btn-sm" disabled={!dirty || save.isPending} onClick={() => save.mutate({ callTarget: Number(c), conversationTarget: Number(v) })}>
          {save.isPending ? '…' : 'Enregistrer'}
        </button>
      </td>
    </tr>
  )
}
