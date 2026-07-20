import { hydrateIconSlot, setIconSlotKey, setIconSlotLoading } from '@ext/ui/mm-icons'

export type AgentThinkingOutcome = 'done' | 'stopped' | 'error'

/**
 * Format elapsed thinking time for the Thinking card header (Codex-style).
 * @param startedAtMs Epoch ms when thinking started
 * @param endedAtMs Epoch ms when thinking ended
 * @returns Human-readable duration label
 */
export function formatThinkingDuration(startedAtMs: number, endedAtMs: number): string {
  const seconds = Math.max(0, (endedAtMs - startedAtMs) / 1000)
  if (seconds < 10) {
    return `${seconds.toFixed(1)}s`
  }
  return `${Math.round(seconds)}s`
}

/**
 * Build an ephemeral Codex-style Thinking card (not persisted in session history).
 * @returns Root message element for the chat log
 */
export function createThinkingCardElement(): HTMLElement {
  const root = document.createElement('div')
  root.className = 'mm-sidepanel-message mm-sidepanel-message--thinking'
  root.dataset.ref = 'thinking-card'
  root.dataset.thinkingState = 'running'

  const card = document.createElement('div')
  card.className = 'mm-sidepanel-thinking'

  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'mm-sidepanel-thinking-toggle'
  toggle.setAttribute('aria-expanded', 'false')
  toggle.dataset.role = 'thinking-toggle'

  const icon = document.createElement('span')
  icon.className = 'mm-sidepanel-thinking-icon'
  icon.dataset.role = 'thinking-icon'
  const iconSlot = document.createElement('span')
  iconSlot.className = 'mm-icon-slot'
  iconSlot.dataset.icon = 'chatSparkle'
  icon.appendChild(iconSlot)
  setIconSlotLoading(iconSlot, true)

  const titleWrap = document.createElement('span')
  titleWrap.className = 'mm-sidepanel-thinking-titles'

  const title = document.createElement('span')
  title.className = 'mm-sidepanel-thinking-title'
  title.dataset.role = 'thinking-title'
  title.textContent = 'Thinking'

  const phase = document.createElement('span')
  phase.className = 'mm-sidepanel-thinking-phase'
  phase.dataset.role = 'thinking-phase'
  phase.textContent = 'Starting…'

  titleWrap.append(title, phase)

  const chevron = document.createElement('span')
  chevron.className = 'mm-sidepanel-thinking-chevron'
  chevron.dataset.icon = 'chevronDown'
  hydrateIconSlot(chevron)

  toggle.append(icon, titleWrap, chevron)

  const body = document.createElement('div')
  body.className = 'mm-sidepanel-thinking-body'
  body.dataset.role = 'thinking-body'
  // Collapsed by default — most users only need the header phase; expand on click.
  body.hidden = true

  const log = document.createElement('ul')
  log.className = 'mm-sidepanel-thinking-log'
  log.dataset.role = 'thinking-log'
  body.appendChild(log)

  toggle.addEventListener('click', () => {
    const expanded = body.hidden
    body.hidden = !expanded
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false')
  })

  card.append(toggle, body)
  root.appendChild(card)
  return root
}

/**
 * Append a phase line and update the header subtitle on a Thinking card.
 * @param root Thinking card root
 * @param text Short phase label
 * @param detail Optional longer log line
 */
export function updateThinkingCard(root: HTMLElement, text: string, detail?: string): void {
  const phase = root.querySelector('[data-role="thinking-phase"]')
  if (phase) {
    phase.textContent = text
  }

  const log = root.querySelector('[data-role="thinking-log"]')
  if (!(log instanceof HTMLElement)) {
    return
  }
  const line = detail?.trim() || text.trim()
  if (!line) {
    return
  }
  const last = log.lastElementChild
  if (last?.textContent === line) {
    return
  }
  const item = document.createElement('li')
  item.className = 'mm-sidepanel-thinking-log-item'
  item.textContent = line
  log.appendChild(item)
}

/**
 * Mark the Thinking card complete and collapse the body by default.
 * @param root Thinking card root
 * @param outcome Completion outcome
 * @param startedAtMs Epoch ms when thinking started
 * @param endedAtMs Epoch ms when thinking ended
 */
export function finalizeThinkingCard(root: HTMLElement, outcome: AgentThinkingOutcome, startedAtMs: number, endedAtMs: number): void {
  root.dataset.thinkingState = outcome === 'done' ? 'done' : outcome

  const title = root.querySelector('[data-role="thinking-title"]')
  const phase = root.querySelector('[data-role="thinking-phase"]')
  const duration = formatThinkingDuration(startedAtMs, endedAtMs)

  if (outcome === 'done') {
    if (title) {
      title.textContent = `Thought for ${duration}`
    }
    if (phase) {
      phase.textContent = 'Done'
    }
  } else if (outcome === 'stopped') {
    if (title) {
      title.textContent = `Stopped after ${duration}`
    }
    if (phase) {
      phase.textContent = 'Stopped'
    }
  } else {
    if (title) {
      title.textContent = `Interrupted after ${duration}`
    }
    if (phase) {
      phase.textContent = 'Error'
    }
  }

  const iconSlot = root.querySelector('[data-role="thinking-icon"] .mm-icon-slot') as HTMLElement | null
  if (iconSlot) {
    setIconSlotKey(iconSlot, outcome === 'error' ? 'alertCircle' : 'chatSparkle')
  }

  const body = root.querySelector('[data-role="thinking-body"]') as HTMLElement | null
  const toggle = root.querySelector('[data-role="thinking-toggle"]') as HTMLButtonElement | null
  if (body && toggle) {
    body.hidden = true
    toggle.setAttribute('aria-expanded', 'false')
  }
}
