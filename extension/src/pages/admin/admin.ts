import { initAdminRouter } from '@ext/ui/mm-admin-router'
import { defineMmAdminTabs } from '@ext/ui/mm-admin-tabs'
import { initAdminPageFocusRefresh } from '@ext/ui/mm-admin-view-lifecycle'
import { defineMmFormComponents } from '@ext/ui/mm-form-components'
import { MmLogsApp } from '@ext/ui/mm-logs-app'
import { mountMmNotificationHost } from '@ext/ui/mm-notification'
import { MmOptionsApp } from '@ext/ui/mm-options-app'
import { MmRulesApp } from '@ext/ui/mm-rules-app'
import { MmScriptsApp } from '@ext/ui/mm-scripts-app'
import { mountScriptsDebugPanel } from '@ext/ui/mm-scripts-debug-panel'
import { defineMmTooltip } from '@ext/ui/mm-tooltip'

defineMmFormComponents()
defineMmAdminTabs()
defineMmTooltip()

if (!customElements.get('mm-options-app')) {
  customElements.define('mm-options-app', MmOptionsApp)
}
if (!customElements.get('mm-scripts-app')) {
  customElements.define('mm-scripts-app', MmScriptsApp)
}
if (!customElements.get('mm-rules-app')) {
  customElements.define('mm-rules-app', MmRulesApp)
}
if (!customElements.get('mm-logs-app')) {
  customElements.define('mm-logs-app', MmLogsApp)
}

mountScriptsDebugPanel()
mountMmNotificationHost()
initAdminRouter()
initAdminPageFocusRefresh()
