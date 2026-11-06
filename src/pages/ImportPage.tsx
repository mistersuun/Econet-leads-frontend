import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listJobs, runImport, uploadImportFile } from '../api/endpoints'
import { IMPORT_FIELDS, jobSourceName, type ImportField, type ImportMapping, type ImportUpload, type ScraperJobDTO } from '../api/types'
import { ErrorState } from '../components/States'
import { useToast } from '../components/Toast'
import { IconAlert, IconCheck, IconUpload } from '../components/icons'
import { errorMessage } from '../lib/errors'
import { formatNumber } from '../lib/format'
import {
  FIELD_LABEL,
  cleanMapping,
  countMissing,
  defaultSourceName,
  importCounts,
  parseDelimited,
  pasteToCsv,
  pasteToFile,
  previewRows,
  sniffDelimiter,
} from '../lib/importHelpers'
import './import.css'

const MAX_BYTES = 10 * 1024 * 1024
const TEXT_FILE = /\.(csv|tsv|txt)$/i
const STEPS = ['Fichier', 'Colonnes', 'Importation'] as const

type Stage = { name: 'source' } | { name: 'map'; upload: ImportUpload; rows: string[][] | null } | { name: 'run'; upload: ImportUpload; job: ScraperJobDTO }

export default function ImportPage() {
  const [stage, setStage] = useState<Stage>({ name: 'source' })
  const step = stage.name === 'source' ? 0 : stage.name === 'map' ? 1 : 2
  return (
    <div className="page import-page">
      <div className="page-header">
        <div>
          <h1>Importer des leads</h1>
          <p className="subtitle">Un fichier CSV ou Excel, ou des cellules copiées depuis un tableur.</p>
        </div>
      </div>
      <ol className="stepper" aria-label="Étapes">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? 'step' : undefined} className={i < step ? 'done' : i === step ? 'current' : undefined}>
            <span className="stepper-n">{i < step ? <IconCheck size={12} /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      {stage.name === 'source' && <SourceStep onUploaded={(upload, rows) => setStage({ name: 'map', upload, rows })} />}
      {stage.name === 'map' && (
        <MapStep upload={stage.upload} rows={stage.rows} onBack={() => setStage({ name: 'source' })} onStarted={(job) => setStage({ name: 'run', upload: stage.upload, job })} />
      )}
      {stage.name === 'run' && <RunStep upload={stage.upload} initial={stage.job} onAgain={() => setStage({ name: 'source' })} />}
    </div>
  )
}

// ------------------------------------------------------------------ step 1

function SourceStep({ onUploaded }: { onUploaded: (u: ImportUpload, rows: string[][] | null) => void }) {
  const toast = useToast()
  const [mode, setMode] = useState<'file' | 'paste'>('file')
  const [text, setText] = useState('')
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)

  const upload = useMutation({
    mutationFn: async (file: File) => {
      setProgress(0)
      const res = await uploadImportFile(file, { onProgress: (p) => setProgress(p.total ? p.loaded / p.total : 0) })
      // The server only returns 5 sample rows; read text files here too so the counts cover every row.
      let rows: string[][] | null = null
      if (TEXT_FILE.test(file.name)) {
        const t = await file.text()
        rows = parseDelimited(t, sniffDelimiter(t)).slice(1)
      }
      return { res, rows }
    },
    onSuccess: ({ res, rows }) => onUploaded(res, rows),
    onError: (e) => toast(errorMessage(e), 'error'),
    onSettled: () => setProgress(null),
  })

  const take = (file: File | undefined) => {
    if (!file) return
    if (!/\.(csv|tsv|txt|xlsx)$/i.test(file.name)) return toast('Format non supporté : choisissez un fichier .csv, .tsv, .txt ou .xlsx.', 'error')
    if (file.size > MAX_BYTES) return toast('Fichier trop volumineux (10 Mo maximum).', 'error')
    upload.mutate(file)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    take(e.dataTransfer.files[0])
  }

  const pasted = useMemo(() => (text.trim() ? pasteToCsv(text) : null), [text])
  const sendPaste = () => {
    const file = pasteToFile(text)
    if (file) upload.mutate(file)
  }
  const busy = upload.isPending

  return (
    <section className="card import-card">
      <div className="segmented" role="group" aria-label="Source des données">
        <button type="button" aria-pressed={mode === 'file'} onClick={() => setMode('file')}>Fichier</button>
        <button type="button" aria-pressed={mode === 'paste'} onClick={() => setMode('paste')}>Coller du texte</button>
      </div>

      {mode === 'file' ? (
        <div
          className={`dropzone${over ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          <IconUpload size={26} />
          <strong>{busy ? 'Envoi du fichier…' : 'Déposez un fichier ici'}</strong>
          <span className="small muted">CSV, TSV, TXT ou Excel (.xlsx) · 10 Mo maximum · la première ligne doit contenir les en-têtes</span>
          {busy && progress !== null ? (
            <div className="upload-bar" role="progressbar" aria-label="Envoi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <span style={{ width: `${progress * 100}%` }} />
            </div>
          ) : (
            <button type="button" className="btn" onClick={() => input.current?.click()}>Choisir un fichier</button>
          )}
          <input ref={input} type="file" hidden accept=".csv,.tsv,.txt,.xlsx,text/csv" onChange={(e) => { take(e.target.files?.[0]); e.target.value = '' }} />
        </div>
      ) : (
        <div className="paste">
          <label htmlFor="paste-area" className="field-label">Collez vos cellules ici</label>
          <textarea
            id="paste-area"
            className="textarea paste-area"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Nom\tTéléphone\tVille\nCPE Les Lucioles\t514 555-1234\tLaval'}
            spellCheck={false}
          />
          <div className="paste-foot">
            <span className="small muted" aria-live="polite">
              {pasted ? `${formatNumber(pasted.rowCount)} ligne${pasted.rowCount > 1 ? 's' : ''} · ${pasted.columns.length} colonne${pasted.columns.length > 1 ? 's' : ''} détectées` : text.trim() ? 'Il faut une ligne d’en-têtes et au moins une ligne de données.' : 'Copiez depuis Excel ou Google Sheets, en-têtes inclus. Séparateurs tabulation, point-virgule ou virgule.'}
            </span>
            <button type="button" className="btn btn-primary" disabled={!pasted || busy} onClick={sendPaste}>
              {busy ? 'Envoi…' : 'Continuer'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

// ------------------------------------------------------------------ step 2

function MapStep({ upload, rows, onBack, onStarted }: { upload: ImportUpload; rows: string[][] | null; onBack: () => void; onStarted: (job: ScraperJobDTO) => void }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [mapping, setMapping] = useState<ImportMapping>(upload.suggestedMapping)
  const [businessType, setBusinessType] = useState('')
  const [city, setCity] = useState('')
  const [sourceName, setSourceName] = useState(() =>
    upload.fileName === 'collage.csv' ? `Collage ${new Date().toISOString().slice(0, 10)}` : defaultSourceName(upload.fileName),
  )
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [assignToMe, setAssignToMe] = useState(false)

  const known = rows ?? upload.sampleRows
  const complete = rows !== null
  const counts = useMemo(() => countMissing(upload.columns, known, mapping), [upload.columns, known, mapping])
  const preview = useMemo(() => previewRows(upload.columns, upload.sampleRows, mapping), [upload.columns, upload.sampleRows, mapping])
  const shown = IMPORT_FIELDS.filter((f) => mapping[f])
  const nameOk = !!mapping.businessName
  const ready = nameOk && sourceName.trim().length > 0

  const run = useMutation({
    mutationFn: () =>
      runImport(upload.importId, {
        mapping: cleanMapping(mapping),
        defaults: { businessType: businessType.trim() || undefined, addressCity: city.trim() || undefined, sourceName: sourceName.trim() },
        skipDuplicates,
        assignToMe,
      }),
    onSuccess: (job) => {
      void qc.invalidateQueries({ queryKey: ['jobs-running'] })
      onStarted(job)
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  const setField = (f: ImportField, v: string) => setMapping((m) => ({ ...m, [f]: v || null }))
  const scope = complete ? '' : ' dans l’aperçu'

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card import-card">
        <header className="import-head">
          <div>
            <h2>Associer les colonnes</h2>
            <p className="small muted">
              <strong>{upload.fileName}</strong> · {formatNumber(upload.rowCount)} ligne{upload.rowCount > 1 ? 's' : ''} · {upload.columns.length} colonnes
            </p>
          </div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onBack}>Changer de fichier</button>
        </header>
        <div className="map-grid">
          {IMPORT_FIELDS.map((f) => (
            <div className="field" key={f}>
              <label htmlFor={`map-${f}`} className="field-label">
                {FIELD_LABEL[f]}
                {f === 'businessName' && <span className="req" aria-hidden="true"> *</span>}
              </label>
              <select id={`map-${f}`} className={`select${mapping[f] ? ' has-value' : ''}`} value={mapping[f] ?? ''} onChange={(e) => setField(f, e.target.value)} aria-invalid={f === 'businessName' && !nameOk}>
                <option value="">— Ignorer —</option>
                {upload.columns.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="map-counts" aria-live="polite">
          <span className="muted">{formatNumber(counts.total)} ligne{counts.total > 1 ? 's' : ''}{scope}</span>
          <span className={counts.missingName ? 'bad' : 'muted'} data-testid="missing-name">
            {counts.missingName ? <IconAlert size={14} /> : <IconCheck size={14} />} {counts.missingName} sans nom{counts.missingName ? ' (rejetées)' : ''}
          </span>
          <span className={counts.missingPhone ? 'bad' : 'muted'} data-testid="missing-phone">
            {counts.missingPhone ? <IconAlert size={14} /> : <IconCheck size={14} />} {counts.missingPhone} sans téléphone
          </span>
        </div>
        {!nameOk && <p className="field-error" role="alert">Choisissez la colonne qui contient le nom de l’entreprise.</p>}

        {shown.length > 0 && (
          <div className="table-wrap preview">
            <table className="table">
              <thead>
                <tr>
                  {shown.map((f) => (
                    <th key={f}>{FIELD_LABEL[f]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    {shown.map((f) => {
                      const v = r[f] ?? ''
                      const bad = !v && (f === 'businessName' || f === 'phone')
                      return (
                        <td key={f} className={bad ? 'cell-bad' : undefined}>
                          {v ? <span className="truncate cell">{v}</span> : <span className="muted">{bad ? 'manquant' : '—'}</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card import-card">
        <h2>Réglages</h2>
        <div className="defaults-grid">
          <div className="field">
            <label htmlFor="imp-source" className="field-label">Nom de la source <span className="req" aria-hidden="true">*</span></label>
            <input id="imp-source" className="input" value={sourceName} onChange={(e) => setSourceName(e.target.value)} aria-invalid={!sourceName.trim()} />
            <span className="small muted">Les leads seront classés sous « Import – {sourceName.trim() || '…'} ».</span>
          </div>
          <div className="field">
            <label htmlFor="imp-type" className="field-label">Type par défaut</label>
            <input id="imp-type" className="input" value={businessType} onChange={(e) => setBusinessType(e.target.value)} placeholder="Si la colonne est vide ou absente" />
          </div>
          <div className="field">
            <label htmlFor="imp-city" className="field-label">Ville par défaut</label>
            <input id="imp-city" className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Si la colonne est vide ou absente" />
          </div>
        </div>
        <div className="toggles">
          <label className="check"><input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} /> Ignorer les doublons (sinon, les fiches existantes sont complétées)</label>
          <label className="check"><input type="checkbox" checked={assignToMe} onChange={(e) => setAssignToMe(e.target.checked)} /> Me les assigner</label>
        </div>
        <div className="import-actions">
          <button type="button" className="btn btn-primary btn-lg" disabled={!ready || run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? 'Lancement…' : `Importer ${formatNumber(upload.rowCount)} ligne${upload.rowCount > 1 ? 's' : ''}`}
          </button>
        </div>
      </section>
    </div>
  )
}

// ------------------------------------------------------------------ step 3

function RunStep({ upload, initial, onAgain }: { upload: ImportUpload; initial: ScraperJobDTO; onAgain: () => void }) {
  const qc = useQueryClient()
  const poll = useQuery({
    queryKey: ['import-job', initial.id],
    // The existing job list is the polling surface (same as the Sources page).
    queryFn: async () => (await listJobs(0, 20)).content.find((j) => j.id === initial.id) ?? null,
    refetchInterval: (q) => {
      const s = (q.state.data ?? initial).status
      return s === 'PENDING' || s === 'RUNNING' ? 1000 : false
    },
  })
  const job = poll.data ?? initial
  const finished = job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED'
  const refreshed = useRef(false)
  useEffect(() => {
    if (!finished || refreshed.current) return
    refreshed.current = true
    for (const k of ['leads', 'summary', 'lead-filters', 'queue', 'sources', 'jobs', 'jobs-running', 'job-stats', 'breakdown', 'pipeline']) void qc.invalidateQueries({ queryKey: [k] })
  }, [finished, qc])

  const processed = job.recordsProcessed ?? 0
  const pct = job.status === 'COMPLETED' ? 1 : upload.rowCount ? Math.min(0.99, processed / upload.rowCount) : 0

  if (poll.isError && !poll.data) return <section className="card"><ErrorState error={poll.error} onRetry={() => void poll.refetch()} /></section>

  if (!finished) {
    return (
      <section className="card import-card" aria-live="polite">
        <h2>Importation en cours</h2>
        <p className="small muted">
          <span className="status-dot"><span className="dot pulse" style={{ background: '#4a72b0' }} /> {job.status === 'PENDING' ? 'En attente' : 'Traitement des lignes'}</span>
          {' · '}{formatNumber(processed)} sur {formatNumber(upload.rowCount)}
        </p>
        <div className="upload-bar" role="progressbar" aria-label="Importation" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}>
          <span style={{ width: `${pct * 100}%` }} />
        </div>
      </section>
    )
  }

  if (job.status !== 'COMPLETED') {
    return (
      <section className="card import-card">
        <h2>L’importation a échoué</h2>
        <p className="field-error">{job.errors ?? 'Erreur inconnue.'}</p>
        <div className="import-actions"><button type="button" className="btn" onClick={onAgain}>Recommencer</button></div>
      </section>
    )
  }

  const c = importCounts(job)
  const source = jobSourceName(job)
  const detail = (job.log ?? '').split('\n').slice(1).filter(Boolean)
  const cells: [string, number, string][] = [
    ['Ajoutés', c.added, '#2f7a5c'],
    ['Mis à jour', c.updated, '#4a72b0'],
    ['Ignorés', c.skipped, '#a1a1a6'],
    ['Invalides', c.invalid, '#c4613f'],
  ]
  return (
    <section className="card import-card" aria-live="polite">
      <h2>Importation terminée</h2>
      <p className="small muted">{upload.fileName} · {formatNumber(job.recordsProcessed ?? upload.rowCount)} lignes traitées</p>
      <div className="summary" role="list">
        {cells.map(([label, n, color]) => (
          <div key={label} role="listitem" className="summary-cell">
            <span className="summary-n num">{formatNumber(n)}</span>
            <span className="status-dot"><span className="dot" style={{ background: color }} /> {label}</span>
          </div>
        ))}
      </div>
      {detail.length > 0 && (
        <details className="invalid-log">
          <summary>Voir les lignes invalides ({detail.length})</summary>
          <ul>{detail.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </details>
      )}
      <div className="import-actions">
        <Link className="btn btn-primary" to={`/leads?source=${encodeURIComponent(source)}`}>Voir les leads importés</Link>
        <button type="button" className="btn" onClick={onAgain}>Nouvel import</button>
      </div>
    </section>
  )
}
