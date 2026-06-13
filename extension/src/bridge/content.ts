/**
 * Isolated content script entry: storage/XHR bridge + inject page-world launcher.
 */

import { installBridgeListeners } from './bridge-listeners'
import { bootstrapNavigationGuard } from './navigation-guard-injector'
import { bootstrapPageBridge, notifyTabPageLoad } from './page-bootstrap'

installBridgeListeners()
notifyTabPageLoad()
void bootstrapNavigationGuard().catch(() => undefined)
void bootstrapPageBridge().catch(() => undefined)
