import { forwardRef, useLayoutEffect, useRef, type InputHTMLAttributes, type KeyboardEvent } from 'react'
import { caretAfterDigits, formatPhoneInput } from '../lib/phone'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string
  onValueChange: (formatted: string) => void
  /** Called on Enter (no modifiers). */
  onEnter?: () => void
}

/**
 * Phone field with live "(514) 555-1234" formatting. Keeps the caret after the
 * same digit when the user edits in the middle, and accepts pasted numbers in
 * any shape ("+1 514-555-1234", "514.555.1234"…).
 */
export const PhoneInput = forwardRef<HTMLInputElement, Props>(function PhoneInput(
  { value, onValueChange, onEnter, onKeyDown, className = 'input', ...rest },
  ref,
) {
  const inner = useRef<HTMLInputElement | null>(null)
  const pendingCaret = useRef<number | null>(null)

  useLayoutEffect(() => {
    const el = inner.current
    if (el && pendingCaret.current !== null && document.activeElement === el) {
      el.setSelectionRange(pendingCaret.current, pendingCaret.current)
    }
    pendingCaret.current = null
  }, [value])

  const setRefs = (el: HTMLInputElement | null) => {
    inner.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }

  return (
    <input
      {...rest}
      ref={setRefs}
      className={className}
      type="tel"
      inputMode="tel"
      autoComplete="off"
      value={value}
      onChange={(e) => {
        const raw = e.target.value
        const caret = e.target.selectionStart ?? raw.length
        const digitsBefore = raw.slice(0, caret).replace(/\D/g, '').replace(/^1/, '').length
        const next = formatPhoneInput(raw)
        pendingCaret.current = caret >= raw.length ? next.length : caretAfterDigits(next, digitsBefore)
        onValueChange(next)
      }}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        onKeyDown?.(e)
        if (e.defaultPrevented) return
        if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && onEnter) {
          e.preventDefault()
          onEnter()
        }
      }}
    />
  )
})
