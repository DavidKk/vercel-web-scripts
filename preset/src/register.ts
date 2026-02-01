/**
 * Register preset globals at load time.
 * Delegates to global-registry service (single source of truth).
 * Must be imported after all helpers/services/UI and before main.
 */

import { registerGlobals } from './services/global-registry'

registerGlobals()
