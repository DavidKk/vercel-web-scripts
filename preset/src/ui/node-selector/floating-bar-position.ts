/** Gap between anchor and floating bar (px) */
const GAP = 6
/** Viewport edge padding (px) */
const PADDING = 8

export type FloatingBarPlacement = 'above' | 'below'

export interface FloatingBarPosition {
  top: number
  left: number
  placement: FloatingBarPlacement
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Compute viewport-fixed position for a floating control bar (tooltip-like).
 * Default above anchor; flips below when there is not enough room at the top.
 */
export function computeFloatingBarPosition(anchorRect: DOMRect, barWidth: number, barHeight: number, scrollbarWidth = 0): FloatingBarPosition {
  const viewportWidth = window.innerWidth - scrollbarWidth
  const viewportHeight = window.innerHeight

  let placement: FloatingBarPlacement = 'above'
  let top = anchorRect.top - GAP - barHeight

  if (top < PADDING) {
    placement = 'below'
    top = anchorRect.bottom + GAP
  }

  top = clamp(top, PADDING, Math.max(PADDING, viewportHeight - PADDING - barHeight))

  let left = anchorRect.left + anchorRect.width / 2 - barWidth / 2
  left = clamp(left, PADDING, Math.max(PADDING, viewportWidth - PADDING - barWidth))

  return { top, left, placement }
}

/**
 * Apply computed position to a fixed floating bar element.
 */
export function applyFloatingBarPosition(el: HTMLElement, position: FloatingBarPosition): void {
  el.style.top = `${position.top}px`
  el.style.left = `${position.left}px`
  el.setAttribute('data-placement', position.placement)
}
