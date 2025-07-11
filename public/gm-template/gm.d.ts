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
