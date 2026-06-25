import { applyFloatingBarPosition, computeFloatingBarPosition } from './floating-bar-position'

/** Delay before hiding when pointer leaves anchor (ms) */
const HIDE_DELAY_MS = 120

/**
 * Create unified floating bar DOM (label + close in one pill)
 */
export function createFloatingBarElement(displayText: string, onClose: () => void, variant: 'select' | 'mark' = 'select'): HTMLElement {
  const bar = document.createElement('div')
  bar.className = `node-selector-floating-bar node-selector-floating-bar--${variant}`
  bar.setAttribute('data-placement', 'above')

  const callerEl = document.createElement('span')
  callerEl.className = 'node-selector-floating-bar__caller'
  callerEl.textContent = displayText
  callerEl.title = displayText

  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.className = 'node-selector-floating-bar__close'
  closeBtn.setAttribute('aria-label', 'Close')
  closeBtn.setAttribute('title', 'Close')
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    onClose()
  })

  bar.appendChild(callerEl)
  bar.appendChild(closeBtn)

  return bar
}

/**
 * Position and show floating bar relative to an anchor rect.
 */
export function showFloatingBarAtAnchor(bar: HTMLElement, anchorRect: DOMRect, scrollbarWidth = 0): void {
  bar.style.visibility = 'hidden'
  bar.classList.add('node-selector-floating-bar--visible')

  const width = bar.offsetWidth
  const height = bar.offsetHeight
  const position = computeFloatingBarPosition(anchorRect, width, height, scrollbarWidth)
  applyFloatingBarPosition(bar, position)

  bar.style.visibility = ''
}

export function hideFloatingBar(bar: HTMLElement | null): void {
  if (!bar) return
  bar.classList.remove('node-selector-floating-bar--visible')
}

/**
 * Wire hover show/hide for a floating bar anchored to a target element.
 */
export function bindFloatingBarHover(target: HTMLElement, bar: HTMLElement, getScrollbarWidth: () => number): () => void {
  let hideTimer: ReturnType<typeof setTimeout> | null = null

  const cancelHide = () => {
    if (hideTimer !== null) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
  }

  const scheduleHide = () => {
    cancelHide()
    hideTimer = setTimeout(() => {
      hideTimer = null
      hideFloatingBar(bar)
    }, HIDE_DELAY_MS)
  }

  const updatePosition = () => {
    if (!document.contains(target)) {
      hideFloatingBar(bar)
      return
    }
    showFloatingBarAtAnchor(bar, target.getBoundingClientRect(), getScrollbarWidth())
  }

  const onTargetEnter = () => {
    cancelHide()
    updatePosition()
  }

  const onTargetLeave = () => {
    scheduleHide()
  }

  const onBarEnter = () => {
    cancelHide()
  }

  const onBarLeave = () => {
    scheduleHide()
  }

  const onScrollOrResize = () => {
    if (bar.classList.contains('node-selector-floating-bar--visible')) {
      updatePosition()
    }
  }

  target.addEventListener('mouseenter', onTargetEnter)
  target.addEventListener('mouseleave', onTargetLeave)
  bar.addEventListener('mouseenter', onBarEnter)
  bar.addEventListener('mouseleave', onBarLeave)
  window.addEventListener('scroll', onScrollOrResize, true)
  window.addEventListener('resize', onScrollOrResize)

  return () => {
    cancelHide()
    target.removeEventListener('mouseenter', onTargetEnter)
    target.removeEventListener('mouseleave', onTargetLeave)
    bar.removeEventListener('mouseenter', onBarEnter)
    bar.removeEventListener('mouseleave', onBarLeave)
    window.removeEventListener('scroll', onScrollOrResize, true)
    window.removeEventListener('resize', onScrollOrResize)
    hideFloatingBar(bar)
  }
}
