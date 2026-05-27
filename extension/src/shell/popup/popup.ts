import { MmPopupApp } from '@ext/ui/mm-popup-app'

if (!customElements.get('mm-popup-app')) {
  customElements.define('mm-popup-app', MmPopupApp)
}
