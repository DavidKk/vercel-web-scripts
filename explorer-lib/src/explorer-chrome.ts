import { EXPLORER_ICONS, explorerIconHtml } from '@/explorer-icons'
import type { ExplorerChromeHandle, ExplorerChromeOptions } from '@/types'

import explorerBaseCss from './styles/explorer-base.css?raw'

/**
 * Inject explorer-lib base styles once per document or shadow root.
 * @param parent Document or shadow root
 */
function injectExplorerStyles(parent: Document | ShadowRoot): void {
  const root = parent instanceof Document ? parent.head : parent
  if (root.querySelector('#vws-explorer-lib-styles')) {
    return
  }
  const doc = parent instanceof Document ? parent : (parent.ownerDocument ?? document)
  const style = doc.createElement('style')
  style.id = 'vws-explorer-lib-styles'
  style.textContent = explorerBaseCss
  root.appendChild(style)
}

/**
 * Create WEB-aligned explorer chrome (header + toggle search + tree host).
 * @param parent Mount element
 * @param options Chrome options
 * @returns Explorer chrome handle
 */
export function createExplorerChrome(parent: HTMLElement, options: ExplorerChromeOptions = {}): ExplorerChromeHandle {
  if (!parent || !(parent instanceof HTMLElement)) {
    throw new Error('[explorer-lib] createChrome() requires a parent HTMLElement')
  }

  const title = options.title ?? 'Files'
  const placeholder = options.searchPlaceholder ?? 'Search files...'
  const styleParent = parent.getRootNode()
  if (styleParent instanceof Document || styleParent instanceof ShadowRoot) {
    injectExplorerStyles(styleParent)
  }

  const root = document.createElement('div')
  root.className = 'vws-explorer'

  let searchOpen = false
  let searchQuery = ''

  const header = document.createElement('div')
  header.className = 'vws-explorer-header'

  const titleEl = document.createElement('span')
  titleEl.className = 'vws-explorer-title'
  titleEl.textContent = title

  const actions = document.createElement('div')
  actions.className = 'vws-explorer-header-actions'

  const searchToggle = document.createElement('button')
  searchToggle.type = 'button'
  searchToggle.className = 'vws-explorer-icon-btn'
  searchToggle.title = 'Search files (Cmd+F / Ctrl+F)'
  searchToggle.setAttribute('aria-label', 'Search files')
  searchToggle.innerHTML = explorerIconHtml(EXPLORER_ICONS.search)

  const searchRow = document.createElement('div')
  searchRow.className = 'vws-explorer-search'
  searchRow.hidden = true

  const searchWrap = document.createElement('div')
  searchWrap.className = 'vws-explorer-search-wrap'

  const searchIconLeft = document.createElement('span')
  searchIconLeft.className = 'vws-explorer-search-icon'
  searchIconLeft.innerHTML = explorerIconHtml(EXPLORER_ICONS.search, 'vws-explorer-search-glyph')

  const searchInput = document.createElement('input')
  searchInput.type = 'text'
  searchInput.className = 'vws-explorer-search-input'
  searchInput.placeholder = placeholder
  searchInput.setAttribute('aria-label', 'Search files')

  const clearBtn = document.createElement('button')
  clearBtn.type = 'button'
  clearBtn.className = 'vws-explorer-search-clear'
  clearBtn.hidden = true
  clearBtn.title = 'Clear search'
  clearBtn.setAttribute('aria-label', 'Clear search')
  clearBtn.innerHTML = explorerIconHtml(EXPLORER_ICONS.close, 'vws-explorer-search-glyph')

  const treeHost = document.createElement('div')
  treeHost.className = 'vws-explorer-tree'

  searchWrap.append(searchIconLeft, searchInput, clearBtn)
  searchRow.append(searchWrap)
  actions.append(searchToggle)
  header.append(titleEl, actions)
  root.append(header, searchRow, treeHost)
  parent.appendChild(root)

  const emitSearch = () => options.onSearchChange?.(searchQuery)

  const updateSearchRow = () => {
    searchRow.hidden = !searchOpen
    if (searchOpen) {
      window.setTimeout(() => searchInput.focus(), 0)
    }
  }

  searchToggle.addEventListener('click', (e) => {
    e.stopPropagation()
    searchOpen = !searchOpen
    if (searchOpen) {
      searchQuery = ''
      searchInput.value = ''
      clearBtn.hidden = true
    }
    updateSearchRow()
    emitSearch()
  })

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value
    clearBtn.hidden = !searchQuery
    emitSearch()
  })

  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    searchQuery = ''
    searchInput.value = ''
    clearBtn.hidden = true
    emitSearch()
    searchInput.focus()
  })

  return {
    root,
    treeHost,
    getSearchQuery: () => searchQuery,
    setSearchQuery: (q) => {
      searchQuery = q
      searchInput.value = q
      clearBtn.hidden = !q
    },
    setSearchOpen: (open) => {
      searchOpen = open
      updateSearchRow()
    },
    toggleSearch: () => {
      searchOpen = !searchOpen
      updateSearchRow()
    },
    focusSearch: () => searchInput.focus(),
    destroy: () => root.remove(),
  }
}
