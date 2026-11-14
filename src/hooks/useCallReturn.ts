import { useEffect, useRef } from 'react'

/** Phones and tablets: a coarse pointer or a phone-sized viewport. Desktop keeps the manual flow. */
export function isTouchCallingDevice(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(pointer: coarse), (max-width: 700px)').matches
}

/**
 * Fires `onReturn` when the page becomes visible again after it was hidden while `armed`
 * (the caller tapped the tel: link, the phone app took over, the call ended, the browser is back).
 */
export function useCallReturn(armed: boolean, onReturn: () => void) {
  const hidden = useRef(false)
  const cb = useRef(onReturn)
  useEffect(() => {
    cb.current = onReturn
  })
  useEffect(() => {
    if (!armed) {
      hidden.current = false
      return
    }
    const onChange = () => {
      if (document.visibilityState === 'hidden') {
        hidden.current = true
      } else if (hidden.current) {
        hidden.current = false
        cb.current()
      }
    }
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [armed])
}
