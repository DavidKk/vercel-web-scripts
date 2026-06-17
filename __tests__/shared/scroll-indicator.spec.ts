import { computeScrollThumbMetrics } from '@shared/ui/scroll-indicator'

describe('scroll-indicator', () => {
  it('should report not scrollable when content fits the viewport', () => {
    expect(
      computeScrollThumbMetrics({
        scrollHeight: 100,
        clientHeight: 100,
        scrollTop: 0,
        trackHeight: 80,
      })
    ).toEqual({ scrollable: false, thumbHeight: 0, thumbTop: 0 })
  })

  it('should size and position thumb when content overflows', () => {
    expect(
      computeScrollThumbMetrics({
        scrollHeight: 200,
        clientHeight: 100,
        scrollTop: 50,
        trackHeight: 100,
      })
    ).toEqual({ scrollable: true, thumbHeight: 50, thumbTop: 25 })
  })

  it('should clamp thumb height to a minimum of 12px', () => {
    expect(
      computeScrollThumbMetrics({
        scrollHeight: 10_000,
        clientHeight: 100,
        scrollTop: 0,
        trackHeight: 100,
      }).thumbHeight
    ).toBe(12)
  })

  it('should move thumb to the bottom when scrolled to the end', () => {
    expect(
      computeScrollThumbMetrics({
        scrollHeight: 200,
        clientHeight: 100,
        scrollTop: 100,
        trackHeight: 100,
      })
    ).toEqual({ scrollable: true, thumbHeight: 50, thumbTop: 50 })
  })
})
