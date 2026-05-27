import { MmOptionsApp } from '@ext/ui/mm-options-app'

if (!customElements.get('mm-options-app')) {
  customElements.define('mm-options-app', MmOptionsApp)
}
