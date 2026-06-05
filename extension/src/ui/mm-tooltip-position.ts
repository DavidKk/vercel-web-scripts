export type MmTooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

/** Cross-axis alignment relative to the trigger (default center). */
export type MmTooltipAlign = 'start' | 'center' | 'end'

export interface MmViewport {
  width: number
  height: number
}

export interface MmTooltipPositionResult {
  left: number
  top: number
  placement: MmTooltipPlacement
}

export const MM_TOOLTIP_GAP = 6
export const MM_TOOLTIP_PADDING = 8

const OPPOSITE: Record<MmTooltipPlacement, MmTooltipPlacement> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
}

/**
 * Compute viewport-safe tooltip coordinates.
 * Top/bottom placements default to horizontal center on the trigger; left/right use vertical center.
 * @param triggerRect Trigger bounding rect
 * @param tooltipWidth Measured tooltip width
 * @param tooltipHeight Measured tooltip height
 * @param preferred Preferred placement
 * @param viewport Viewport size
 * @param align Cross-axis alignment (default center)
 */
export function computeMmTooltipPosition(
  triggerRect: DOMRect | { left: number; top: number; right: number; bottom: number; width: number; height: number },
  tooltipWidth: number,
  tooltipHeight: number,
  preferred: MmTooltipPlacement = 'bottom',
  viewport: MmViewport = { width: 1024, height: 768 },
  align: MmTooltipAlign = 'center',
  noFlip = false
): MmTooltipPositionResult {
  if (noFlip) {
    const coords = coordsForPlacement(preferred, triggerRect, tooltipWidth, tooltipHeight, viewport, align)
    const clamped = clampToViewport(coords.left, coords.top, tooltipWidth, tooltipHeight, viewport)
    return { ...clamped, placement: preferred }
  }

  const candidates = rankPlacementCandidates(preferred, triggerRect, tooltipWidth, tooltipHeight, viewport)

  for (const placement of candidates) {
    const coords = coordsForPlacement(placement, triggerRect, tooltipWidth, tooltipHeight, viewport, align)
    if (fitsViewport(coords.left, coords.top, tooltipWidth, tooltipHeight, viewport)) {
      return { ...coords, placement }
    }
  }

  const fallback = coordsForPlacement(preferred, triggerRect, tooltipWidth, tooltipHeight, viewport, align)
  const clamped = clampToViewport(fallback.left, fallback.top, tooltipWidth, tooltipHeight, viewport)
  return { ...clamped, placement: preferred }
}

/**
 * @param preferred Preferred side
 * @param triggerRect Trigger rect
 * @param tw Tooltip width
 * @param th Tooltip height
 * @param viewport Viewport
 */
function rankPlacementCandidates(
  preferred: MmTooltipPlacement,
  triggerRect: { left: number; top: number; right: number; bottom: number },
  tw: number,
  th: number,
  viewport: MmViewport
): MmTooltipPlacement[] {
  const opposite = OPPOSITE[preferred]
  const allSides: MmTooltipPlacement[] = ['bottom', 'top', 'right', 'left']
  const rest = allSides.filter((p) => p !== preferred && p !== opposite)
  rest.sort((a, b) => placementSpace(b, triggerRect, tw, th, viewport) - placementSpace(a, triggerRect, tw, th, viewport))
  return [preferred, opposite, ...rest]
}

function placementSpace(placement: MmTooltipPlacement, rect: { left: number; top: number; right: number; bottom: number }, tw: number, th: number, viewport: MmViewport): number {
  switch (placement) {
    case 'bottom':
      return viewport.height - rect.bottom - MM_TOOLTIP_GAP - th
    case 'top':
      return rect.top - MM_TOOLTIP_GAP - th
    case 'right':
      return viewport.width - rect.right - MM_TOOLTIP_GAP - tw
    case 'left':
      return rect.left - MM_TOOLTIP_GAP - tw
    default:
      return 0
  }
}

function coordsForPlacement(
  placement: MmTooltipPlacement,
  rect: { left: number; top: number; right: number; bottom: number; width: number; height: number },
  tw: number,
  th: number,
  viewport: MmViewport,
  align: MmTooltipAlign
): { left: number; top: number } {
  switch (placement) {
    case 'bottom':
      return {
        left: alignHorizontal(rect, tw, viewport.width, align),
        top: rect.bottom + MM_TOOLTIP_GAP,
      }
    case 'top':
      return {
        left: alignHorizontal(rect, tw, viewport.width, align),
        top: rect.top - MM_TOOLTIP_GAP - th,
      }
    case 'right':
      return {
        left: rect.right + MM_TOOLTIP_GAP,
        top: alignVertical(rect, th, viewport.height, align),
      }
    case 'left':
      return {
        left: rect.left - MM_TOOLTIP_GAP - tw,
        top: alignVertical(rect, th, viewport.height, align),
      }
    default:
      return { left: rect.left, top: rect.bottom + MM_TOOLTIP_GAP }
  }
}

function alignHorizontal(rect: { left: number; right: number; width: number }, tw: number, viewportWidth: number, align: MmTooltipAlign): number {
  let left: number
  switch (align) {
    case 'start':
      left = rect.left
      break
    case 'end':
      left = rect.right - tw
      break
    default:
      left = rect.left + rect.width / 2 - tw / 2
  }
  return clampAxis(left, tw, viewportWidth)
}

function alignVertical(rect: { top: number; bottom: number; height: number }, th: number, viewportHeight: number, align: MmTooltipAlign): number {
  let top: number
  switch (align) {
    case 'start':
      top = rect.top
      break
    case 'end':
      top = rect.bottom - th
      break
    default:
      top = rect.top + rect.height / 2 - th / 2
  }
  return clampAxis(top, th, viewportHeight)
}

function clampAxis(origin: number, size: number, viewportSize: number): number {
  let value = origin
  if (value < MM_TOOLTIP_PADDING) {
    value = MM_TOOLTIP_PADDING
  }
  if (value + size > viewportSize - MM_TOOLTIP_PADDING) {
    value = viewportSize - MM_TOOLTIP_PADDING - size
  }
  return value
}

function fitsViewport(left: number, top: number, tw: number, th: number, viewport: MmViewport): boolean {
  return left >= MM_TOOLTIP_PADDING && top >= MM_TOOLTIP_PADDING && left + tw <= viewport.width - MM_TOOLTIP_PADDING && top + th <= viewport.height - MM_TOOLTIP_PADDING
}

function clampToViewport(left: number, top: number, tw: number, th: number, viewport: MmViewport): { left: number; top: number } {
  return {
    left: Math.max(MM_TOOLTIP_PADDING, Math.min(left, viewport.width - MM_TOOLTIP_PADDING - tw)),
    top: Math.max(MM_TOOLTIP_PADDING, Math.min(top, viewport.height - MM_TOOLTIP_PADDING - th)),
  }
}
