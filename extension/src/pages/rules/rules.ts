import { defineMmAdminTabs } from '@ext/ui/mm-admin-tabs'
import { defineMmFormComponents } from '@ext/ui/mm-form-components'
import { MmRulesApp } from '@ext/ui/mm-rules-app'
import { defineMmTooltip } from '@ext/ui/mm-tooltip'

defineMmFormComponents()
defineMmAdminTabs()
defineMmTooltip()

if (!customElements.get('mm-rules-app')) {
  customElements.define('mm-rules-app', MmRulesApp)
}
