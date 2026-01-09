/** Base URL for the application */
declare const __BASE_URL__: string

/** API URL for rule management */
declare const __RULE_API_URL__: string

/** URL for the rule manager interface */
declare const __RULE_MANAGER_URL__: string

/** URL for the editor interface */
declare const __EDITOR_URL__: string

/**
 * Response object from GM_xmlhttpRequest
 */
declare interface GMXMLHttpRequestResponse {
  /** Final URL after redirects */
  finalUrl: string
  /** Ready state of the request */
  readyState: number
  /** Response headers as a string */
  responseHeaders: string
  /** Response data (parsed based on responseType) */
  response: any
  /** Response text */
  responseText: string
  /** Response as XML document, or null if not XML */
  responseXML: Document | null
  /** HTTP status code */
  status: number
  /** HTTP status text */
  statusText: string
}

/**
 * Error object from GM_xmlhttpRequest
 */
declare interface GMXMLHttpRequestError {
  /** Error type or code */
  error: string
  /** Optional error message */
  message?: string
}

/**
 * Request details for GM_xmlhttpRequest
 */
declare interface GMXMLHttpRequestDetails {
  /** HTTP method (GET, POST, etc.) */
  method: string
  /** Request URL */
  url: string
  /** Optional request headers */
  headers?: Record<string, string>
  /** Optional request data */
  data?: string | Document | Blob | FormData | ArrayBuffer | URLSearchParams
  /** Response type */
  responseType?: 'arraybuffer' | 'blob' | 'json' | 'stream' | 'text'
  /** Request body (alternative to data) */
  body?: any
  /** Request timeout in milliseconds */
  timeout?: number
  /** Callback when request completes successfully */
  onload?: (response: GMXMLHttpRequestResponse) => void
  /** Callback when request fails */
  onerror?: (error: GMXMLHttpRequestError) => void
  /** Callback when request is aborted */
  onabort?: (error: GMXMLHttpRequestError) => void
  /** Callback when request times out */
  ontimeout?: (error: GMXMLHttpRequestError) => void
  /** Callback for progress updates */
  onprogress?: (event: ProgressEvent) => void
}

/** Unsafe window object that bypasses content security policy */
declare const unsafeWindow: Window

/**
 * Make an HTTP request using Greasemonkey API
 * @param details Request configuration details
 */
declare function GM_xmlhttpRequest(details: GMXMLHttpRequestDetails): void

/**
 * Store a value in the script's storage
 * @param key Storage key
 * @param value Value to store
 */
declare function GM_setValue(key: string, value: any): void

/**
 * Retrieve a value from the script's storage
 * @param key Storage key
 * @param defaultValue Default value if key doesn't exist
 * @returns Stored value or default value
 */
declare function GM_getValue<T = any>(key: string, defaultValue?: T): T

/**
 * Delete a value from the script's storage
 * @param key Storage key to delete
 */
declare function GM_deleteValue(key: string): void

/**
 * Get all storage keys
 * @returns Array of all storage keys
 */
declare function GM_listValues(): string[]

/**
 * Store multiple values in the script's storage
 * @param obj Object with key-value pairs to store
 */
declare function GM_setValues(obj: Record<string, any>): void

/**
 * Retrieve multiple values from the script's storage
 * @param keys Array of storage keys
 * @returns Object with key-value pairs
 */
declare function GM_getValues(keys: string[]): Record<string, any>

/**
 * Delete multiple values from the script's storage
 * @param keys Array of storage keys to delete
 */
declare function GM_deleteValues(keys: string[]): void

/**
 * Add a listener for value changes
 * @param key Storage key to watch
 * @param callback Callback function called when value changes
 * @returns Listener ID for removal
 */
declare function GM_addValueChangeListener(key: string, callback: (name: string, oldValue: any, newValue: any, remote: boolean) => void): string

/**
 * Remove a value change listener
 * @param listenerId Listener ID returned from GM_addValueChangeListener
 */
declare function GM_removeValueChangeListener(listenerId: string): void

/**
 * Log messages to the console
 * @param messages Messages to log
 */
declare function GM_log(...messages: any[]): void

/**
 * Set clipboard content
 * @param text Text to copy to clipboard
 * @param info Clipboard format ('text' or 'html')
 * @param callback Callback function called after clipboard is set
 */
declare function GM_setClipboard(text: string, info: 'text' | 'html', callback: () => void): void

/**
 * Register a menu command in the userscript menu
 * @param caption Menu item caption
 * @param commandFunc Function to execute when menu item is clicked
 * @param accessKey Optional keyboard shortcut key
 * @returns Menu command ID
 */
declare function GM_registerMenuCommand(caption: string, commandFunc: () => void, accessKey?: string): number

/**
 * Unregister a menu command
 * @param menuCmdId Menu command ID returned from GM_registerMenuCommand
 */
declare function GM_unregisterMenuCommand(menuCmdId: number): void

/**
 * Show a notification
 * @param text Notification text
 * @param title Optional notification title
 * @param image Optional notification image URL
 * @param onClick Optional callback when notification is clicked
 */
declare function GM_notification(text: string, title?: string, image?: string, onClick?: () => void): void

/**
 * Get information about the userscript
 * @param text Information text
 */
declare function GM_info(text: string): void

/**
 * Open a URL in a new tab
 * @param url URL to open
 * @param openInBackground Whether to open in background (default: false)
 */
declare function GM_openInTab(url: string, openInBackground?: boolean): void

/**
 * Download a file
 * @param details Download configuration
 */
declare function GM_download(details: {
  /** URL of the file to download */
  url: string
  /** Filename for the downloaded file */
  name: string
  /** Whether to show save-as dialog */
  saveAs?: boolean
  /** Optional request headers */
  headers?: Record<string, string>
  /** Callback when download fails */
  onerror?: (error: any) => void
  /** Callback when download times out */
  ontimeout?: () => void
  /** Callback when download completes */
  onload?: () => void
}): void

/**
 * Get resource text by name
 * @param name Resource name
 * @returns Resource text content
 */
declare function GM_getResourceText(name: string): string

/**
 * Get resource URL by name
 * @param name Resource name
 * @returns Resource URL
 */
declare function GM_getResourceURL(name: string): string

/**
 * Add an element to the DOM
 * @param parent Parent element or document
 * @param tagName HTML tag name
 * @param attributes Optional element attributes
 * @returns Created element
 */
declare function GM_addElement(parent: HTMLElement | Document, tagName: string, attributes?: Record<string, string>): HTMLElement

/**
 * Add CSS styles to the page
 * @param css CSS string to inject
 * @returns Created style element
 */
declare function GM_addStyle(css: string): HTMLStyleElement

/**
 * Get current tab information
 * @param callback Callback function with tab information
 */
declare function GM_getTab(callback: (tab: any) => void): void

/**
 * Save tab information
 * @param tab Tab object to save
 */
declare function GM_saveTab(tab: any): void

/**
 * Get all tabs information
 * @param callback Callback function with array of tab information
 */
declare function GM_getTabs(callback: (tabs: any[]) => void): void

/**
 * Intercept and modify web requests
 * @param details Request interception details
 */
declare function GM_webRequest(details: any): void

/**
 * Manage cookies
 * @param details Cookie operation details
 */
declare function GM_cookie(details: any): void

/**
 * Menu item configuration for custom menu commands
 */
declare interface MenuItem {
  /** Unique menu item identifier */
  id: string
  /** Menu item text */
  text: string
  /** Optional icon URL or identifier */
  icon?: string
  /** Optional hint text */
  hint?: string
  /** Optional action function */
  action?: () => void
}

/**
 * Register a custom menu command with extended options
 * @param item Menu item configuration
 * @returns Menu command identifier
 */
declare function GME_registerMenuCommand(item: MenuItem): any

/**
 * Options for waiting for DOM elements
 */
declare interface WaitForOptions {
  /** Timeout flag (deprecated, use timeout value instead) */
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

/**
 * Options for watching DOM elements
 */
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

/**
 * Options for polling DOM elements
 */
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

/**
 * Query function type that returns DOM elements synchronously
 */
type Query = () => (HTMLElement | SVGElement)[] | HTMLElement | SVGElement | NodeListOf<Element> | Element[] | any[] | null

/**
 * Async query function type that returns DOM elements synchronously or asynchronously
 */
type AsyncQuery =
  | (() => (HTMLElement | SVGElement)[] | HTMLElement | SVGElement | NodeListOf<Element> | Element[] | any[] | null)
  | (() => Promise<(HTMLElement | SVGElement)[] | HTMLElement | SVGElement | NodeListOf<Element> | Element[] | any[] | null>)

/**
 * Fetch-like function using GM_xmlhttpRequest
 * Compatible with standard fetch API but uses Tampermonkey's GM_xmlhttpRequest
 * @param input Request URL or Request object
 * @param init Optional request options (method, headers, body, etc.)
 * @returns Promise that resolves to a Response object
 */
declare function GME_fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>

/**
 * Execute curl command and return result
 * @param content Curl command content
 * @returns Promise that resolves to the curl result
 */
declare function GME_curl(content: string): Promise<any>

/**
 * Preview a file in the editor
 * @param file File name or path
 * @param content File content to preview
 */
declare function GME_preview(file: string, content: string): void

/**
 * Wait for DOM elements to appear
 * @param query Query function that returns elements
 * @param options Optional wait options
 * @returns Promise that resolves to the query result
 */
declare function GME_waitFor<T extends AsyncQuery>(query: T, options?: WaitForOptions): Promise<Awaited<ReturnType<T>>>

/**
 * Watch for DOM elements and execute callback when they appear or change
 * @param query Query function that returns elements
 * @param callback Callback function called when elements are found
 * @param options Optional watch options
 * @returns Function to stop watching
 */
declare function GME_watchFor<T extends AsyncQuery>(query: T, callback: (nodes: (HTMLElement | SVGElement)[]) => void, options?: WatchForOptions): () => void

/**
 * Watch for visible DOM elements and execute callback when they become visible
 * @param query Query function that returns elements
 * @param callback Callback function called when visible elements are found
 * @param options Optional watch options
 * @returns Function to stop watching
 */
declare function GME_watchForVisible<T extends AsyncQuery>(query: T, callback: (nodes: (HTMLElement | SVGElement)[]) => void, options?: WatchForOptions): () => void

/**
 * Poll for DOM elements at regular intervals
 * @param query Query function that returns elements
 * @param callback Callback function called when elements are found
 * @param options Optional polling options
 * @returns Function to stop polling
 */
declare function GME_pollFor<T extends AsyncQuery>(query: T, callback: (nodes: (HTMLElement | SVGElement)[]) => void, options?: PollForOptions): () => void

/**
 * Sleep for a specified number of milliseconds
 * @param ms Milliseconds to sleep
 * @returns Promise that resolves after the sleep duration
 */
declare function GME_sleep(ms: number): Promise<unknown>

/**
 * Calculate SHA-1 hash of a string
 * @param str String to hash
 * @returns Promise that resolves to the SHA-1 hash
 */
declare function GME_sha1(str: string): Promise<string>

/**
 * Create a debounced version of a function
 * @param fn Function to debounce
 * @param wait Wait time in milliseconds
 * @returns Debounced function
 */
declare function GME_debounce<T extends (...args: any[]) => any>(fn: T, wait: number): (...args: Parameters<T>) => void

/**
 * Create a throttled version of a function
 * @param fn Function to throttle
 * @param wait Wait time in milliseconds
 * @returns Throttled function
 */
declare function GME_throttle<T extends (...args: any[]) => any>(fn: T, wait: number): (...args: Parameters<T>) => void

/**
 * Check if an element is visible
 * @param element Element to check
 * @returns True if element is visible, false otherwise
 */
declare function GME_isVisible(element: Element | null | undefined): boolean

/**
 * Create logging functions with a module prefix
 * @param prefix Optional prefix to add to log messages (e.g., module name)
 * @returns Object containing logging functions with module prefix
 */
declare function createGMELogger(prefix?: string): {
  /** Log success message with module prefix */
  GME_ok: (...contents: any[]) => void
  /** Log info message with module prefix */
  GME_info: (...contents: any[]) => void
  /** Log error message with module prefix */
  GME_fail: (...contents: any[]) => void
  /** Log warning message with module prefix */
  GME_warn: (...contents: any[]) => void
}

/**
 * Log success message
 * @param contents Messages to log
 */
declare function GME_ok(...contents: any[]): void

/**
 * Log info message
 * @param contents Messages to log
 */
declare function GME_info(...contents: any[]): void

/**
 * Log error message
 * @param contents Messages to log
 */
declare function GME_fail(...contents: any[]): void

/**
 * Log warning message
 * @param contents Messages to log
 */
declare function GME_warn(...contents: any[]): void

/**
 * Generate a UUID
 * @returns UUID string
 */
declare function GME_uuid(): string

/**
 * Show a notification
 * @param message Notification message
 * @param type Notification type
 * @param duration Duration in milliseconds
 * @returns Notification instance
 */
declare function GME_notification(message: string, type?: 'success' | 'error' | 'info' | 'warn', duration?: number): any

/**
 * Browser File System Access API type definitions
 */
declare global {
  interface Window {
    /**
     * Show directory picker dialog
     * @returns Promise that resolves to the selected directory handle
     */
    showDirectoryPicker(): Promise<FileSystemDirectoryHandle>
  }

  /**
   * Directory handle in the File System Access API
   */
  interface FileSystemDirectoryHandle {
    /** Always 'directory' for directory handles */
    kind: 'directory'
    /** Directory name */
    name: string
    /**
     * Get entries in the directory
     * @returns Async iterator of [name, handle] pairs
     */
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>
    /**
     * Get a file handle by name
     * @param name File name
     * @returns Promise that resolves to the file handle
     */
    getFile(name: string): Promise<FileSystemFileHandle>
    /**
     * Request permission to access the directory
     * @param options Permission options
     * @returns Promise that resolves to the permission state
     */
    requestPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
  }

  /**
   * File handle in the File System Access API
   */
  interface FileSystemFileHandle {
    /** Always 'file' for file handles */
    kind: 'file'
    /** File name */
    name: string
    /**
     * Get the file object
     * @returns Promise that resolves to the File object
     */
    getFile(): Promise<File>
  }

  /**
   * Base interface for file system handles
   */
  interface FileSystemHandle {
    /** Handle type: 'file' or 'directory' */
    kind: 'file' | 'directory'
    /** Handle name */
    name: string
  }
}

export {}
