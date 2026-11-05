import { useCallback, useEffect, useRef, useState } from 'react'

export interface CallTimer {
  running: boolean
  /** Seconds elapsed (live while running, frozen after stop). */
  elapsed: number
  /** True once the timer has been started for this lead (running or stopped). */
  started: boolean
  start: () => void
  /** Stops and returns the final duration in seconds (0 if never started). */
  stop: () => number
  reset: () => void
}

/** mm:ss call timer. Start on "Appel lancé" / tapping the number, stop on outcome. */
export function useCallTimer(): CallTimer {
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [started, setStarted] = useState(false)
  const startedAt = useRef<number | null>(null)

  useEffect(() => {
    if (!running) return
    const tick = () => setElapsed(Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000))
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [running])

  const start = useCallback(() => {
    if (startedAt.current !== null) return
    startedAt.current = Date.now()
    setStarted(true)
    setElapsed(0)
    setRunning(true)
  }, [])

  const stop = useCallback(() => {
    if (startedAt.current === null) return 0
    const total = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000))
    setElapsed(total)
    setRunning(false)
    return total
  }, [])

  const reset = useCallback(() => {
    startedAt.current = null
    setRunning(false)
    setElapsed(0)
    setStarted(false)
  }, [])

  return { running, elapsed, started, start, stop, reset }
}
