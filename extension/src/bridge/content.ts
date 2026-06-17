/**
 * Isolated content script entry: storage/XHR bridge + inject page-world launcher.
 */

import { installBridgeListeners } from './bridge-listeners'
import { bootstrapPageBridge, notifyTabPageLoad } from './page-bootstrap'
import { installPermissionAllowSyncListener } from './permission-allow-sync'
import { installPermissionModalListener } from './permission-modal'

installBridgeListeners()
installPermissionModalListener()
installPermissionAllowSyncListener()
notifyTabPageLoad()
void bootstrapPageBridge().catch(() => undefined)
