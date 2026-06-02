import { MmButton } from './mm-button'
import { MmField } from './mm-field'
import { MmInput } from './mm-input'
import { MmSearchSelect } from './mm-search-select'
import { MmSelect } from './mm-select'
import { MmSwitch } from './mm-switch'

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
  if (!customElements.get('mm-search-select')) {
    customElements.define('mm-search-select', MmSearchSelect)
  }
  if (!customElements.get('mm-button')) {
    customElements.define('mm-button', MmButton)
  }
  if (!customElements.get('mm-switch')) {
    customElements.define('mm-switch', MmSwitch)
  }
}
