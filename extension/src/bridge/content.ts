/**
 * Isolated content script entry: storage/XHR bridge + inject page-world launcher.
 */

import { installBridgeListeners } from './bridge-listeners'
import { bootstrapPageBridge, notifyTabPageLoad } from './page-bootstrap'

installBridgeListeners()
notifyTabPageLoad()
void bootstrapPageBridge().catch(() => undefined)
