import { defineMmAdminTabs } from '@ext/ui/mm-admin-tabs'
import { defineMmFormComponents } from '@ext/ui/mm-form-components'
import { MmScriptsApp } from '@ext/ui/mm-scripts-app'
import { mountScriptsDebugPanel } from '@ext/ui/mm-scripts-debug-panel'
import { defineMmTooltip } from '@ext/ui/mm-tooltip'

defineMmFormComponents()
defineMmAdminTabs()
defineMmTooltip()

if (!customElements.get('mm-scripts-app')) {
  customElements.define('mm-scripts-app', MmScriptsApp)
}

mountScriptsDebugPanel()
