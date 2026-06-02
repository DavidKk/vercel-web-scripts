import { markReady } from './state'

export class MmButton extends HTMLElement {
  connectedCallback(): void {
    markReady(this, 'mm-button-component')
    this.querySelector('button')?.classList.add('mm-button-native')
  }
}
