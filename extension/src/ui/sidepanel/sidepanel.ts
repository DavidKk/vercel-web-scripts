import { defineMmFormComponents } from '@ext/ui/mm-form-components'
import { mountMmNotificationHost } from '@ext/ui/mm-notification'
import { initMmTooltipDelegation } from '@ext/ui/shared/mm-tooltip'

import { MmSidepanelApp } from './mm-sidepanel-app'

defineMmFormComponents()
mountMmNotificationHost()
initMmTooltipDelegation(document.body)

if (!customElements.get('mm-sidepanel-app')) {
  customElements.define('mm-sidepanel-app', MmSidepanelApp)
}
