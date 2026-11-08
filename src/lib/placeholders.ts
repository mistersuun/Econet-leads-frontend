// `{{placeholder}}` substitution for call scripts and email previews, done
// client-side as the contract asks. Unknown keys are left in place so a typo in
// a script is visible rather than silently blank.

export type PlaceholderValues = Record<string, string | null | undefined>

const TOKEN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g

/** Replace every `{{key}}` with `values[key]`, using `fallbacks[key]` for empty values. */
export function substitutePlaceholders(text: string, values: PlaceholderValues, fallbacks: PlaceholderValues = {}): string {
  return text.replace(TOKEN, (match, key: string) => {
    const v = values[key]
    if (v !== null && v !== undefined && String(v).trim() !== '') return String(v)
    const f = fallbacks[key]
    if (f !== null && f !== undefined) return String(f)
    return match
  })
}

/** The placeholder keys a text uses, in order of first appearance. */
export function placeholderKeys(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(TOKEN)) if (!out.includes(m[1])) out.push(m[1])
  return out
}

export interface ObjectionPair {
  objection: string
  reply: string
}

/**
 * The objections section is a text list of objection → reply pairs. Accepted
 * shapes (one pair per paragraph, paragraphs separated by a blank line):
 *   "Objection → reply", "Objection -> reply",
 *   "Objection\nReply", "Objection : …\nRéponse : …", "- Objection\n  Reply".
 * Returns an empty list when nothing looks like a pair, so the caller can show the raw text.
 */
export function parseObjections(body: string): ObjectionPair[] {
  const paragraphs = body
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  const pairs: ObjectionPair[] = []
  // A paragraph with several "A → B" lines is also a list of pairs.
  const lines = paragraphs.flatMap((p) => (p.includes('\n') && p.split('\n').every((l) => /(→|->)/.test(l)) ? p.split('\n') : [p]))
  for (const block of lines) {
    const arrow = /^(.*?)\s*(?:→|->)\s*([\s\S]+)$/.exec(block)
    if (arrow) {
      pairs.push({ objection: clean(arrow[1]), reply: clean(arrow[2]) })
      continue
    }
    const parts = block.split('\n').map((l) => l.trim()).filter(Boolean)
    if (parts.length >= 2) {
      pairs.push({ objection: clean(parts[0]), reply: clean(parts.slice(1).join(' ')) })
    }
  }
  return pairs
}

function clean(s: string): string {
  return s
    .replace(/^[-•*]\s*/, '')
    .replace(/^(objection|réponse|reponse|reply|answer|r|q|o)\s*:\s*/i, '')
    .replace(/^«\s*|\s*»$/g, '')
    .replace(/^"|"$/g, '')
    .trim()
}
