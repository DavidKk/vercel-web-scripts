import { installPermissionModalListener } from '@ext/bridge/permission-modal'
import { initAdminRouter } from '@ext/ui/admin/mm-admin-router'
import { defineMmAdminTabs } from '@ext/ui/admin/mm-admin-tabs'
import { initAdminPageFocusRefresh } from '@ext/ui/admin/mm-admin-view-lifecycle'
import { MmLogsApp } from '@ext/ui/logs/mm-logs-app'
import { mountLogsDebugPanel } from '@ext/ui/logs/mm-logs-debug-panel'
import { defineMmFormComponents } from '@ext/ui/mm-form-components'
import { mountMmNotificationHost } from '@ext/ui/mm-notification'
import { MmPermissionsApp } from '@ext/ui/permissions/mm-permissions-app'
import { mountPermissionsDebugPanel } from '@ext/ui/permissions/mm-permissions-debug-panel'
import { MmRulesApp } from '@ext/ui/rules/mm-rules-app'
import { MmScriptsApp } from '@ext/ui/scripts/mm-scripts-app'
import { mountScriptsDebugPanel } from '@ext/ui/scripts/mm-scripts-debug-panel'
import { MmOptionsApp } from '@ext/ui/servers/mm-options-app'
import { defineMmTooltip } from '@ext/ui/shared/mm-tooltip'

defineMmFormComponents()
defineMmAdminTabs()
defineMmTooltip()

if (!customElements.get('mm-options-app')) {
  customElements.define('mm-options-app', MmOptionsApp)
}
if (!customElements.get('mm-scripts-app')) {
  customElements.define('mm-scripts-app', MmScriptsApp)
}
if (!customElements.get('mm-permissions-app')) {
  customElements.define('mm-permissions-app', MmPermissionsApp)
}
if (!customElements.get('mm-rules-app')) {
  customElements.define('mm-rules-app', MmRulesApp)
}
if (!customElements.get('mm-logs-app')) {
  customElements.define('mm-logs-app', MmLogsApp)
}

mountScriptsDebugPanel()
mountLogsDebugPanel()
mountPermissionsDebugPanel()
mountMmNotificationHost()
installPermissionModalListener()
initAdminRouter()
initAdminPageFocusRefresh()
