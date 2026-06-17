import { hydrateMmIcons, mmPopupIcons, setIconSlotKey } from '../mm-icons'
import { bindDropdownViewportResize, fitDropdownScrollerToViewport, resetDropdownScrollerViewportFit } from './dropdown-viewport-fit'
import { ensureMenuScrollIndicator } from './scroll-indicator'
import { markReady, selectBound } from './state'

function resolveOptionIconKey(option: HTMLElement): keyof typeof mmPopupIcons | undefined {
  const raw = option.querySelector<HTMLElement>('.mm-select-option-icon[data-icon]')?.getAttribute('data-icon') ?? option.dataset.icon ?? undefined
  if (!raw || !(raw in mmPopupIcons)) {
    return undefined
  }
  return raw as keyof typeof mmPopupIcons
}

export class MmSelect extends HTMLElement {
  private refreshScrollIndicator: (() => void) | undefined
  private releaseViewportResize: (() => void) | undefined
  private menuScroller: HTMLElement | null = null
  private menuRoot: HTMLElement | null = null
  connectedCallback(): void {
    markReady(this, 'mm-select-component')
    this.querySelector('select')?.classList.add('mm-native-select')
    if (selectBound.has(this)) {
      return
    }
    selectBound.add(this)
    this.bindCustomSelect()
  }

  private bindCustomSelect(): void {
    const trigger = this.querySelector('[data-ref="select-trigger"]') as HTMLButtonElement | null
    const valueEl = this.querySelector('[data-ref="select-value"]') as HTMLElement | null
    const leadingEl = this.querySelector('[data-ref="select-leading"]') as HTMLElement | null
    const input = (this.querySelector('[data-ref="filter"]') as HTMLInputElement | null) ?? (this.querySelector('input[type="hidden"]') as HTMLInputElement | null)
    const menu = this.querySelector('.mm-select-menu') as HTMLElement | null
    const options = [...this.querySelectorAll<HTMLElement>('.mm-select-menu [data-value]')]
    if (!trigger || !valueEl || !input || !menu || options.length === 0) {
      return
    }

    const getOptions = (): HTMLElement[] => [...this.querySelectorAll<HTMLElement>('.mm-select-menu [data-value]')]

    const revealOptions = (): void => {
      getOptions().forEach((item) => {
        item.removeAttribute('hidden')
      })
    }

    const applySelection = (option: HTMLElement, emitChange: boolean): void => {
      input.value = option.dataset.value ?? ''
      const label = option.dataset.label ?? option.querySelector('.mm-select-option-label')?.textContent?.trim() ?? option.textContent?.trim() ?? ''
      valueEl.textContent = label
      const iconKey = resolveOptionIconKey(option)
      if (leadingEl && iconKey && iconKey in mmPopupIcons) {
        setIconSlotKey(leadingEl, iconKey)
      }
      getOptions().forEach((item) => {
        item.setAttribute('aria-selected', String(item === option))
        item.removeAttribute('hidden')
      })
      if (emitChange) {
        input.dispatchEvent(new Event('change', { bubbles: true }))
        this.dispatchEvent(new CustomEvent('mm-select-change', { bubbles: true, detail: { value: input.value } }))
      }
    }

    const selectOption = (option: HTMLElement): void => {
      applySelection(option, true)
      setOpen(false)
    }

    const positionMenu = (): void => {
      menu.classList.remove('mm-select-menu--drop-up')
      const triggerRect = trigger.getBoundingClientRect()
      const menuHeight = menu.offsetHeight || menu.scrollHeight
      const spaceBelow = window.innerHeight - triggerRect.bottom - 8
      const spaceAbove = triggerRect.top - 8
      if (menuHeight > spaceBelow && spaceAbove > spaceBelow) {
        menu.classList.add('mm-select-menu--drop-up')
      }
    }

    const setOpen = (open: boolean): void => {
      this.toggleAttribute('open', open)
      trigger.setAttribute('aria-expanded', String(open))
      if (open) {
        revealOptions()
        positionMenu()
        this.releaseViewportResize = bindDropdownViewportResize(() => {
          positionMenu()
          this.applyViewportFit()
        })
        this.applyViewportFit()
      } else {
        menu.classList.remove('mm-select-menu--drop-up')
        this.releaseViewportResize?.()
        this.releaseViewportResize = undefined
        if (this.menuScroller) {
          resetDropdownScrollerViewportFit(this.menuScroller)
        }
        this.refreshScrollIndicator?.()
      }
    }

    const syncSelected = (): void => {
      const menuOptions = getOptions()
      const selected = menuOptions.find((option) => option.dataset.value === input.value) ?? menuOptions[0]
      if (selected) {
        applySelection(selected, false)
      }
    }

    this.menuRoot = menu
    const bound = ensureMenuScrollIndicator(menu)
    if (bound) {
      this.menuScroller = bound.scroller
      this.refreshScrollIndicator = bound.refresh
    }

    trigger.addEventListener('click', () => {
      setOpen(!this.hasAttribute('open'))
    })
    trigger.addEventListener('keydown', (event) => {
      if (!(event instanceof KeyboardEvent)) {
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        setOpen(true)
        getOptions()
          .find((option) => option.getAttribute('aria-selected') === 'true')
          ?.focus()
      }
    })
    menu.addEventListener('click', (event) => {
      const option = (event.target as HTMLElement).closest<HTMLElement>('[data-value]')
      if (option && menu.contains(option)) {
        selectOption(option)
      }
    })
    menu.addEventListener('keydown', (event) => {
      if (!(event instanceof KeyboardEvent)) {
        return
      }
      const menuOptions = getOptions()
      const option = (event.target as HTMLElement).closest<HTMLElement>('[data-value]')
      if (!option || !menu.contains(option)) {
        return
      }
      const currentIndex = menuOptions.indexOf(option)
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.focus()
        return
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        selectOption(option)
        trigger.focus()
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const delta = event.key === 'ArrowDown' ? 1 : -1
        menuOptions[(currentIndex + delta + menuOptions.length) % menuOptions.length]?.focus()
      }
    })
    options.forEach((option) => {
      option.setAttribute('role', 'option')
      option.tabIndex = -1
    })
    document.addEventListener('click', (event) => {
      if (!this.contains(event.target as Node)) {
        setOpen(false)
      }
    })
    syncSelected()
    hydrateMmIcons(this)
  }

  private applyViewportFit(): void {
    if (!this.menuRoot || !this.menuScroller) {
      return
    }
    fitDropdownScrollerToViewport({
      menu: this.menuRoot,
      scroller: this.menuScroller,
      optionSelector: '.mm-select-option, [data-value]',
    })
    this.refreshScrollIndicator?.()
  }
}
