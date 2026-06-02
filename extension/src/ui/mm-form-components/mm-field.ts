import { markReady } from './state'

export class MmField extends HTMLElement {
  connectedCallback(): void {
    markReady(this, 'mm-field-component')
  }
}
