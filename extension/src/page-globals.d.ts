import type { GMValue } from './page/gm-types'
import type { PageBootstrapConfig } from './types'

declare global {
  interface Window {
    __VWS_PAGE_CONFIG__?: PageBootstrapConfig
    __VWS_GM_STORE__?: Record<string, GMValue>
    /** scriptKeys started on this navigation (dedupe per scriptKey). */
    __VWS_STARTED_SCRIPT_KEYS__?: string[]
    /** Active scriptKey during preset execute (page world). */
    __VWS_SCRIPT_KEY__?: string
    /** Per-file enabled map for active scriptKey during preset execute. */
    __VWS_ENABLED_SCRIPTS__?: Record<string, boolean>
  }
}

export {}
