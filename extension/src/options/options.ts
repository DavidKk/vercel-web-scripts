import { defineMmFormComponents } from '@ext/ui/mm-form-components'
import { MmOptionsApp } from '@ext/ui/mm-options-app'

defineMmFormComponents()

if (!customElements.get('mm-options-app')) {
  customElements.define('mm-options-app', MmOptionsApp)
}
