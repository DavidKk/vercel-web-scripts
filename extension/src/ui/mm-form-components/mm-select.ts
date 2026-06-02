import { markReady, selectBound } from './state'

export class MmSelect extends HTMLElement {
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
    const input = (this.querySelector('[data-ref="filter"]') as HTMLInputElement | null) ?? (this.querySelector('input[type="hidden"]') as HTMLInputElement | null)
    const options = [...this.querySelectorAll<HTMLElement>('[data-value]')]
    if (!trigger || !valueEl || !input || options.length === 0) {
      return
    }

    const setOpen = (open: boolean): void => {
      this.toggleAttribute('open', open)
      trigger.setAttribute('aria-expanded', String(open))
    }

    const getOptions = (): HTMLElement[] => [...this.querySelectorAll<HTMLElement>('.mm-select-menu [data-value]')]

    const selectOption = (option: HTMLElement): void => {
      input.value = option.dataset.value ?? ''
      valueEl.textContent = option.textContent?.trim() ?? ''
      getOptions().forEach((item) => {
        item.setAttribute('aria-selected', String(item === option))
        item.hidden = item === option
      })
      input.dispatchEvent(new Event('change', { bubbles: true }))
      this.dispatchEvent(new CustomEvent('mm-select-change', { bubbles: true, detail: { value: input.value } }))
      setOpen(false)
    }

    const syncSelected = (): void => {
      const options = getOptions()
      const selected = options.find((option) => option.dataset.value === input.value) ?? options[0]
      if (selected) {
        selectOption(selected)
      }
    }

    const menu = this.querySelector('.mm-select-menu')

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
    menu?.addEventListener('click', (event) => {
      const option = (event.target as HTMLElement).closest<HTMLElement>('[data-value]')
      if (option && menu.contains(option)) {
        selectOption(option)
      }
    })
    menu?.addEventListener('keydown', (event) => {
      if (!(event instanceof KeyboardEvent)) {
        return
      }
      const options = getOptions()
      const option = (event.target as HTMLElement).closest<HTMLElement>('[data-value]')
      if (!option || !menu.contains(option)) {
        return
      }
      const currentIndex = options.indexOf(option)
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
        options[(currentIndex + delta + options.length) % options.length]?.focus()
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
  }
}
