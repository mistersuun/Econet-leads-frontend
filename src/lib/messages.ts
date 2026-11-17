/** The backend job log can repeat the same retry message; show each distinct line once. */
export function dedupeMessage(msg: string | null | undefined): string | null {
  if (!msg) return null
  const parts = msg.split(/\r?\n|;\s*/).map((p) => p.trim()).filter(Boolean)
  return [...new Set(parts)].join(' ')
}

/** "189.5 $" (dot decimals from the importer) -> "189,50 $". */
export function displayValue(v: string): string {
  const m = /^(\d+\.\d+)\s*\$$/.exec(v.trim())
  if (!m) return v
  return `${Number(m[1]).toFixed(2).replace('.', ',')}\u00a0$`
}
