/** Explorer chrome options (WEB FileListPanelHeader-aligned). */
export interface ExplorerChromeOptions {
  /** Panel title — default `Files` */
  title?: string
  /** Search input placeholder */
  searchPlaceholder?: string
  /** Fired when search query changes */
  onSearchChange?: (query: string) => void
}

/** Handle returned by {@link ExplorerLibApi.createChrome}. */
export interface ExplorerChromeHandle {
  /** Root explorer container */
  root: HTMLElement
  /** Mount file tree content here */
  treeHost: HTMLElement
  getSearchQuery(): string
  setSearchQuery(query: string): void
  setSearchOpen(open: boolean): void
  toggleSearch(): void
  focusSearch(): void
  destroy(): void
}

/** Tab bar options (WEB TabBar / TabBarContext). */
export interface TabBarOptions {
  onTabSwitch?: (path: string) => void | Promise<void>
  onTabClose?: (path: string) => void
  isDirty?: (path: string) => boolean
  getFileName?: (path: string) => string
  renderFileIcon?: (fileName: string) => string
}

/** Tab bar handle */
export interface TabBarHandle {
  openTab(path: string, options?: { preview?: boolean }): void
  closeTab(path: string): void
  switchTab(path: string): void
  closeAllTabs(): void
  closeOtherTabs(path: string): void
  closeTabsToRight(path: string): void
  getActiveTab(): string | null
  getOpenTabs(): string[]
  isTabOpen(path: string): boolean
  refresh(): void
  destroy(): void
}

/** Options for {@link ExplorerLibApi.listNoDataHtml}. */
export interface ListNoDataOptions {
  search?: boolean
  title?: string
  hint?: string
}

/** Public explorer-lib API (OTA module). */
export interface ExplorerLibApi {
  version: 1
  ready: true
  createChrome(parent: HTMLElement, options?: ExplorerChromeOptions): ExplorerChromeHandle
  createTabBar(parent: HTMLElement, options?: TabBarOptions): TabBarHandle
  /** WEB FileListPanel loading HTML (`data-state="loading"`). */
  listLoadingHtml(message?: string): string
  /** WEB FileListPanel empty HTML (`data-state="nodata"`). */
  listNoDataHtml(options?: ListNoDataOptions): string
}
