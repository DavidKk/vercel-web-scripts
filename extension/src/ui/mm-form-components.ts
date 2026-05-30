const once = new WeakSet<HTMLElement>()
const selectBound = new WeakSet<HTMLElement>()

function markReady(el: HTMLElement, className: string): void {
  if (once.has(el)) {
    return
  }
  once.add(el)
  el.classList.add(className)
}

export class MmField extends HTMLElement {
  connectedCallback(): void {
    markReady(this, 'mm-field-component')
  }
}

export class MmInput extends HTMLElement {
  connectedCallback(): void {
    markReady(this, 'mm-input-component')
    this.querySelector('input')?.classList.add('mm-native-input')
    if (this.querySelector('.mm-input-icon')) {
      this.classList.add('mm-input-with-icon')
    }
  }
}

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
    const input = this.querySelector('[data-ref="filter"]') as HTMLInputElement | null
    const options = [...this.querySelectorAll<HTMLElement>('[data-value]')]
    if (!trigger || !valueEl || !input || options.length === 0) {
      return
    }

    const setOpen = (open: boolean): void => {
      this.toggleAttribute('open', open)
      trigger.setAttribute('aria-expanded', String(open))
    }

    const selectOption = (option: HTMLElement): void => {
      input.value = option.dataset.value ?? ''
      valueEl.textContent = option.textContent?.trim() ?? ''
      options.forEach((item) => {
        item.setAttribute('aria-selected', String(item === option))
      })
      input.dispatchEvent(new Event('change', { bubbles: true }))
      this.dispatchEvent(new CustomEvent('mm-select-change', { bubbles: true, detail: { value: input.value } }))
      setOpen(false)
    }

    const syncSelected = (): void => {
      const selected = options.find((option) => option.dataset.value === input.value) ?? options[0]
      selectOption(selected)
    }

    trigger.addEventListener('click', () => {
      setOpen(!this.hasAttribute('open'))
    })
    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        setOpen(true)
        options.find((option) => option.getAttribute('aria-selected') === 'true')?.focus()
      }
    })
    options.forEach((option) => {
      option.setAttribute('role', 'option')
      option.tabIndex = -1
      option.addEventListener('click', () => {
        selectOption(option)
      })
      option.addEventListener('keydown', (event) => {
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
    })
    document.addEventListener('click', (event) => {
      if (!this.contains(event.target as Node)) {
        setOpen(false)
      }
    })
    syncSelected()
  }
}

export class MmButton extends HTMLElement {
  connectedCallback(): void {
    markReady(this, 'mm-button-component')
    this.querySelector('button')?.classList.add('mm-button-native')
  }
}

export class MmSwitch extends HTMLElement {
  connectedCallback(): void {
    markReady(this, 'mm-switch-component')
    const input = this.querySelector('input[type="checkbox"]') as HTMLInputElement | null
    if (input) {
      input.classList.add('mm-switch-input')
      input.role = 'switch'
    }
  }
}

export function defineMmFormComponents(): void {
  if (!customElements.get('mm-field')) {
    customElements.define('mm-field', MmField)
  }
  if (!customElements.get('mm-input')) {
    customElements.define('mm-input', MmInput)
  }
  if (!customElements.get('mm-select')) {
    customElements.define('mm-select', MmSelect)
  }
  if (!customElements.get('mm-button')) {
    customElements.define('mm-button', MmButton)
  }
  if (!customElements.get('mm-switch')) {
    customElements.define('mm-switch', MmSwitch)
  }
}
