/** Default gap between dropdown panel and viewport edge (px). */
const DEFAULT_EDGE_PADDING = 8

/** Default minimum visible option rows when list is long enough. */
const DEFAULT_MIN_VISIBLE_OPTIONS = 4

export interface FitDropdownScrollerOptions {
  /** Dropdown panel root (search-select menu or select menu). */
  menu: HTMLElement
  /** Scrollable options list inside the panel. */
  scroller: HTMLElement
  /** CSS selector for option rows used to measure row height. */
  optionSelector: string
  /** Minimum visible rows when option count is at least this value. */
  minVisibleOptions?: number
  /** Padding reserved at the bottom of the viewport (px). */
  edgePadding?: number
}

/**
 * Measure stacked height of the first N visible option rows (includes grid gaps).
 * @param scroller Options scroll container
 * @param optionSelector Selector for option elements
 * @param count Number of rows to include
 * @returns Pixel height or 0 when no options
 */
function measureOptionsBlockHeight(scroller: HTMLElement, optionSelector: string, count: number): number {
  const options = [...scroller.querySelectorAll<HTMLElement>(optionSelector)].filter((node) => !node.hidden && node.offsetHeight > 0)
  if (options.length === 0) {
    return 0
  }
  const rows = Math.min(count, options.length)
  const first = options[0]!
  const last = options[rows - 1]!
  return last.offsetTop + last.offsetHeight - first.offsetTop
}

/**
 * Clamp dropdown scroller height to viewport; enforce a minimum of 4 visible rows when applicable.
 * @param options Menu, scroller, and option selector
 */
export function fitDropdownScrollerToViewport(options: FitDropdownScrollerOptions): void {
  const { menu, scroller, optionSelector } = options
  const minVisibleOptions = options.minVisibleOptions ?? DEFAULT_MIN_VISIBLE_OPTIONS
  const edgePadding = options.edgePadding ?? DEFAULT_EDGE_PADDING

  scroller.style.maxHeight = ''
  scroller.style.minHeight = ''

  const optionCount = scroller.querySelectorAll(optionSelector).length
  if (optionCount === 0) {
    return
  }

  const naturalScrollerHeight = scroller.scrollHeight
  const menuTop = menu.getBoundingClientRect().top
  const viewportLimit = Math.max(0, window.innerHeight - menuTop - edgePadding)
  const chromeHeight = Math.max(0, menu.offsetHeight - scroller.offsetHeight)
  const maxScrollerHeight = Math.max(0, viewportLimit - chromeHeight)
  const cappedHeight = Math.min(naturalScrollerHeight, maxScrollerHeight)

  scroller.style.maxHeight = `${cappedHeight}px`

  if (optionCount >= minVisibleOptions) {
    const minBlockHeight = measureOptionsBlockHeight(scroller, optionSelector, minVisibleOptions)
    if (minBlockHeight > 0) {
      scroller.style.minHeight = `${Math.min(minBlockHeight, cappedHeight)}px`
    }
  }
}

/**
 * Clear viewport-fit inline sizes from a dropdown scroller.
 * @param scroller Options scroll container
 */
export function resetDropdownScrollerViewportFit(scroller: HTMLElement): void {
  scroller.style.maxHeight = ''
  scroller.style.minHeight = ''
}

/**
 * Bind window resize while dropdown is open; returns cleanup.
 * @param callback Re-run viewport fit and scroll indicator refresh
 * @returns Remove resize listener
 */
export function bindDropdownViewportResize(callback: () => void): () => void {
  const onResize = (): void => {
    callback()
  }
  window.addEventListener('resize', onResize)
  return () => {
    window.removeEventListener('resize', onResize)
  }
}
