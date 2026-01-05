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

declare const unsafeWindow: Window
declare function GM_xmlhttpRequest(details: GMXMLHttpRequestDetails): void
declare function GM_setValue(key: string, value: any): void
declare function GM_getValue<T = any>(key: string, defaultValue?: T): T
declare function GM_deleteValue(key: string): void
declare function GM_listValues(): string[]
declare function GM_setValues(obj: Record<string, any>): void
declare function GM_getValues(keys: string[]): Record<string, any>
declare function GM_deleteValues(keys: string[]): void
declare function GM_addValueChangeListener(key: string, callback: (name: string, oldValue: any, newValue: any, remote: boolean) => void): string
declare function GM_removeValueChangeListener(listenerId: string): void
declare function GM_log(...messages: any[]): void
declare function GM_setClipboard(text: string, info: 'text' | 'html', callback: () => void): void
declare function GM_registerMenuCommand(caption: string, commandFunc: () => void, accessKey?: string): number
declare function GM_unregisterMenuCommand(menuCmdId: number): void
declare function GM_notification(text: string, title?: string, image?: string, onClick?: () => void): void
declare function GM_info(text: string): void
declare function GM_openInTab(url: string, openInBackground?: boolean): void
declare function GM_download(details: {
  url: string
  name: string
  saveAs?: boolean
  headers?: Record<string, string>
  onerror?: (error: any) => void
  ontimeout?: () => void
  onload?: () => void
}): void
declare function GM_getResourceText(name: string): string
declare function GM_getResourceURL(name: string): string
declare function GM_addElement(parent: HTMLElement | Document, tagName: string, attributes?: Record<string, string>): HTMLElement
declare function GM_addStyle(css: string): HTMLStyleElement
declare function GM_getTab(callback: (tab: any) => void): void
declare function GM_saveTab(tab: any): void
declare function GM_getTabs(callback: (tabs: any[]) => void): void
declare function GM_webRequest(details: any): void
declare function GM_cookie(details: any): void
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
  /**
   * Container element to observe for DOM changes
   * If not specified, defaults to document.body
   * @default document.body
   */
  container?: Node
  /**
   * MutationObserver options
   * If not specified, defaults to { subtree: true, childList: true }
   * @default { subtree: true, childList: true }
   */
  observerOptions?: MutationObserverInit
}

declare interface WatchForOptions {
  /**
   * Minimum interval in milliseconds between callback executions
   * Even if MutationObserver triggers frequently, callback will execute at most once per interval
   * @default undefined (no interval limit)
   */
  minInterval?: number
  /**
   * Container element to observe for DOM changes
   * If not specified, defaults to document.body
   * @default document.body
   */
  container?: Node
  /**
   * MutationObserver options
   * If not specified, defaults to { subtree: true, childList: true, characterData: true, attributes: true }
   * @default { subtree: true, childList: true, characterData: true, attributes: true }
   */
  observerOptions?: MutationObserverInit
}

declare interface PollForOptions {
  /**
   * Interval in milliseconds between each poll execution
   * @default 1000 (1 second)
   */
  interval?: number
  /**
   * Use requestIdleCallback for polling when available
   * This can help reduce CPU load on busy pages
   * @default false
   */
  useIdleCallback?: boolean
}

type Query = () => (HTMLElement | SVGElement)[] | HTMLElement | SVGElement | NodeListOf<Element> | Element[] | any[] | null

type AsyncQuery =
  | (() => (HTMLElement | SVGElement)[] | HTMLElement | SVGElement | NodeListOf<Element> | Element[] | any[] | null)
  | (() => Promise<(HTMLElement | SVGElement)[] | HTMLElement | SVGElement | NodeListOf<Element> | Element[] | any[] | null>)

declare function GME_curl(content: string): Promise<any>
declare function GME_preview(file: string, content: string): void
declare function GME_waitFor<T extends AsyncQuery>(query: T, options?: WaitForOptions): Promise<Awaited<ReturnType<T>>>
declare function GME_watchFor<T extends AsyncQuery>(query: T, callback: (nodes: (HTMLElement | SVGElement)[]) => void, options?: WatchForOptions): () => void
declare function GME_watchForVisible<T extends AsyncQuery>(query: T, callback: (nodes: (HTMLElement | SVGElement)[]) => void, options?: WatchForOptions): () => void
declare function GME_pollFor<T extends AsyncQuery>(query: T, callback: (nodes: (HTMLElement | SVGElement)[]) => void, options?: PollForOptions): () => void
declare function GME_sleep(ms: number): Promise<unknown>
declare function GME_sha1(str: string): Promise<string>
declare function GME_debounce<T extends (...args: any[]) => any>(fn: T, wait: number): (...args: Parameters<T>) => void
declare function GME_throttle<T extends (...args: any[]) => any>(fn: T, wait: number): (...args: Parameters<T>) => void
declare function GME_isVisible(element: Element | null | undefined): boolean
declare function GME_ok(...contents: any[]): void
declare function GME_info(...contents: any[]): void
declare function GME_fail(...contents: any[]): void
declare function GME_warn(...contents: any[]): void
declare function GME_uuid(): string
declare function GME_notification(message: string, type?: 'success' | 'error' | 'info' | 'warn', duration?: number): any

// Browser File System Access API
declare global {
  interface Window {
    showDirectoryPicker(): Promise<FileSystemDirectoryHandle>
  }

  interface FileSystemDirectoryHandle {
    kind: 'directory'
    name: string
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>
    getFile(name: string): Promise<FileSystemFileHandle>
    requestPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
  }

  interface FileSystemFileHandle {
    kind: 'file'
    name: string
    getFile(): Promise<File>
  }

  interface FileSystemHandle {
    kind: 'file' | 'directory'
    name: string
  }
}

export {}
