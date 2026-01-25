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
declare function GM_registerMenuCommand(caption: string, commandFunc: () => void, accessKey?: string): number
declare function GM_unregisterMenuCommand(menuCmdId: number): void
declare function GM_notification(text: string, title?: string, image?: string, onClick?: () => void): void
declare function GM_openInTab(url: string, openInBackground?: boolean): void
declare function GM_setClipboard(data: string, type?: 'text' | 'html'): void

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
