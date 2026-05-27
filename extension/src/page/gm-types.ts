/** Minimal Tampermonkey GM_xmlhttpRequest details (launcher + preset subset). */
export interface GMRequestDetails {
  method?: string
  url: string
  headers?: Record<string, string>
  data?: string
  onload?: (response: GMResponse) => void
  onerror?: (error: unknown) => void
  onprogress?: (event: GMProgress) => void
}

export interface GMResponse {
  status: number
  statusText: string
  responseText: string
  responseHeaders?: string
  finalUrl?: string
}

export interface GMProgress {
  loaded: number
  total: number
  lengthComputable: boolean
}

export type GMValue = unknown

export interface GMApi {
  GM_getValue: <T = GMValue>(key: string, defaultValue?: T) => T
  GM_setValue: (key: string, value: GMValue) => void
  GM_deleteValue: (key: string) => void
  GM_listValues: () => string[]
  GM_addValueChangeListener: (name: string, listener: (name: string, oldValue: GMValue, newValue: GMValue) => void) => string
  GM_removeValueChangeListener: (listenerId: string) => void
  GM_xmlhttpRequest: (details: GMRequestDetails) => void
  GM_registerMenuCommand: (caption: string, onClick: () => void) => string
  GM_info: Record<string, unknown>
  unsafeWindow: Window
}
