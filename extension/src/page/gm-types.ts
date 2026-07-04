/** Minimal Tampermonkey GM_xmlhttpRequest details (launcher + preset subset). */
export interface GMRequestDetails {
  method?: string
  url: string
  headers?: Record<string, string>
  data?: string
  timeout?: number
  responseType?: 'arraybuffer' | 'blob' | 'json' | 'stream' | 'text'
  onload?: (response: GMResponse) => void
  onerror?: (error: unknown) => void
  onprogress?: (event: GMProgress) => void
  onabort?: (error: unknown) => void
  onreadystatechange?: (response: GMResponse) => void
  ontimeout?: (error: unknown) => void
}

export interface GMResponse {
  finalUrl?: string
  readyState: number
  response?: unknown
  responseText: string
  responseXML?: Document | null
  status: number
  statusText: string
  responseHeaders?: string
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
  GM_setValues: (values: Record<string, GMValue>) => void
  GM_getValues: (keys: string[] | Record<string, GMValue>) => Record<string, GMValue>
  GM_deleteValues: (keys: string[]) => void
  GM_addValueChangeListener: (name: string, listener: (name: string, oldValue: GMValue, newValue: GMValue) => void) => string
  GM_removeValueChangeListener: (listenerId: string) => void
  GM_xmlhttpRequest: (details: GMRequestDetails) => void
  GM_registerMenuCommand: (caption: string, onClick: () => void) => string
  GM_unregisterMenuCommand: (menuCmdId: string | number) => void
  GM_addElement: (tagName: string, attributes?: Record<string, unknown>) => HTMLElement
  GM_addStyle: (css: string) => HTMLStyleElement
  GM_log: (...messages: unknown[]) => void
  GM_notification: (details: string | { text?: string; title?: string; timeout?: number; onclick?: () => void }, ondone?: () => void) => void
  GM_openInTab: (url: string, options?: unknown) => Window | null
  GM_setClipboard: (data: string | Blob, info?: unknown, cb?: () => void) => void
  GM_captureVisibleTab: (options?: { format?: 'png' | 'jpeg'; quality?: number }) => Promise<Blob>
  GM_download: (
    details: string | { url: string | Blob | File; name?: string; onerror?: (error: { error: string }) => void; onload?: () => void },
    name?: string
  ) => { abort: () => void }
  GM_info: Record<string, unknown>
  unsafeWindow: Window
}
