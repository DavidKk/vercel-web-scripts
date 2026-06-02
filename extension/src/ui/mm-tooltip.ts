import { computeMmTooltipPosition, type MmTooltipAlign, type MmTooltipPlacement } from './mm-tooltip-position'

const TOOLTIP_SELECTOR = '[data-mm-tooltip]'

let tooltipEl: HTMLDivElement | null = null
let activeTrigger: HTMLElement | null = null
let hideTimer: ReturnType<typeof setTimeout> | undefined
let scrollListenerBound = false

function parsePlacement(value: string | null | undefined): MmTooltipPlacement {
  if (value === 'top' || value === 'bottom' || value === 'left' || value === 'right') {
    return value
  }
  return 'bottom'
}

function parseAlign(value: string | null | undefined): MmTooltipAlign {
  if (value === 'start' || value === 'end') {
    return value
  }
  return 'center'
}

function ensureTooltipElement(): HTMLDivElement {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div')
    tooltipEl.id = 'mm-tooltip-root'
    tooltipEl.className = 'mm-tooltip'
    tooltipEl.setAttribute('role', 'tooltip')
  }
  return tooltipEl
}

function findTooltipTrigger(target: EventTarget | null): HTMLElement | null {
  if (!target) {
    return null
  }
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null
  if (!element) {
    return null
  }
  const host = element.closest('mm-tooltip')
  if (host instanceof MmTooltip) {
    return host.triggerElement
  }
  return element.closest<HTMLElement>(TOOLTIP_SELECTOR)
}

function measureTooltip(host: HTMLDivElement, content: string): { width: number; height: number } {
  host.textContent = content
  host.classList.add('is-visible')
  if (!host.isConnected) {
    document.body.appendChild(host)
  }
  host.style.visibility = 'visible'
  host.style.left = '-10000px'
  host.style.top = '0'
  const width = host.offsetWidth
  const height = host.offsetHeight
  return { width: Math.max(width, 1), height: Math.max(height, 1) }
}

function repositionTooltip(trigger: HTMLElement, content: string): void {
  const host = ensureTooltipElement()
  const preferred = parsePlacement(trigger.getAttribute('data-mm-tooltip-placement'))
  const align = parseAlign(trigger.getAttribute('data-mm-tooltip-align'))
  const { width: tw, height: th } = measureTooltip(host, content)
  const rect = trigger.getBoundingClientRect()
  const viewport = { width: window.innerWidth, height: window.innerHeight }
  const { left, top, placement } = computeMmTooltipPosition(rect, tw, th, preferred, viewport, align)
  host.dataset.placement = placement
  host.style.left = `${left}px`
  host.style.top = `${top}px`
  host.style.visibility = 'visible'
  host.classList.add('is-visible')
}

function showTooltip(trigger: HTMLElement): void {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = undefined
  }

  const content = trigger.getAttribute('data-mm-tooltip')?.trim()
  if (!content) {
    hideTooltip()
    return
  }

  activeTrigger = trigger
  const host = ensureTooltipElement()
  host.classList.toggle('is-wide', trigger.hasAttribute('data-mm-tooltip-wide'))
  repositionTooltip(trigger, content)
  bindScrollReposition()
}

function hideTooltip(): void {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = undefined
  }
  activeTrigger = null
  tooltipEl?.classList.remove('is-visible', 'is-wide')
  if (tooltipEl) {
    tooltipEl.style.visibility = 'hidden'
  }
}

function scheduleHide(): void {
  if (hideTimer) {
    clearTimeout(hideTimer)
  }
  hideTimer = setTimeout(() => {
    hideTooltip()
  }, 80)
}

function bindScrollReposition(): void {
  if (scrollListenerBound) {
    return
  }
  scrollListenerBound = true
  window.addEventListener(
    'scroll',
    () => {
      if (!activeTrigger || !tooltipEl?.classList.contains('is-visible')) {
        return
      }
      const content = activeTrigger.getAttribute('data-mm-tooltip')?.trim()
      if (!content) {
        hideTooltip()
        return
      }
      repositionTooltip(activeTrigger, content)
    },
    true
  )
  window.addEventListener('resize', () => {
    if (!activeTrigger) {
      return
    }
    const content = activeTrigger.getAttribute('data-mm-tooltip')?.trim()
    if (!content) {
      hideTooltip()
      return
    }
    repositionTooltip(activeTrigger, content)
  })
}

function onPointerOver(event: MouseEvent): void {
  const trigger = findTooltipTrigger(event.target)
  if (!trigger) {
    return
  }
  const related = event.relatedTarget
  if (related instanceof Node && trigger.contains(related)) {
    return
  }
  showTooltip(trigger)
}

function onPointerOut(event: MouseEvent): void {
  const trigger = findTooltipTrigger(event.target)
  if (!trigger) {
    return
  }
  const related = event.relatedTarget
  if (related instanceof Node && trigger.contains(related)) {
    return
  }
  if (tooltipEl && related instanceof Node && tooltipEl.contains(related)) {
    return
  }
  if (activeTrigger === trigger) {
    scheduleHide()
  }
}

function onFocusIn(event: FocusEvent): void {
  const trigger = findTooltipTrigger(event.target)
  if (trigger) {
    showTooltip(trigger)
  }
}

function onFocusOut(event: FocusEvent): void {
  const trigger = findTooltipTrigger(event.target)
  if (!trigger) {
    return
  }
  const related = event.relatedTarget
  if (related instanceof Node && trigger.contains(related)) {
    return
  }
  if (activeTrigger === trigger) {
    scheduleHide()
  }
}

/**
 * Update tooltip copy on a trigger (dynamic labels).
 * @param trigger Element with `data-mm-tooltip`
 * @param content Tooltip text
 * @param placement Optional preferred placement
 */
export function updateMmTooltip(trigger: HTMLElement, content: string, placement?: MmTooltipPlacement): void {
  trigger.setAttribute('data-mm-tooltip', content)
  trigger.removeAttribute('title')
  if (placement) {
    trigger.setAttribute('data-mm-tooltip-placement', placement)
  }
  if (activeTrigger === trigger && tooltipEl?.classList.contains('is-visible')) {
    repositionTooltip(trigger, content)
  }
}

/**
 * Event delegation for `[data-mm-tooltip]` under a root node.
 * @param root Container (e.g. `mm-options-app`)
 */
export function initMmTooltipDelegation(root: HTMLElement): void {
  if (root.dataset.mmTooltipDelegation === '1') {
    return
  }
  root.dataset.mmTooltipDelegation = '1'
  root.addEventListener('mouseover', onPointerOver)
  root.addEventListener('mouseout', onPointerOut)
  root.addEventListener('focusin', onFocusIn)
  root.addEventListener('focusout', onFocusOut)
}

/**
 * Wrap a trigger with declarative tooltip metadata (applies to first child).
 */
export class MmTooltip extends HTMLElement {
  /** Resolved trigger element inside the host. */
  triggerElement: HTMLElement | null = null

  connectedCallback(): void {
    this.triggerElement = this.firstElementChild as HTMLElement | null
    const content = this.getAttribute('content')?.trim()
    if (!this.triggerElement || !content) {
      return
    }
    this.triggerElement.setAttribute('data-mm-tooltip', content)
    this.triggerElement.removeAttribute('title')
    const placement = this.getAttribute('placement')
    if (placement) {
      this.triggerElement.setAttribute('data-mm-tooltip-placement', placement)
    }
    const root = this.closest('mm-options-app') ?? this.closest('mm-scripts-app') ?? document.body
    if (root instanceof HTMLElement) {
      initMmTooltipDelegation(root)
    }
  }

  disconnectedCallback(): void {
    if (activeTrigger === this.triggerElement) {
      hideTooltip()
    }
  }
}

export function defineMmTooltip(): void {
  if (!customElements.get('mm-tooltip')) {
    customElements.define('mm-tooltip', MmTooltip)
  }
}
