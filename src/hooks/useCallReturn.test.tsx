// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCallReturn } from './useCallReturn'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Probe({ armed, onReturn }: { armed: boolean; onReturn: () => void }) {
  useCallReturn(armed, onReturn)
  return null
}

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useCallReturn', () => {
  let root: Root
  let host: HTMLDivElement
  const onReturn = vi.fn()

  beforeEach(() => {
    onReturn.mockReset()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    setVisibility('visible')
  })

  it('fires once when the page comes back after being hidden while armed', () => {
    act(() => root.render(<Probe armed onReturn={onReturn} />))
    act(() => setVisibility('hidden'))
    expect(onReturn).not.toHaveBeenCalled()
    act(() => setVisibility('visible'))
    expect(onReturn).toHaveBeenCalledTimes(1)
    act(() => setVisibility('visible'))
    expect(onReturn).toHaveBeenCalledTimes(1)
  })

  it('does nothing when no call was started', () => {
    act(() => root.render(<Probe armed={false} onReturn={onReturn} />))
    act(() => setVisibility('hidden'))
    act(() => setVisibility('visible'))
    expect(onReturn).not.toHaveBeenCalled()
  })

  it('ignores a page that was never hidden', () => {
    act(() => root.render(<Probe armed onReturn={onReturn} />))
    act(() => setVisibility('visible'))
    expect(onReturn).not.toHaveBeenCalled()
  })
})
