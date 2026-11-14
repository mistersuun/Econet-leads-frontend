// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuickOutcomeSheet } from './QuickOutcomeSheet'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('QuickOutcomeSheet', () => {
  let root: Root
  let host: HTMLDivElement
  const onQuick = vi.fn()
  const onDetailed = vi.fn()
  const onClose = vi.fn()

  beforeEach(() => {
    onQuick.mockReset()
    onDetailed.mockReset()
    onClose.mockReset()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<QuickOutcomeSheet leadName="CPE Les Lucioles" durationSeconds={75} onQuick={onQuick} onDetailed={onDetailed} onClose={onClose} />))
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  const button = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement
  const click = (el: HTMLElement) => act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))

  it('shows the lead, the duration and the six large buttons', () => {
    expect(host.textContent).toContain('CPE Les Lucioles')
    expect(host.textContent).toContain('1:15')
    const labels = [...host.querySelectorAll('.quick-btn')].map((b) => b.textContent?.trim())
    expect(labels).toEqual(['Pas de réponse', 'Message laissé', 'A parlé', 'Rappeler', 'Pas intéressé', 'Mauvais numéro'])
    expect(host.querySelector('[role="dialog"]')).toBeTruthy()
  })

  it('logs the four quick outcomes straight away', () => {
    click(button('Pas de réponse'))
    click(button('Message laissé'))
    click(button('Pas intéressé'))
    click(button('Mauvais numéro'))
    expect(onQuick.mock.calls.map((c) => c[0])).toEqual(['NO_ANSWER', 'VOICEMAIL', 'NOT_INTERESTED', 'WRONG_NUMBER'])
    expect(onDetailed).not.toHaveBeenCalled()
  })

  it('hands "A parlé" and "Rappeler" to the detailed form', () => {
    click(button('A parlé'))
    click(button('Rappeler'))
    expect(onDetailed.mock.calls.map((c) => c[0])).toEqual(['SPOKE', 'CALLBACK'])
    expect(onQuick).not.toHaveBeenCalled()
  })

  it('closes with the close button and Escape', () => {
    click(host.querySelector('button[aria-label="Fermer"]')!)
    act(() => host.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
