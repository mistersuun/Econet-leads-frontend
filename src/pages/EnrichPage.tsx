import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listLeads, updateLeadStatus } from '../api/endpoints'
import type { BusinessDTO, LeadListParams } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { PhoneInput } from '../components/PhoneInput'
import { SourceDetails } from '../components/SourceDetails'
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from '../components/States'
import { useToast } from '../components/Toast'
import { IconCheck, IconExternalLink, IconRefresh, IconSearch, IconSkip } from '../components/icons'
import { phoneErrorMessage, useSavePhone } from '../hooks/useSavePhone'
import { errorMessage } from '../lib/errors'
import { formatNumber, formatRelative } from '../lib/format'
import { phoneSearchUrl, validatePhone } from '../lib/phone'
import './enrich.css'

const PARAMS: LeadListParams = {
  hasPhone: false,
  // Same scope as summary.toEnrich: not WON, LOST or DO_NOT_CALL.
  leadStatus: ['NEW', 'CONTACTED', 'INTERESTED', 'QUOTE_SENT'],
  sortBy: 'createdAt',
  sortDirection: 'DESC',
  size: 100,
}

function mapsHref(lead: BusinessDTO) {
  const q = [lead.addressStreet, lead.addressCity, lead.addressProvince, lead.postalCode].filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

function openSearch(lead: BusinessDTO) {
  window.open(phoneSearchUrl(lead.businessName, lead.addressCity), '_blank', 'noopener,noreferrer')
}

export default function EnrichPage() {
  const { hasRole } = useAuth()
  const readOnly = !hasRole('ADMIN', 'USER')
  const toast = useToast()
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['enrich', PARAMS], queryFn: () => listLeads(PARAMS), staleTime: 0 })
  const [handled, setHandled] = useState<Set<string>>(() => new Set())
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set())
  const [added, setAdded] = useState(0)
  const [jumpTo, setJumpTo] = useState<string | null>(null)
  const refetchedFor = useRef<number | null>(null)

  const remaining = useMemo(
    () => (list.data?.content ?? []).filter((l) => !handled.has(l.id) && !skipped.has(l.id)),
    [list.data, handled, skipped],
  )
  const lead = (jumpTo && remaining.find((l) => l.id === jumpTo)) || remaining[0]
  const upcoming = remaining.filter((l) => l.id !== lead?.id).slice(0, 8)

  // Leads left on the server (as of the last fetch), minus what this session already handled.
  const inData = (s: Set<string>) => (list.data?.content ?? []).filter((l) => s.has(l.id)).length
  const left = list.data ? Math.max(0, list.data.totalElements - inData(handled) - inData(skipped)) : 0
  const done = handled.size + skipped.size
  const progress = done / Math.max(1, done + left)

  // Local page exhausted but the server has more: fetch the next batch once.
  useEffect(() => {
    if (!list.data || list.isFetching || remaining.length > 0) return
    if (refetchedFor.current === list.dataUpdatedAt) return
    if (list.data.totalElements <= inData(handled) + inData(skipped)) return
    refetchedFor.current = list.dataUpdatedAt
    void list.refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, remaining.length])

  const advance = (id: string, how: 'handled' | 'skipped') => {
    if (jumpTo === id) setJumpTo(null)
    if (how === 'handled') setHandled((s) => new Set(s).add(id))
    else setSkipped((s) => new Set(s).add(id))
  }

  const dnc = useMutation({
    mutationFn: (l: BusinessDTO) => updateLeadStatus(l.id, { status: 'DO_NOT_CALL', note: 'Marqué « Ne pas appeler » depuis À enrichir' }),
    onSuccess: (l) => {
      qc.setQueryData(['lead', l.id], l)
      for (const key of ['summary', 'leads', 'pipeline']) void qc.invalidateQueries({ queryKey: [key] })
      toast(`Ne pas appeler — ${l.businessName}`)
      advance(l.id, 'handled')
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  return (
    <div className="page enrich-page">
      <div className="page-header">
        <div>
          <h1>À enrichir</h1>
          <p className="subtitle">Leads sans téléphone. Trouvez le numéro : le lead rejoint aussitôt la file d’appels.</p>
        </div>
        <span className="spacer" />
        <div className="call-counters">
          <div className="counter">
            <strong className="num">{list.data ? formatNumber(left) : '…'}</strong>
            <span>à enrichir</span>
          </div>
          <div className="counter">
            <strong className="num">{added}</strong>
            <span>ajoutés cette session</span>
          </div>
        </div>
      </div>

      {readOnly && (
        <div className="notice" role="note">
          Votre rôle est en <strong>lecture seule</strong> : vous pouvez chercher les numéros, mais pas les enregistrer.
        </div>
      )}

      {list.isPending ? (
        <div className="enrich-grid">
          <div className="card card-pad stack">
            <Skeleton height={14} width={180} />
            <Skeleton height={34} width="70%" />
            <Skeleton height={56} />
            <SkeletonRows rows={4} />
          </div>
          <div className="card card-pad">
            <SkeletonRows rows={8} height={32} />
          </div>
        </div>
      ) : list.isError ? (
        <div className="card">
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        </div>
      ) : !lead ? (
        <div className="card">
          {list.isFetching ? (
            <div className="state">
              <SkeletonRows rows={2} />
              <span>Chargement des leads suivants…</span>
            </div>
          ) : (
            <EmptyState title={skipped.size ? 'Il ne reste que des leads passés' : 'Tous les leads ont un numéro'} icon={<IconCheck size={22} />}>
              <p>
                {added > 0 ? `${added} numéro${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''} cette session. ` : ''}
                {skipped.size ? `${skipped.size} lead${skipped.size > 1 ? 's' : ''} passé${skipped.size > 1 ? 's' : ''}.` : 'Rien à enrichir pour l’instant.'}
              </p>
              <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
                {skipped.size > 0 && (
                  <button type="button" className="btn btn-sm" onClick={() => setSkipped(new Set())}>
                    <IconRefresh size={16} /> Revoir les leads passés
                  </button>
                )}
                <Link className="btn btn-sm" to="/call">
                  Aller à la file d’appels
                </Link>
              </div>
            </EmptyState>
          )}
        </div>
      ) : (
        <div className="enrich-grid">
          <section className="card card-pad enrich-focus" aria-label="Lead à enrichir">
            <div className="queue-pos xs muted">
              <span>
                {formatNumber(left)} restant{left > 1 ? 's' : ''}
                {skipped.size > 0 && ` · ${skipped.size} passé${skipped.size > 1 ? 's' : ''}`}
              </span>
              <div className="queue-progress" aria-hidden="true">
                <span style={{ width: `${progress * 100}%` }} />
              </div>
            </div>
            <EnrichForm
              key={lead.id}
              lead={lead}
              readOnly={readOnly}
              busy={dnc.isPending}
              onSaved={() => {
                setAdded((n) => n + 1)
                advance(lead.id, 'handled')
              }}
              onSkip={() => advance(lead.id, 'skipped')}
              onDoNotCall={() => dnc.mutate(lead)}
            />
          </section>

          <section className="card enrich-next" aria-label="Leads suivants">
            <header className="widget-head" style={{ paddingBottom: 12 }}>
              <h2>À suivre</h2>
              <span className="hint">cliquez pour traiter un lead en premier</span>
            </header>
            {upcoming.length === 0 ? (
              <p className="muted small" style={{ padding: '0 24px 24px' }}>
                C’est le dernier lead de la liste.
              </p>
            ) : (
              <ul className="enrich-list">
                {upcoming.map((l) => (
                  <li key={l.id}>
                    <button type="button" onClick={() => setJumpTo(l.id)}>
                      <span className="lead-name truncate">{l.businessName}</span>
                      <span className="xs muted truncate">
                        {[l.businessType, l.addressCity].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function isTypingElsewhere(el: EventTarget | null, phoneInput: HTMLInputElement | null) {
  if (!(el instanceof HTMLElement) || el === phoneInput) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

interface FormProps {
  lead: BusinessDTO
  readOnly: boolean
  busy: boolean
  onSaved: () => void
  onSkip: () => void
  onDoNotCall: () => void
}

/**
 * One lead: look the number up (G), type or paste it, Enter to save and move on.
 * Letters never belong in a phone number, so G / P / N work even while the
 * phone field has focus.
 */
function EnrichForm({ lead, readOnly, busy, onSaved, onSkip, onDoNotCall }: FormProps) {
  const toast = useToast()
  const save = useSavePhone()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const check = validatePhone(value)
  const pending = save.isPending || busy

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
  }, [])

  const submit = () => {
    if (readOnly || pending) return
    if (!check.valid) {
      setError(check.error)
      inputRef.current?.focus()
      return
    }
    setError(null)
    save.mutate(
      { lead, phone: check.digits },
      {
        onSuccess: (l) => {
          toast(`Numéro ajouté — ${l.businessName} est dans la file d’appels`)
          onSaved()
        },
        onError: (e) => {
          setError(phoneErrorMessage(e))
          inputRef.current?.focus()
        },
      },
    )
  }

  const actions = useRef({ submit, onSkip, onDoNotCall })
  useEffect(() => {
    actions.current = { submit, onSkip, onDoNotCall }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      if (isTypingElsewhere(e.target, inputRef.current)) return
      const k = e.key.toLowerCase()
      if (k === 'g') {
        e.preventDefault()
        openSearch(lead)
      } else if (k === 'p') {
        e.preventDefault()
        actions.current.onSkip()
      } else if (k === 'n' && !readOnly) {
        e.preventDefault()
        actions.current.onDoNotCall()
      } else if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        inputRef.current?.blur()
      } else if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lead, readOnly])

  const address = [lead.addressStreet, lead.addressCity].filter(Boolean).join(', ')
  const hint = error ?? (value && check.valid ? 'Numéro valide — Entrée pour enregistrer' : null)

  return (
    <div className="enrich-form">
      <div className="lead-card-head">
        <h2 className="lead-card-name">{lead.businessName}</h2>
        <div className="lead-card-type">
          {lead.businessType ?? 'Type inconnu'}
          {lead.dataSource && <> · {lead.dataSource}</>}
        </div>
        {address && (
          <a className="enrich-address" href={mapsHref(lead)} target="_blank" rel="noreferrer">
            {address}
            {lead.postalCode && <span className="muted"> {lead.postalCode}</span>}
          </a>
        )}
      </div>

      <form
        className="enrich-entry"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <a
          className="btn btn-lg enrich-search"
          href={phoneSearchUrl(lead.businessName, lead.addressCity)}
          target="_blank"
          rel="noreferrer"
        >
          <IconSearch size={18} /> Chercher le numéro
          <IconExternalLink size={14} className="muted" />
          <kbd className="kbd hide-sm" aria-hidden="true">G</kbd>
        </a>
        <label className="field">
          <span>Téléphone</span>
          <PhoneInput
            ref={inputRef}
            className="input num enrich-phone"
            value={value}
            onValueChange={(v) => {
              setValue(v)
              if (error) setError(null)
            }}
            onEnter={submit}
            placeholder="(514) 555-1234"
            disabled={readOnly}
            aria-invalid={!!error}
            aria-describedby={`enrich-hint-${lead.id}`}
          />
        </label>
        <div id={`enrich-hint-${lead.id}`} className={error ? 'field-error' : 'small muted'} role={error ? 'alert' : undefined}>
          {hint ?? <span className="hide-sm">Collez ou tapez le numéro, puis Entrée.</span>}
        </div>
        <div className="enrich-actions">
          <button type="submit" className="btn btn-primary btn-lg" disabled={readOnly || pending || !value}>
            {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
            <kbd className="kbd hide-sm" aria-hidden="true">Entrée</kbd>
          </button>
          <button type="button" className="btn btn-lg" onClick={onSkip} disabled={pending}>
            <IconSkip size={16} /> Passer
            <kbd className="kbd hide-sm" aria-hidden="true">P</kbd>
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost btn-lg enrich-dnc" onClick={onDoNotCall} disabled={readOnly || pending}>
            Ne pas appeler
            <kbd className="kbd hide-sm" aria-hidden="true">N</kbd>
          </button>
        </div>
      </form>

      <SourceDetails lead={lead} caption={false} />
      <dl className="lead-facts">
        {lead.website && (
          <div>
            <dt>Site web</dt>
            <dd>
              <a href={lead.website} target="_blank" rel="noreferrer">
                {lead.website.replace(/^https?:\/\/(www\.)?/, '')}
              </a>
            </dd>
          </div>
        )}
        {lead.email && (
          <div>
            <dt>Courriel</dt>
            <dd>
              <a href={`mailto:${lead.email}`}>{lead.email}</a>
            </dd>
          </div>
        )}
        <div>
          <dt>Importé</dt>
          <dd>{formatRelative(lead.createdAt)}</dd>
        </div>
      </dl>
    </div>
  )
}
