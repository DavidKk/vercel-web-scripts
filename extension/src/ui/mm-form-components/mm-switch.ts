import { markReady } from './state'

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
