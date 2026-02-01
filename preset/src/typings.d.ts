declare const __BASE_URL__: string
declare const __RULE_API_URL__: string
declare const __RULE_MANAGER_URL__: string
declare const __EDITOR_URL__: string
declare const __HMK_URL__: string
declare const __SCRIPT_URL__: string
declare const __IS_DEVELOP_MODE__: boolean
declare const __HOSTNAME_PORT__: string
declare const __GRANTS_STRING__: string
declare const __IS_REMOTE_EXECUTE__: boolean

declare function GM_getValue<T = any>(key: string, defaultValue?: T): T
declare function GM_setValue(key: string, value: any): void
declare function GM_deleteValue(key: string): void
declare function GM_listValues(): string[]
declare function GM_addValueChangeListener(key: string, callback: (name: string, oldValue: any, newValue: any, remote: boolean) => void): string
declare function GM_removeValueChangeListener(listenerId: string): void
declare function GM_log(...messages: any[]): void
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
declare function GM_unregisterMenuCommand(menuCmdId: number | string): void
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
declare function GM_setClipboard(data: string, info?: 'text' | 'html' | { type: 'text' | 'html'; mimetype?: string }, cb?: () => void): void
declare function GM_addElement(
  parentOrTagName: HTMLElement | Document | string,
  tagNameOrAttributes?: string | Record<string, string>,
  attributes?: Record<string, string>
): HTMLElement
declare function GM_addStyle(css: string): HTMLStyleElement
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
declare function GM_getResourceText(name: string): string
declare function GM_getResourceURL(name: string): string
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
declare function GM_setValues(obj: Record<string, any>): void
declare function GM_getValues(keys: string[] | Record<string, any>): Record<string, any>
declare function GM_deleteValues(keys: string[]): void
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
  method?: string
  url: string | URL | Blob | File
  headers?: Record<string, string>
  data?: string | Document | Blob | FormData | ArrayBuffer | URLSearchParams | object | any[]
  redirect?: 'follow' | 'error' | 'manual'
  cookie?: string
  cookiePartition?: {
    topLevelSite?: string
  }
  binary?: boolean
  nocache?: boolean
  revalidate?: boolean
  timeout?: number
  context?: any
  responseType?: 'arraybuffer' | 'blob' | 'json' | 'stream' | 'text'
  overrideMimeType?: string
  anonymous?: boolean
  fetch?: boolean
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
  user?: string
  password?: string
  onabort?: (error: GMXMLHttpRequestError) => void
  onerror?: (error: GMXMLHttpRequestError) => void
  onloadstart?: (response: GMXMLHttpRequestResponse) => void
  onprogress?: (event: ProgressEvent) => void
  onreadystatechange?: (response: GMXMLHttpRequestResponse) => void
  ontimeout?: (error: GMXMLHttpRequestError) => void
  onload?: (response: GMXMLHttpRequestResponse) => void
}
declare function GM_xmlhttpRequest(details: GMXMLHttpRequestDetails): {
  abort: () => void
}
declare function GM_getTab(callback?: (tab: any) => void): void
declare function GM_saveTab(tab: any, callback?: (error?: string) => void): void
declare function GM_getTabs(callback?: (tabs: Record<string, any>) => void): void
declare function GM_webRequest(details: any): void
declare function GM_cookie(details: any): void
declare const unsafeWindow: Window

declare function fetchScript(url: string): Promise<string>
declare function fetchCompileScript(host: string, files: Record<string, string>): Promise<string>
declare function fetchRulesFromCache(refetch?: boolean): Promise<any[]>
declare function matchUrl(pattern: string, url?: string): boolean

// Tab communication service types and functions (defined in services/tab-communication.ts)
// These are global types and functions, available in all files
interface TabInfo {
  id: string
  url: string
  hostname: string
  pathname: string
  title?: string
  origin?: string
  search?: string
  hash?: string
  isActive?: boolean
  lastHeartbeat: number
  lastActivity?: number
  metadata?: Record<string, any>
}

interface TabMessage {
  _channel: string
  _version: string
  type: 'broadcast' | 'send' | 'reply' | 'register' | 'unregister'
  from: string
  sender?: TabInfo
  to?: string | string[]
  messageId?: string
  data: any
  timestamp: number
  urlPattern?: string
}

interface TabCommunicationConfig {
  namespace?: string
  heartbeatInterval?: number
  tabTimeout?: number
  metadata?: Record<string, any>
}

interface TabCommunication {
  getTabId(): string
  getRegisteredTabs(): TabInfo[]
  getTabInfo(tabId: string): TabInfo | null
  broadcast(data: any, urlPattern?: string): Promise<void>
  send(toTabId: string, data: any, timeout?: number): Promise<any>
  reply(messageId: string, data: any, toTabId: string): Promise<void>
  onMessage(messageType: 'broadcast' | 'send' | 'reply' | 'register' | 'unregister' | '*', handler: (message: TabMessage, sender: TabInfo) => void | Promise<void>): string
  offMessage(handlerId: string): void
  onReply(handler: (message: TabMessage, sender: TabInfo) => any | Promise<any> | void | Promise<void>): string
  offReply(handlerId: string): void
}

// Tab communication and script update services are defined in services/*.ts
// They are global functions, no need to declare here as they are compiled together
// TypeScript will infer types from the actual implementations

// Script update service types (defined in services/script-update.ts)
interface ScriptUpdateConfig {
  defaultScriptUrl?: string
  namespace?: string
}

interface ScriptUpdate {
  update(scriptUrl?: string): Promise<void>
  isHostTab(): boolean
  getHostTabId(): string | null
  destroy(): void
}

// File System Access API types
interface FileSystemHandle {
  readonly kind: 'file' | 'directory'
  readonly name: string
  isSameEntry(other: FileSystemHandle): Promise<boolean>
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
}

interface FileSystemFileHandle extends FileSystemHandle {
  readonly kind: 'file'
  getFile(): Promise<File>
  createWritable(options?: FileSystemCreateWritableOptions): Promise<FileSystemWritableFileStream>
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  readonly kind: 'directory'
  getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions): Promise<FileSystemDirectoryHandle>
  getFileHandle(name: string, options?: FileSystemGetFileOptions): Promise<FileSystemFileHandle>
  removeEntry(name: string, options?: FileSystemRemoveOptions): Promise<void>
  resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null>
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
  keys(): AsyncIterableIterator<string>
  values(): AsyncIterableIterator<FileSystemHandle>
  [Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemHandle]>
}

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

interface FileSystemCreateWritableOptions {
  keepExistingData?: boolean
}

interface FileSystemGetFileOptions {
  create?: boolean
}

interface FileSystemGetDirectoryOptions {
  create?: boolean
}

interface FileSystemRemoveOptions {
  recursive?: boolean
}

interface FileSystemWritableFileStream extends WritableStream {
  write(
    data:
      | BufferSource
      | Blob
      | string
      | { type: 'write'; position?: number; data: BufferSource | Blob | string }
      | { type: 'seek'; position: number }
      | { type: 'truncate'; size: number }
  ): Promise<void>
  seek(position: number): Promise<void>
  truncate(size: number): Promise<void>
}

interface DirectoryPickerOptions {
  id?: string
  mode?: 'read' | 'readwrite'
  startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | FileSystemHandle
}

interface OpenFilePickerOptions {
  multiple?: boolean
  excludeAcceptAllOption?: boolean
  types?: Array<{
    description?: string
    accept: Record<string, string[]>
  }>
  id?: string
  startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | FileSystemHandle
}

interface SaveFilePickerOptions {
  suggestedName?: string
  excludeAcceptAllOption?: boolean
  types?: Array<{
    description?: string
    accept: Record<string, string[]>
  }>
  id?: string
  startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | FileSystemHandle
}

interface Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>
  showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>
  showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>
}
