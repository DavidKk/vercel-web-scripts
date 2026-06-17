import { defineMmFormComponents } from '@ext/ui/mm-form-components'
import { MmPopupApp } from '@ext/ui/popup/mm-popup-app'

defineMmFormComponents()

if (!customElements.get('mm-popup-app')) {
  customElements.define('mm-popup-app', MmPopupApp)
}
