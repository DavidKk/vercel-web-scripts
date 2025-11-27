declare const __BASE_URL__: string

declare const __RULE_API_URL__: string

declare const __RULE_MANAGER_URL__: string

declare const __EDITOR_URL__: string

declare interface GMXMLHttpRequestResponse {
  finalUrl: string
  readyState: number
  responseHeaders: string
  response: any
  responseText: string
  responseXML: Document | null
  status: number
  statusText: string
}

declare interface GMXMLHttpRequestError {
  error: string
  message?: string
}

declare interface GMXMLHttpRequestDetails {
  method: string
  url: string
  headers?: Record<string, string>
  data?: string | Document | Blob | FormData | ArrayBuffer | URLSearchParams
  responseType?: 'arraybuffer' | 'blob' | 'json' | 'stream' | 'text'
  body?: any
  timeout?: number
  onload?: (response: GMXMLHttpRequestResponse) => void
  onerror?: (error: GMXMLHttpRequestError) => void
  onabort?: (error: GMXMLHttpRequestError) => void
  ontimeout?: (error: GMXMLHttpRequestError) => void
  onprogress?: (event: ProgressEvent) => void
}

declare function GM_xmlhttpRequest(details: GMXMLHttpRequestDetails): void
declare function GM_setValue(key: string, value: string): void
declare function GM_getValue(key: string, defaultValue?: string): string
declare function GM_log(...messages: string[]): void
declare function GM_setClipboard(text: string, info: 'text' | 'html', callback: () => void): void

declare interface MenuItem {
  id: string
  text: string
  icon?: string
  hint?: string
  action?: () => void
}

declare function GME_registerMenuCommand(item: MenuItem): any

declare interface WaitForOptions {
  timeout?: boolean
}

type Query = () => HTMLElement[] | HTMLElement | NodeListOf<Element> | Element[] | any[] | null

declare function GME_curl(content: string): Promise<any>
declare function GME_preview(file: string, content: string): void
declare function GME_waitFor<T extends () => any>(query: T, options?: WaitForOptions): Promise<ReturnType<T>>
declare function GME_sleep(ms: number): Promise<unknown>
declare function GME_ok(...contents: any[]): void
declare function GME_info(...contents: any[]): void
declare function GME_fail(...contents: any[]): void
declare function GME_warn(...contents: any[]): void
declare function GME_uuid(): string
declare function GME_notification(message: string, type: 'success' | 'error' | 'info' | 'warn', duration: any): any
