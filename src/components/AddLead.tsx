import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'
import { createLead, findDuplicates, getLeadFilters } from '../api/endpoints'
import type { BusinessCreateRequest, BusinessDTO } from '../api/types'
import { errorMessage } from '../lib/errors'
import { formatPhone } from '../lib/format'
import { phoneDigits } from '../lib/phone'
import { IconAlert, IconPhone, IconX } from './icons'
import { PhoneInput } from './PhoneInput'
import { useToast } from './Toast'
import './session/session.css' // the shared .modal shell
import './add-lead.css'

const ORIGINS = ['Référence', 'Salon', 'Vu en passant', 'Site web', 'Autre']

interface Ctx {
  open: () => void
}
const AddLeadContext = createContext<Ctx | null>(null)

/** Mounts the "Ajouter un lead" modal once; any screen can open it with `useAddLead().open()`. */
export function AddLeadProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const open = useCallback(() => setOpen(true), [])
  const value = useMemo(() => ({ open }), [open])
  return (
    <AddLeadContext.Provider value={value}>
      {children}
      {isOpen && <AddLeadModal onClose={() => setOpen(false)} />}
    </AddLeadContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAddLead(): Ctx {
  const ctx = useContext(AddLeadContext)
  if (!ctx) throw new Error('useAddLead must be used inside <AddLeadProvider>')
  return ctx
}

interface Form {
  businessName: string
  phone: string
  businessType: string
  addressCity: string
  addressStreet: string
  postalCode: string
  email: string
  website: string
  leadSource: string
  decisionMaker: string
  notes: string
}
const EMPTY: Form = {
  businessName: '', phone: '', businessType: '', addressCity: '', addressStreet: '', postalCode: '',
  email: '', website: '', leadSource: '', decisionMaker: '', notes: '',
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function toCreateRequest(f: Form, force = false): BusinessCreateRequest {
  const t = (s: string) => s.trim() || undefined
  const decisionMaker = t(f.decisionMaker)
  return {
    businessName: f.businessName.trim(),
    phone: phoneDigits(f.phone) || undefined,
    businessType: t(f.businessType),
    addressCity: t(f.addressCity),
    addressStreet: t(f.addressStreet),
    postalCode: t(f.postalCode),
    email: t(f.email),
    website: t(f.website),
    leadSource: t(f.leadSource),
    notes: t(f.notes),
    qualification: decisionMaker ? { decisionMaker } : undefined,
    ...(force ? { force: true } : {}),
  }
}

function dupLabel(l: BusinessDTO): string {
  return [l.businessName, l.addressCity && `(${l.addressCity})`].filter(Boolean).join(' ')
}

export function AddLeadModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState<Form>(EMPTY)
  const [conflict, setConflict] = useState<BusinessDTO | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const nameRef = useRef<HTMLInputElement>(null)
  const options = useQuery({ queryKey: ['lead-filters'], queryFn: getLeadFilters, staleTime: 5 * 60_000 })

  useEffect(() => {
    nameRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setConflict(null)
    setFieldErrors((e) => (e[k] ? { ...e, [k]: '' } : e))
  }

  // Live "existe déjà ?" hints, debounced.
  const probe = useDebounced({ name: form.businessName.trim(), phone: phoneDigits(form.phone), city: form.addressCity.trim() }, 350)
  const enabled = probe.name.length >= 3 || probe.phone.length >= 7
  const dups = useQuery({
    queryKey: ['duplicates', probe],
    queryFn: ({ signal }) => findDuplicates({ name: probe.name || undefined, phone: probe.phone || undefined, city: probe.city || undefined }, signal),
    enabled,
    staleTime: 15_000,
  })
  const hints = enabled && !conflict ? (dups.data ?? []).slice(0, 3) : []

  const [andCall, setAndCall] = useState(false)
  const save = useMutation({
    mutationFn: (force: boolean) => createLead(toCreateRequest(form, force)),
    onSuccess: (lead) => {
      for (const k of ['leads', 'summary', 'queue', 'lead-filters', 'followups', 'duplicates']) void qc.invalidateQueries({ queryKey: [k] })
      toast(`Lead ajouté : ${lead.businessName}`)
      onClose()
      if (andCall && lead.phone) navigate(`/call?leadId=${lead.id}`)
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409 && e.data?.duplicate) {
        setConflict(e.data.duplicate as BusinessDTO)
        return
      }
      if (e instanceof ApiError && e.status === 400 && e.fields) setFieldErrors(e.fields)
      toast(errorMessage(e), 'error')
    },
  })

  const submit = (call: boolean, force = false) => {
    if (!form.businessName.trim()) {
      setFieldErrors({ businessName: 'Le nom est requis.' })
      nameRef.current?.focus()
      return
    }
    setAndCall(call)
    save.mutate(force)
  }
  const openExisting = (l: BusinessDTO) => {
    onClose()
    navigate(`/leads/${l.id}`)
  }
  const canCall = phoneDigits(form.phone).length === 10

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal add-lead" role="dialog" aria-modal="true" aria-labelledby="add-lead-title">
        <header className="modal-head">
          <div>
            <h2 id="add-lead-title">Ajouter un lead</h2>
            <p className="muted small">Une référence, un salon, un commerce repéré en chemin.</p>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fermer">
            <IconX size={20} />
          </button>
        </header>
        <form
          className="add-lead-form"
          onSubmit={(e) => {
            e.preventDefault()
            submit(false)
          }}
          noValidate
        >
          <div className="add-lead-body">
            {conflict && (
              <div className="al-conflict" role="alert">
                <div className="al-conflict-head">
                  <IconAlert size={18} />
                  <div>
                    <strong>Ce lead existe déjà</strong>
                    <div className="small">
                      {dupLabel(conflict)}
                      {conflict.phone && <span className="muted"> · {formatPhone(conflict.phone)}</span>}
                      {conflict.assignedToName && <span className="muted"> · assigné à {conflict.assignedToName}</span>}
                    </div>
                  </div>
                </div>
                <div className="al-conflict-actions">
                  <button type="button" className="btn btn-sm" onClick={() => openExisting(conflict)}>Ouvrir</button>
                  <button type="button" className="btn btn-sm" onClick={() => submit(andCall, true)} disabled={save.isPending}>Créer quand même</button>
                </div>
              </div>
            )}
            <div className="al-grid">
              <div className="field al-wide">
                <label htmlFor="al-name" className="field-label">Nom de l’entreprise <span className="req" aria-hidden="true">*</span></label>
                <input
                  id="al-name" ref={nameRef} className="input" value={form.businessName} autoComplete="off"
                  onChange={(e) => set('businessName', e.target.value)}
                  aria-invalid={!!fieldErrors.businessName} aria-describedby={fieldErrors.businessName ? 'al-name-err' : undefined}
                  placeholder="CPE Les Lucioles"
                />
                {fieldErrors.businessName && <span id="al-name-err" className="field-error">{fieldErrors.businessName}</span>}
              </div>
              <div className="field al-3">
                <label htmlFor="al-phone" className="field-label">Téléphone</label>
                <PhoneInput id="al-phone" className="input" value={form.phone} onValueChange={(v) => set('phone', v)} placeholder="(514) 555-1234" aria-invalid={!!fieldErrors.phone} />
                {fieldErrors.phone && <span className="field-error">{fieldErrors.phone}</span>}
              </div>
              <div className="field al-3">
                <label htmlFor="al-city" className="field-label">Ville</label>
                <input id="al-city" className="input" list="al-cities" value={form.addressCity} onChange={(e) => set('addressCity', e.target.value)} autoComplete="off" placeholder="Laval" />
                <datalist id="al-cities">{options.data?.cities.map((c) => <option key={c} value={c} />)}</datalist>
              </div>

              {hints.length > 0 && (
                <ul className="al-hints al-wide" aria-live="polite">
                  {hints.map((l) => (
                    <li key={l.id}>
                      <span className="dot" aria-hidden="true" />
                      <span className="al-hint-text">
                        <strong>Existe déjà :</strong> {dupLabel(l)}
                        {l.phone && <span className="muted"> · {formatPhone(l.phone)}</span>}
                      </span>
                      <button type="button" className="al-link" onClick={() => openExisting(l)}>Ouvrir</button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="field al-3">
                <label htmlFor="al-type" className="field-label">Type</label>
                <input id="al-type" className="input" list="al-types" value={form.businessType} onChange={(e) => set('businessType', e.target.value)} autoComplete="off" placeholder="Autre" />
                <datalist id="al-types">{options.data?.businessTypes.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div className="field al-3">
                <label htmlFor="al-origin" className="field-label">Origine</label>
                <input id="al-origin" className="input" list="al-origins" value={form.leadSource} onChange={(e) => set('leadSource', e.target.value)} autoComplete="off" placeholder="Référence, salon…" />
                <datalist id="al-origins">{ORIGINS.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div className="field al-4">
                <label htmlFor="al-street" className="field-label">Adresse</label>
                <input id="al-street" className="input" value={form.addressStreet} onChange={(e) => set('addressStreet', e.target.value)} autoComplete="off" />
              </div>
              <div className="field al-2 al-m3">
                <label htmlFor="al-postal" className="field-label">Code postal</label>
                <input id="al-postal" className="input" value={form.postalCode} onChange={(e) => set('postalCode', e.target.value)} autoComplete="off" placeholder="H7N 1A1" />
              </div>
              <div className="field al-2 al-m3">
                <label htmlFor="al-dm" className="field-label">Responsable</label>
                <input id="al-dm" className="input" value={form.decisionMaker} onChange={(e) => set('decisionMaker', e.target.value)} autoComplete="off" placeholder="Mme Gagnon" />
              </div>
              <div className="field al-2">
                <label htmlFor="al-email" className="field-label">Courriel</label>
                <input id="al-email" className="input" type="email" inputMode="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="off" />
              </div>
              <div className="field al-2">
                <label htmlFor="al-web" className="field-label">Site web</label>
                <input id="al-web" className="input" inputMode="url" value={form.website} onChange={(e) => set('website', e.target.value)} autoComplete="off" placeholder="https://" />
              </div>
              <div className="field al-wide">
                <label htmlFor="al-notes" className="field-label">Notes</label>
                <textarea id="al-notes" className="textarea" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Contexte, personne rencontrée, meilleur moment pour appeler…" />
              </div>
            </div>

          </div>
          <footer className="add-lead-foot">
            <button type="button" className="btn" onClick={onClose}>Annuler</button>
            <span className="spacer" />
            <button type="submit" className="btn btn-primary al-add" disabled={save.isPending}>
              {save.isPending && !andCall ? 'Ajout…' : 'Ajouter'}
            </button>
            <button type="button" className="btn btn-primary al-call-btn" disabled={save.isPending || !canCall} onClick={() => submit(true)} title={canCall ? undefined : 'Entrez un numéro de téléphone pour appeler tout de suite'}>
              <IconPhone size={16} /> {save.isPending && andCall ? 'Ajout…' : 'Ajouter et appeler'}
            </button>
          </footer>
        </form>
      </div>
    </>
  )
}
