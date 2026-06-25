import { EXPLORER_ICONS, explorerIconHtml } from '@/explorer-icons'

/** Options for explorer list empty (NODATA) state — WEB FileListPanel aligned. */
export interface ListNoDataOptions {
  /** Search-active empty state (no matches) */
  search?: boolean
  title?: string
  hint?: string
}

const DEFAULT_LOADING = 'Loading files...'
const DEFAULT_EMPTY_TITLE = 'No files'
const DEFAULT_EMPTY_HINT = 'Click the + button to add a file'
const DEFAULT_SEARCH_TITLE = 'No files found'
const DEFAULT_SEARCH_HINT = 'Try a different search term'

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * WEB FileListPanel loading state — centered spinner + label.
 * @param message Loading label — default `Loading files...`
 */
export function listLoadingHtml(message = DEFAULT_LOADING): string {
  return `<div class="vws-explorer-list-state" data-state="loading" role="status">
    <div class="vws-explorer-list-state-inner">
      <span class="vws-explorer-list-spinner" aria-hidden="true"></span>
      <p class="vws-explorer-list-state-title">${escapeHtml(message)}</p>
    </div>
  </div>`
}

/**
 * WEB FileListPanel empty state — folder/search icon + title + hint.
 * @param options Empty state copy and variant
 */
export function listNoDataHtml(options: ListNoDataOptions = {}): string {
  const search = options.search === true
  const title = options.title ?? (search ? DEFAULT_SEARCH_TITLE : DEFAULT_EMPTY_TITLE)
  const hint = options.hint ?? (search ? DEFAULT_SEARCH_HINT : DEFAULT_EMPTY_HINT)
  const icon = search ? EXPLORER_ICONS.search : EXPLORER_ICONS.folder
  return `<div class="vws-explorer-list-state" data-state="nodata">
    <div class="vws-explorer-list-state-inner">
      ${explorerIconHtml(icon, 'vws-explorer-list-state-icon')}
      <p class="vws-explorer-list-state-title">${escapeHtml(title)}</p>
      <p class="vws-explorer-list-state-hint">${escapeHtml(hint)}</p>
    </div>
  </div>`
}
