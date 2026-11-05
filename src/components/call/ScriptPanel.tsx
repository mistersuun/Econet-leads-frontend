import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getScript } from '../../api/endpoints'
import type { ScriptLanguage, ScriptSection, ScriptSectionKey } from '../../api/types'
import { parseObjections, substitutePlaceholders, type PlaceholderValues } from '../../lib/placeholders'
import { ErrorState, SkeletonRows } from '../States'
import { IconChevronDown } from '../icons'
import './script-panel.css'

export const COMPANY_NAME = 'EcoNet Propreté'

const TABS: { key: ScriptSectionKey; label: string; hotkey: string }[] = [
  { key: 'opening', label: 'Ouverture', hotkey: 'o' },
  { key: 'questions', label: 'Questions', hotkey: 'q' },
  { key: 'objections', label: 'Objections', hotkey: 'b' },
  { key: 'closing', label: 'Clôture', hotkey: 'c' },
]

interface Props {
  businessType: string | null
  language: ScriptLanguage
  onLanguageChange: (l: ScriptLanguage) => void
  values: PlaceholderValues
  /** Window-level O/Q/B/C shortcuts (off while the panel is hidden). */
  hotkeys?: boolean
}

function isTypingTarget(el: EventTarget | null) {
  return el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

/** Lines starting with "- " become a list; blank lines separate paragraphs. */
function Body({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n')
        if (lines.length > 1 && lines.every((l) => /^([-•*]|\d+[.)])\s/.test(l))) {
          return (
            <ul key={i} className="script-list">
              {lines.map((l, j) => (
                <li key={j}>{l.replace(/^([-•*]|\d+[.)])\s/, '')}</li>
              ))}
            </ul>
          )
        }
        return <p key={i}>{b}</p>
      })}
    </>
  )
}

function Objections({ body }: { body: string }) {
  const pairs = useMemo(() => parseObjections(body), [body])
  const [open, setOpen] = useState<number | null>(0)
  if (!pairs.length) return <Body text={body} />
  return (
    <ul className="objections">
      {pairs.map((p, i) => (
        <li key={i} className={open === i ? 'open' : undefined}>
          <button type="button" className="objection-q" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
            <span>{p.objection}</span>
            <IconChevronDown size={16} />
          </button>
          {open === i && <p className="objection-a">{p.reply}</p>}
        </li>
      ))}
    </ul>
  )
}

export function ScriptPanel({ businessType, language, onLanguageChange, values, hotkeys = true }: Props) {
  const [tab, setTab] = useState<ScriptSectionKey>('opening')
  const q = useQuery({ queryKey: ['script', businessType, language], queryFn: () => getScript(businessType, language), staleTime: 5 * 60_000 })

  useEffect(() => {
    if (!hotkeys) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTypingTarget(e.target)) return
      const t = TABS.find((x) => x.hotkey === e.key.toLowerCase())
      if (t) {
        e.preventDefault()
        setTab(t.key)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hotkeys])

  const fallbacks: PlaceholderValues = { decisionMaker: language === 'fr' ? 'madame, monsieur' : 'there', city: language === 'fr' ? 'votre secteur' : 'your area' }
  const sections = q.data?.sections ?? []
  const section: ScriptSection | undefined = sections.find((s) => s.key === tab) ?? sections[0]
  const text = section ? substitutePlaceholders(section.body, values, fallbacks) : ''

  return (
    <div className="script">
      <div className="script-head">
        <div className="segmented" role="tablist" aria-label="Sections du script">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} aria-pressed={tab === t.key} onClick={() => setTab(t.key)} title={`Raccourci : ${t.hotkey.toUpperCase()}`}>
              {t.label}
              <kbd className="kbd hide-mobile" aria-hidden="true">{t.hotkey.toUpperCase()}</kbd>
            </button>
          ))}
        </div>
        <div className="segmented script-lang" role="group" aria-label="Langue du script">
          <button type="button" aria-pressed={language === 'fr'} onClick={() => onLanguageChange('fr')}>
            FR
          </button>
          <button type="button" aria-pressed={language === 'en'} onClick={() => onLanguageChange('en')}>
            EN
          </button>
        </div>
      </div>
      <div className="script-body" role="tabpanel">
        {q.isPending ? (
          <SkeletonRows rows={6} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : !section ? (
          <p className="muted small">Aucun script pour cette langue.</p>
        ) : tab === 'objections' ? (
          <Objections body={text} />
        ) : (
          <Body text={text} />
        )}
      </div>
      {q.data && (
        <div className="script-foot xs muted">
          {q.data.name}
          {q.data.fallback && businessType ? ` · script par défaut (aucun script « ${businessType} »)` : ''}
        </div>
      )}
    </div>
  )
}
