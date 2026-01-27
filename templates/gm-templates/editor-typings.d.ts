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
  method?: string
  /** Request URL, Blob, or File */
  url: string | URL | Blob | File
  /** Optional request headers */
  headers?: Record<string, string>
  /** Optional request data */
  data?: string | Document | Blob | FormData | ArrayBuffer | URLSearchParams | object | any[]
  /** Redirect handling */
  redirect?: 'follow' | 'error' | 'manual'
  /** Cookie to patch into sent cookie set */
  cookie?: string
  /** Cookie partition key */
  cookiePartition?: {
    topLevelSite?: string
  }
  /** Send data string in binary mode */
  binary?: boolean
  /** Don't cache the resource */
  nocache?: boolean
  /** Revalidate maybe cached content */
  revalidate?: boolean
  /** Request timeout in milliseconds */
  timeout?: number
  /** Property added to response object */
  context?: any
  /** Response type */
  responseType?: 'arraybuffer' | 'blob' | 'json' | 'stream' | 'text'
  /** MIME type override */
  overrideMimeType?: string
  /** Don't send cookies with the request */
  anonymous?: boolean
  /** Use fetch instead of XMLHttpRequest */
  fetch?: boolean
  /** Proxy configuration (Firefox only) */
  proxy?: {
    type: 'direct' | 'http' | 'https' | 'socks' | 'socks4'
    host: string
    port: number
    username?: string
    password?: string
    proxyDNS?: boolean
    failoverTimeout?: number
    proxyAuthorizationHeader?: string
    connectionIsolationKey?: string
  }
  /** User name for authentication */
  user?: string
  /** Password for authentication */
  password?: string
  /** Callback when request is aborted */
  onabort?: (error: GMXMLHttpRequestError) => void
  /** Callback when request fails */
  onerror?: (error: GMXMLHttpRequestError) => void
  /** Callback on load start */
  onloadstart?: (response: GMXMLHttpRequestResponse) => void
  /** Callback for progress updates */
  onprogress?: (event: ProgressEvent) => void
  /** Callback when ready state changes */
  onreadystatechange?: (response: GMXMLHttpRequestResponse) => void
  /** Callback when request times out */
  ontimeout?: (error: GMXMLHttpRequestError) => void
  /** Callback when request completes successfully */
  onload?: (response: GMXMLHttpRequestResponse) => void
}

/** Unsafe window object that bypasses content security policy */
declare const unsafeWindow: Window

/**
 * Make an HTTP request using Greasemonkey API
 * @param details Request configuration details
 * @returns Object with abort function to cancel the request
 */
declare function GM_xmlhttpRequest(details: GMXMLHttpRequestDetails): {
  abort: () => void
}

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
 * @param keysOrDefaults Array of storage keys or object with default values
 * @returns Object with key-value pairs
 */
declare function GM_getValues(keys: string[] | Record<string, any>): Record<string, any>

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
 * @param data Text or HTML to copy to clipboard
 * @param info Clipboard format - can be a string ('text' or 'html') or an object with type and optional mimetype
 * @param cb Optional callback function called when the clipboard has been set
 */
declare function GM_setClipboard(data: string, info?: 'text' | 'html' | { type: 'text' | 'html'; mimetype?: string }, cb?: () => void): void

/**
 * Register a menu command in the userscript menu
 * @param name Menu item name
 * @param callback Function to execute when menu item is clicked
 * @param optionsOrAccessKey Options object or access key string
 * @returns Menu command ID
 */
declare function GM_registerMenuCommand(
  name: string,
  callback: (event: MouseEvent | KeyboardEvent) => void,
  optionsOrAccessKey?:
    | {
        id?: number | string
        accessKey?: string
        autoClose?: boolean
        title?: string
      }
    | string
): number | string

/**
 * Unregister a menu command
 * @param menuCmdId Menu command ID returned from GM_registerMenuCommand
 */
declare function GM_unregisterMenuCommand(menuCmdId: number | string): void

/**
 * Show a notification
 * @param details Notification details object or text string
 * @param titleOrOndone Title string or ondone callback (if details is string)
 * @param image Image URL (if details is string)
 * @param onClick Click callback (if details is string)
 */
declare function GM_notification(
  details:
    | {
        text: string
        title?: string
        tag?: string
        image?: string
        highlight?: boolean
        silent?: boolean
        timeout?: number
        url?: string
        onclick?: (event: Event) => void
        ondone?: () => void
      }
    | string,
  titleOrOndone?: string | (() => void),
  image?: string,
  onClick?: () => void
): void

/**
 * Get information about the userscript and Tampermonkey
 * This is a constant object, not a function
 */
declare const GM_info: {
  container?: {
    id: string
    name?: string
  }
  downloadMode: string
  isFirstPartyIsolation?: boolean
  isIncognito: boolean
  sandboxMode?: 'js' | 'raw' | 'dom'
  scriptHandler: string
  scriptMetaStr: string | null
  scriptUpdateURL: string | null
  scriptWillUpdate: boolean
  userAgentData?: {
    brands?: { brand: string; version: string }[]
    mobile?: boolean
    platform?: string
    architecture?: string
    bitness?: string
  }
  version?: string
  script: {
    antifeatures: { [antifeature: string]: { [locale: string]: string } }
    author: string | null
    blockers: string[]
    connects: string[]
    copyright: string | null
    deleted?: number
    description_i18n: { [locale: string]: string } | null
    description: string
    downloadURL: string | null
    excludes: string[]
    fileURL: string | null
    grant: string[]
    header: string | null
    homepage: string | null
    icon: string | null
    icon64: string | null
    includes: string[]
    lastModified: number
    matches: string[]
    name_i18n: { [locale: string]: string } | null
    name: string
    namespace: string | null
    position: number
    resources: Array<{
      name: string
      url: string
      error?: string
      content?: string
      meta?: string
    }>
    supportURL: string | null
    system?: boolean
    'run-at': string | null
    'run-in': string[] | null
    unwrap: boolean | null
    updateURL: string | null
    version: string
    webRequest: Array<{
      selector: { include?: string | string[]; match?: string | string[]; exclude?: string | string[] } | string
      action: string | { cancel?: boolean; redirect?: { url: string; from?: string; to?: string } | string }
    }> | null
    options: {
      check_for_updates: boolean
      comment: string | null
      compatopts_for_requires: boolean
      compat_wrappedjsobject: boolean
      compat_metadata: boolean
      compat_foreach: boolean
      compat_powerful_this: boolean | null
      sandbox: string | null
      noframes: boolean | null
      unwrap: boolean | null
      run_at: string | null
      run_in: string | null
      override: {
        use_includes: string[]
        orig_includes: string[]
        merge_includes: boolean
        use_matches: string[]
        orig_matches: string[]
        merge_matches: boolean
        use_excludes: string[]
        orig_excludes: string[]
        merge_excludes: boolean
        use_connects: string[]
        orig_connects: string[]
        merge_connects: boolean
        use_blockers: string[]
        orig_run_at: string | null
        orig_run_in: string[] | null
        orig_noframes: boolean | null
      }
    }
  }
}

/**
 * Open a URL in a new tab
 * @param url URL to open
 * @param options Options object or boolean for loadInBackground
 * @returns Object with close function, onclose listener, and closed flag
 */
declare function GM_openInTab(
  url: string,
  options?:
    | {
        active?: boolean
        insert?: number
        setParent?: boolean
        incognito?: boolean
        loadInBackground?: boolean
      }
    | boolean
): {
  close: () => void
  onclose: () => void
  closed: boolean
}

/**
 * Download a file
 * @param details Download configuration object or URL string
 * @param name Filename (if details is string)
 * @returns Object with abort function
 */
declare function GM_download(
  details:
    | {
        url: string | Blob | File
        name: string
        saveAs?: boolean
        conflictAction?: 'uniquify' | 'overwrite' | 'prompt'
        headers?: Record<string, string>
        onerror?: (error: { error: string; details?: string }) => void
        ontimeout?: () => void
        onload?: () => void
        onprogress?: (event: ProgressEvent) => void
      }
    | string,
  name?: string
): {
  abort: () => void
}

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
 * @param parentOrTagName Parent element, document, or tag name string
 * @param tagNameOrAttributes Tag name string or attributes object
 * @param attributes Optional element attributes (if parent is provided)
 * @returns Created element
 */
declare function GM_addElement(
  parentOrTagName: HTMLElement | Document | string,
  tagNameOrAttributes?: string | Record<string, string>,
  attributes?: Record<string, string>
): HTMLElement

/**
 * Add CSS styles to the page
 * @param css CSS string to inject
 * @returns Created style element
 */
declare function GM_addStyle(css: string): HTMLStyleElement

/**
 * Get current tab information
 * @param callback Optional callback function with tab information
 */
declare function GM_getTab(callback?: (tab: any) => void): void

/**
 * Save tab information
 * @param tab Tab object to save
 * @param callback Optional callback function called when operation completes
 */
declare function GM_saveTab(tab: any, callback?: (error?: string) => void): void

/**
 * Get all tabs information
 * @param callback Optional callback function with tabs object
 */
declare function GM_getTabs(callback?: (tabs: Record<string, any>) => void): void

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
 * Update an existing menu command by id
 * @param id Menu item id to update
 * @param updates Partial menu item properties to update
 * @returns Whether the menu item was found and updated
 */
declare function GME_updateMenuCommand(id: string, updates: Partial<Omit<MenuItem, 'id'>>): boolean

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
declare type Query = () => (HTMLElement | SVGElement)[] | HTMLElement | SVGElement | NodeListOf<Element> | Element[] | any[] | null

/**
 * Async query function type that returns DOM elements synchronously or asynchronously
 */
declare type AsyncQuery =
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
 * Group logger interface
 * Provides methods to log within a group and end the group
 */
interface GroupLogger {
  /** Log info message within the group */
  info(...contents: any[]): GroupLogger
  /** Log success message within the group */
  ok(...contents: any[]): GroupLogger
  /** Log warning message within the group */
  warn(...contents: any[]): GroupLogger
  /** Log error message within the group */
  fail(...contents: any[]): GroupLogger
  /** Log debug message within the group */
  debug(...contents: any[]): GroupLogger
  /** End the group and output summary */
  end(): void
}

/**
 * Create a log group
 * Returns a GroupLogger object with info, ok, warn, fail, debug, and end methods
 * Logs are immediately output and also collected for summary
 * @param label Group label
 * @returns GroupLogger instance
 * @example
 * const group = GME_group('User Authentication')
 * group.info('Fetching user data')
 * group.ok('User authenticated')
 * group.fail('Connection failed') // Immediately output, not blocked
 * group.end() // Output summary with all collected logs
 * @example
 * // Chain calls
 * GME_group('Processing Data')
 *   .info('Step 1')
 *   .ok('Step 2 completed')
 *   .end()
 */
declare function GME_group(label: string): GroupLogger

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
