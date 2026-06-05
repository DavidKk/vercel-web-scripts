import { computeMmTooltipPosition, MM_TOOLTIP_GAP, MM_TOOLTIP_PADDING } from '../../extension/src/ui/mm-tooltip-position'

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
})

describe('computeMmTooltipPosition', () => {
  const viewport = { width: 400, height: 300 }

  it('should center tooltip below trigger by default', () => {
    const trigger = rect(140, 40, 80, 32)
    const tw = 120
    const result = computeMmTooltipPosition(trigger, tw, 28, 'bottom', viewport)
    expect(result.placement).toBe('bottom')
    expect(result.top).toBe(trigger.bottom + MM_TOOLTIP_GAP)
    expect(result.left).toBe(trigger.left + trigger.width / 2 - tw / 2)
  })

  it('should center tooltip below a right-side icon button', () => {
    const trigger = rect(300, 40, 32, 32)
    const tw = 140
    const result = computeMmTooltipPosition(trigger, tw, 28, 'bottom', viewport)
    expect(result.placement).toBe('bottom')
    expect(result.left).toBe(trigger.left + trigger.width / 2 - tw / 2)
    expect(result.left).toBeGreaterThanOrEqual(MM_TOOLTIP_PADDING)
    expect(result.left + tw).toBeLessThanOrEqual(viewport.width - MM_TOOLTIP_PADDING)
  })

  it('should support start alignment when requested', () => {
    const trigger = rect(20, 40, 80, 32)
    const tw = 120
    const result = computeMmTooltipPosition(trigger, tw, 28, 'bottom', viewport, 'start')
    expect(result.left).toBe(trigger.left)
  })

  it('should flip to right when trigger is on the left edge and preferred left', () => {
    const trigger = rect(4, 100, 40, 32)
    const result = computeMmTooltipPosition(trigger, 100, 24, 'left', viewport)
    expect(result.placement).not.toBe('left')
    expect(result.left + 100).toBeLessThanOrEqual(viewport.width - MM_TOOLTIP_PADDING)
    expect(result.left).toBeGreaterThanOrEqual(MM_TOOLTIP_PADDING)
  })

  it('should clamp centered tooltip when it overflows the viewport horizontally', () => {
    const trigger = rect(320, 40, 72, 32)
    const tw = 140
    const result = computeMmTooltipPosition(trigger, tw, 28, 'bottom', viewport)
    expect(result.left + tw).toBeLessThanOrEqual(viewport.width - MM_TOOLTIP_PADDING)
    expect(result.left).toBeGreaterThanOrEqual(MM_TOOLTIP_PADDING)
  })

  it('should flip to top when there is no room below', () => {
    const trigger = rect(40, 260, 60, 32)
    const th = 28
    const result = computeMmTooltipPosition(trigger, 100, th, 'bottom', viewport)
    expect(result.placement).toBe('top')
    expect(result.top + th).toBeLessThanOrEqual(trigger.top)
  })

  it('should keep preferred bottom placement when noFlip is set', () => {
    const trigger = rect(40, 260, 60, 32)
    const th = 28
    const result = computeMmTooltipPosition(trigger, 100, th, 'bottom', viewport, 'center', true)
    expect(result.placement).toBe('bottom')
    expect(result.top).toBeGreaterThanOrEqual(MM_TOOLTIP_PADDING)
    expect(result.top + th).toBeLessThanOrEqual(viewport.height - MM_TOOLTIP_PADDING)
  })

  it('should clamp position inside viewport when no side fully fits', () => {
    const trigger = rect(0, 0, 400, 300)
    const tw = 200
    const th = 80
    const result = computeMmTooltipPosition(trigger, tw, th, 'bottom', viewport)
    expect(result.left).toBeGreaterThanOrEqual(MM_TOOLTIP_PADDING)
    expect(result.top).toBeGreaterThanOrEqual(MM_TOOLTIP_PADDING)
    expect(result.left + tw).toBeLessThanOrEqual(viewport.width - MM_TOOLTIP_PADDING)
    expect(result.top + th).toBeLessThanOrEqual(viewport.height - MM_TOOLTIP_PADDING)
  })
})
