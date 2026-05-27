import { MmScriptsApp } from '@ext/ui/mm-scripts-app'

if (!customElements.get('mm-scripts-app')) {
  customElements.define('mm-scripts-app', MmScriptsApp)
}
