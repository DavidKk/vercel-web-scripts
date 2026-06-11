import { enhanceMmCheckboxLabel } from '../mm-checkbox'
import { markReady } from './state'

/**
 * Custom checkbox — enhances light DOM `label.mm-checkbox` or `label` rows with a native input.
 */
export class MmCheckbox extends HTMLElement {
  connectedCallback(): void {
    markReady(this, 'mm-checkbox-component')
    const labels = this.querySelectorAll('label')
    if (labels.length > 0) {
      labels.forEach((label) => {
        if (label instanceof HTMLLabelElement) {
          enhanceMmCheckboxLabel(label)
        }
      })
      return
    }
    const input = this.querySelector('input[type="checkbox"]')
    if (input?.parentElement instanceof HTMLLabelElement) {
      enhanceMmCheckboxLabel(input.parentElement)
    }
  }
}
