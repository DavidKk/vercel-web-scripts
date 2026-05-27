export type MmVirtualListRenderRow<T> = (item: T, index: number) => HTMLElement

export type MmVirtualListOptions<T> = {
  scroller: HTMLElement
  spacer: HTMLElement
  content: HTMLElement
  rowHeight: number
  pageSize: number
  renderRow: MmVirtualListRenderRow<T>
  onNearEnd?: () => void
  nearEndThreshold?: number
}

const DEFAULT_NEAR_END = 120

/**
 * Fixed-row-height virtual list with incremental "infinite" reveal (client-side paging).
 */
export class MmVirtualList<T> {
  private items: T[] = []
  private displayedLimit = 0
  private readonly scroller: HTMLElement
  private readonly spacer: HTMLElement
  private readonly content: HTMLElement
  private readonly rowHeight: number
  private readonly pageSize: number
  private readonly renderRow: MmVirtualListRenderRow<T>
  private readonly onNearEnd?: () => void
  private readonly nearEndThreshold: number
  private readonly onScroll: () => void

  constructor(options: MmVirtualListOptions<T>) {
    this.scroller = options.scroller
    this.spacer = options.spacer
    this.content = options.content
    this.rowHeight = options.rowHeight
    this.pageSize = options.pageSize
    this.renderRow = options.renderRow
    this.onNearEnd = options.onNearEnd
    this.nearEndThreshold = options.nearEndThreshold ?? DEFAULT_NEAR_END
    this.onScroll = () => {
      this.paint()
      this.maybeLoadMore()
    }
    this.scroller.addEventListener('scroll', this.onScroll, { passive: true })
  }

  destroy(): void {
    this.scroller.removeEventListener('scroll', this.onScroll)
  }

  setItems(items: T[]): void {
    this.items = items
    this.displayedLimit = Math.min(this.pageSize, items.length)
    this.scroller.scrollTop = 0
    this.updateSpacer()
    this.paint()
  }

  /** Grow revealed slice when user scrolls near the bottom. */
  loadMore(): boolean {
    if (this.displayedLimit >= this.items.length) {
      return false
    }
    this.displayedLimit = Math.min(this.displayedLimit + this.pageSize, this.items.length)
    this.updateSpacer()
    this.paint()
    return this.displayedLimit < this.items.length
  }

  get totalCount(): number {
    return this.items.length
  }

  get revealedCount(): number {
    return this.displayedLimit
  }

  private updateSpacer(): void {
    this.spacer.style.height = `${this.displayedLimit * this.rowHeight}px`
  }

  private maybeLoadMore(): void {
    const { scrollTop, clientHeight, scrollHeight } = this.scroller
    if (scrollHeight - scrollTop - clientHeight > this.nearEndThreshold) {
      return
    }
    const hadMore = this.displayedLimit < this.items.length
    if (this.loadMore() && hadMore) {
      this.onNearEnd?.()
    }
  }

  private paint(): void {
    const visible = this.items.slice(0, this.displayedLimit)
    if (visible.length === 0) {
      this.content.replaceChildren()
      return
    }

    const scrollTop = this.scroller.scrollTop
    const viewHeight = this.scroller.clientHeight
    const start = Math.max(0, Math.floor(scrollTop / this.rowHeight) - 2)
    const end = Math.min(visible.length, Math.ceil((scrollTop + viewHeight) / this.rowHeight) + 2)

    const fragment = document.createDocumentFragment()
    for (let i = start; i < end; i++) {
      const row = this.renderRow(visible[i], i)
      row.style.position = 'absolute'
      row.style.top = `${i * this.rowHeight}px`
      row.style.left = '0'
      row.style.right = '0'
      row.style.height = `${this.rowHeight}px`
      row.style.boxSizing = 'border-box'
      fragment.appendChild(row)
    }
    this.content.replaceChildren(fragment)
    this.content.style.height = `${visible.length * this.rowHeight}px`
  }
}
