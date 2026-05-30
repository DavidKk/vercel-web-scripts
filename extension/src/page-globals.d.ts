import type { GMValue } from './page/gm-types'
import type { PageBootstrapConfig } from './types'

declare global {
  interface Window {
    __VWS_PAGE_CONFIG__?: PageBootstrapConfig
    __VWS_GM_STORE__?: Record<string, GMValue>
    __VWS_PAGE_LAUNCHER_STARTED__?: boolean
  }
}

export {}
