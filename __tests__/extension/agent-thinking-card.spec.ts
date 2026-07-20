/**
 * @jest-environment jsdom
 */
import { createThinkingCardElement, finalizeThinkingCard, formatThinkingDuration, updateThinkingCard } from '@ext/ui/sidepanel/agent-thinking-card'

jest.mock('@ext/ui/mm-icons', () => ({
  hydrateIconSlot: jest.fn(),
  setIconSlotKey: jest.fn((el: HTMLElement, key: string) => {
    el.setAttribute('data-icon', key)
  }),
  setIconSlotLoading: jest.fn(),
}))

describe('agent-thinking-card', () => {
  it('should format short thinking durations with one decimal place', () => {
    expect(formatThinkingDuration(1_000, 3_400)).toBe('2.4s')
  })

  it('should round longer thinking durations to whole seconds', () => {
    expect(formatThinkingDuration(0, 12_400)).toBe('12s')
  })

  it('should create a collapsed thinking card with running state', () => {
    const root = createThinkingCardElement()
    expect(root.dataset.thinkingState).toBe('running')
    expect(root.querySelector('[data-role="thinking-title"]')?.textContent).toBe('Thinking')
    expect(root.querySelector('[data-role="thinking-toggle"]')?.getAttribute('aria-expanded')).toBe('false')
    expect((root.querySelector('[data-role="thinking-body"]') as HTMLElement | null)?.hidden).toBe(true)
  })

  it('should append unique phase details to the thinking log', () => {
    const root = createThinkingCardElement()
    updateThinkingCard(root, 'Thinking…', 'Asking the model how to answer your request.')
    updateThinkingCard(root, 'Thinking…', 'Asking the model how to answer your request.')
    updateThinkingCard(root, 'Running tool…', 'Calling WebMCP tool “demo”.')

    expect(root.querySelector('[data-role="thinking-phase"]')?.textContent).toBe('Running tool…')
    const items = [...root.querySelectorAll('[data-role="thinking-log"] li')].map((item) => item.textContent)
    expect(items).toEqual(['Asking the model how to answer your request.', 'Calling WebMCP tool “demo”.'])
  })

  it('should finalize done/stopped/error outcomes and collapse the body', () => {
    const root = createThinkingCardElement()
    updateThinkingCard(root, 'Thinking…', 'Working…')

    finalizeThinkingCard(root, 'done', 1_000, 3_400)
    expect(root.dataset.thinkingState).toBe('done')
    expect(root.querySelector('[data-role="thinking-title"]')?.textContent).toBe('Thought for 2.4s')
    expect(root.querySelector('[data-role="thinking-toggle"]')?.getAttribute('aria-expanded')).toBe('false')
    expect((root.querySelector('[data-role="thinking-body"]') as HTMLElement).hidden).toBe(true)

    const stopped = createThinkingCardElement()
    finalizeThinkingCard(stopped, 'stopped', 0, 5_000)
    expect(stopped.dataset.thinkingState).toBe('stopped')
    expect(stopped.querySelector('[data-role="thinking-title"]')?.textContent).toBe('Stopped after 5.0s')

    const errored = createThinkingCardElement()
    finalizeThinkingCard(errored, 'error', 0, 11_000)
    expect(errored.dataset.thinkingState).toBe('error')
    expect(errored.querySelector('[data-role="thinking-title"]')?.textContent).toBe('Interrupted after 11s')
    expect(errored.querySelector('[data-role="thinking-phase"]')?.textContent).toBe('Error')
  })

  it('should toggle aria-expanded when the thinking header is clicked', () => {
    const root = createThinkingCardElement()
    const toggle = root.querySelector('[data-role="thinking-toggle"]') as HTMLButtonElement
    const body = root.querySelector('[data-role="thinking-body"]') as HTMLElement

    expect(body.hidden).toBe(true)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    toggle.click()
    expect(body.hidden).toBe(false)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')

    toggle.click()
    expect(body.hidden).toBe(true)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })
})
