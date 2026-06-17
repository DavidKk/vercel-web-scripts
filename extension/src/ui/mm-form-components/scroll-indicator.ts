import { bindScrollIndicator as bindScrollIndicatorShared, ensureMenuScrollIndicator as ensureMenuScrollIndicatorShared } from '@shared/ui/scroll-indicator'

export {
  applyDraggableScroll,
  type BindScrollIndicatorOptions,
  computeScrollThumbMetrics,
  type ComputeScrollThumbMetricsOptions,
  refreshScrollIndicator,
  type ScrollIndicatorPrefix,
  type ScrollThumbMetrics,
} from '@shared/ui/scroll-indicator'

/**
 * Bind a scroll position indicator to a scrollable element inside `.mm-scroll-indicator-shell`.
 * @param scroller Overflow element (must sit beside `.mm-scroll-indicator-track` in the shell)
 * @returns Function to refresh thumb position/size
 */
export function bindScrollIndicator(scroller: HTMLElement): () => void {
  return bindScrollIndicatorShared(scroller, { classPrefix: 'mm' })
}

/**
 * Wrap menu/list children in a scroll shell with a position indicator when missing.
 * @param menu Host element that currently holds option nodes directly
 * @returns Bound scroller and refresh callback, or null when already wrapped / empty
 */
export function ensureMenuScrollIndicator(menu: HTMLElement): { scroller: HTMLElement; refresh: () => void } | null {
  return ensureMenuScrollIndicatorShared(menu, { classPrefix: 'mm' })
}
