import { markReady } from './state'

export class MmInput extends HTMLElement {
  connectedCallback(): void {
    markReady(this, 'mm-input-component')
    this.querySelector('input, textarea')?.classList.add('mm-native-input')
    if (this.querySelector('.mm-input-icon')) {
      this.classList.add('mm-input-with-icon')
    }
    if (this.querySelector('.mm-input-action')) {
      this.classList.add('mm-input-with-action')
    }
  }
}
