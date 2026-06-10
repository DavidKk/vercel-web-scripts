import { bindDropdownViewportResize, fitDropdownScrollerToViewport, resetDropdownScrollerViewportFit } from './dropdown-viewport-fit'
import { bindScrollIndicator } from './scroll-indicator'
import { markReady, searchSelectBound } from './state'

export class MmSearchSelect extends HTMLElement {
  private options: Array<{ value: string; label: string }> = []
  private refreshScrollIndicator: (() => void) | undefined
  private releaseViewportResize: (() => void) | undefined

  connectedCallback(): void {
    markReady(this, 'mm-search-select-component')
    if (!this.querySelector('[data-ref="select-trigger"]')) {
      this.innerHTML = `
        <input type="hidden" data-ref="value" />
        <button type="button" class="mm-search-select-trigger" data-ref="select-trigger" aria-haspopup="listbox" aria-expanded="false">
          <span class="mm-search-select-value" data-ref="select-value">${this.getAttribute('placeholder') ?? 'Select...'}</span>
          <span class="mm-search-select-chevron" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none"><path d="m6 8 4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
        </button>
        <div class="mm-search-select-menu" data-ref="menu" role="listbox">
          <div class="mm-search-select-search-wrap">
            <input data-ref="search" class="mm-search-select-search" type="search" placeholder="${this.getAttribute('search-placeholder') ?? 'Search...'}" autocomplete="off" spellcheck="false" />
          </div>
          <div class="mm-scroll-indicator-shell mm-search-select-options-shell">
            <div class="mm-scroll-indicator-scroller mm-search-select-options" data-ref="options"></div>
            <div class="mm-scroll-indicator-track" aria-hidden="true">
              <span class="mm-scroll-indicator-thumb"></span>
            </div>
          </div>
        </div>
      `
    }
    if (searchSelectBound.has(this)) {
      return
    }
    searchSelectBound.add(this)
    const scroller = this.querySelector('[data-ref="options"]') as HTMLElement | null
    if (scroller) {
      this.refreshScrollIndicator = bindScrollIndicator(scroller)
    }
    this.bindSearchSelect()
  }

  setOptions(options: Array<{ value: string; label: string }>): void {
    this.options = options
    this.renderOptions()
  }

  setValue(value: string): void {
    const input = this.querySelector('[data-ref="value"]') as HTMLInputElement | null
    if (!input) return
    input.value = value
    this.syncLabel()
  }

  /** @returns Current selected option value, or empty string when unset */
  getValue(): string {
    const input = this.querySelector('[data-ref="value"]') as HTMLInputElement | null
    return input?.value ?? ''
  }

  private bindSearchSelect(): void {
    const trigger = this.querySelector('[data-ref="select-trigger"]') as HTMLButtonElement | null
    const search = this.querySelector('[data-ref="search"]') as HTMLInputElement | null
    if (!trigger || !search) {
      return
    }
    const setOpen = (open: boolean): void => {
      this.toggleAttribute('open', open)
      trigger.setAttribute('aria-expanded', String(open))
      if (open) {
        search.value = ''
        this.renderOptions('')
        search.focus()
        this.releaseViewportResize = bindDropdownViewportResize(() => this.applyViewportFit())
        this.applyViewportFit()
      } else {
        this.releaseViewportResize?.()
        this.releaseViewportResize = undefined
        const scroller = this.querySelector('[data-ref="options"]') as HTMLElement | null
        if (scroller) {
          resetDropdownScrollerViewportFit(scroller)
        }
      }
    }
    trigger.addEventListener('click', () => setOpen(!this.hasAttribute('open')))
    search.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        trigger.focus()
      }
    })
    search.addEventListener('input', () => this.renderOptions(search.value))
    document.addEventListener('click', (event) => {
      if (!this.contains(event.target as Node)) {
        setOpen(false)
      }
    })
    this.renderOptions()
  }

  private applyViewportFit(): void {
    const menu = this.querySelector('[data-ref="menu"]') as HTMLElement | null
    const scroller = this.querySelector('[data-ref="options"]') as HTMLElement | null
    if (!menu || !scroller) {
      return
    }
    fitDropdownScrollerToViewport({
      menu,
      scroller,
      optionSelector: '.mm-search-select-option',
    })
    this.refreshScrollIndicator?.()
  }

  private syncLabel(): void {
    const valueEl = this.querySelector('[data-ref="select-value"]') as HTMLElement | null
    if (!valueEl) return
    const selected = this.options.find((option) => option.value === this.getValue())
    valueEl.textContent = selected?.label ?? this.getAttribute('placeholder') ?? 'Select...'
  }

  private renderOptions(keyword = ''): void {
    const list = this.querySelector('[data-ref="options"]') as HTMLElement | null
    if (!list) return
    const q = keyword.trim().toLowerCase()
    const filtered = q ? this.options.filter((opt) => opt.label.toLowerCase().includes(q)) : this.options
    if (filtered.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'mm-search-select-empty'
      empty.textContent = q ? 'No data (search)' : 'No data'
      list.replaceChildren(empty)
      this.syncLabel()
      resetDropdownScrollerViewportFit(list)
      this.refreshScrollIndicator?.()
      return
    }
    list.replaceChildren(
      ...filtered.map((opt) => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'mm-search-select-option'
        const label = document.createElement('span')
        label.className = 'mm-search-select-option-label'
        label.textContent = opt.label
        btn.title = opt.label
        btn.append(label)
        btn.addEventListener('click', () => {
          this.setValue(opt.value)
          this.dispatchEvent(new CustomEvent('mm-search-select-change', { bubbles: true, detail: { value: opt.value } }))
          this.removeAttribute('open')
          ;(this.querySelector('[data-ref="select-trigger"]') as HTMLButtonElement | null)?.setAttribute('aria-expanded', 'false')
        })
        return btn
      })
    )
    this.syncLabel()
    if (this.hasAttribute('open')) {
      this.applyViewportFit()
    } else {
      this.refreshScrollIndicator?.()
    }
  }
}
