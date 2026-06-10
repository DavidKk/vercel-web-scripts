import type { GMValue } from './page/gm-types'
import type { PageBootstrapConfig } from './types'

declare global {
  interface Window {
    /** Page bootstrap from content bridge: enabled scriptKeys, OTA baseUrls, per-file enabledScripts. */
    __VWS_PAGE_CONFIG__?: PageBootstrapConfig
    /** GM storage snapshot (`vws_gm_*`) for page-world GM_getValue / GM_setValue bridge. */
    __VWS_GM_STORE__?: Record<string, GMValue>
    /** ScriptKeys whose launcher already started on this navigation (dedupe per scriptKey). */
    __VWS_STARTED_SCRIPT_KEYS__?: string[]
    /** Active scriptKey while preset / remote bundle runs (page world). */
    __VWS_SCRIPT_KEY__?: string
    /** Per-file enable map (`false` = skip module); mirrored on launcher sandbox via `__GLOBAL__`. */
    __VWS_ENABLED_SCRIPTS__?: Record<string, boolean>
  }
}

export {}
