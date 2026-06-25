import { EXPLORER_ICONS, explorerIconHtml } from '@/explorer-icons'
import type { TabBarHandle, TabBarOptions } from '@/types'

import explorerBaseCss from './styles/explorer-base.css?raw'

let stylesInjected = false

function injectStyles(parent: Document | ShadowRoot): void {
  const root = parent instanceof Document ? parent.head : parent
  if (root.querySelector('#vws-explorer-lib-styles') || stylesInjected) {
    return
  }
  const doc = parent instanceof Document ? parent : (parent.ownerDocument ?? document)
  const style = doc.createElement('style')
  style.id = 'vws-explorer-lib-styles'
  style.textContent = explorerBaseCss
  root.appendChild(style)
  stylesInjected = true
}

function fileNameFromPath(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash >= 0 ? path.slice(slash + 1) : path
}

/**
 * WEB ScriptEditor TabBar — open tabs, preview tab, context menu close actions.
 * @param parent Mount element
 * @param options Tab bar callbacks
 */
export function createTabBar(parent: HTMLElement, options: TabBarOptions = {}): TabBarHandle {
  if (!parent || !(parent instanceof HTMLElement)) {
    throw new Error('[explorer-lib] createTabBar() requires a parent HTMLElement')
  }

  const styleParent = parent.getRootNode()
  if (styleParent instanceof Document || styleParent instanceof ShadowRoot) {
    injectStyles(styleParent)
  }

  let openTabs: string[] = []
  let activeTab: string | null = null
  let previewTab: string | null = null
  let contextMenuPath: string | null = null
  let contextMenuX = 0
  let contextMenuY = 0

  const root = document.createElement('div')
  root.className = 'vws-tab-bar-root'

  const scroll = document.createElement('div')
  scroll.className = 'vws-tab-bar'

  const menu = document.createElement('div')
  menu.className = 'vws-tab-context-menu'
  menu.hidden = true
  menu.innerHTML = `
    <button type="button" data-action="close">Close</button>
    <button type="button" data-action="close-right">Close Tabs to the Right</button>
    <button type="button" data-action="close-others">Close Others</button>
    <button type="button" data-action="close-all">Close All</button>
  `

  root.append(scroll, menu)
  parent.appendChild(root)

  const closeMenu = () => {
    menu.hidden = true
    contextMenuPath = null
  }

  const render = () => {
    scroll.innerHTML = ''
    if (openTabs.length === 0) {
      root.hidden = true
      return
    }
    root.hidden = false

    for (const path of openTabs) {
      const isActive = path === activeTab
      const fileName = options.getFileName?.(path) ?? fileNameFromPath(path)
      const isDirty = options.isDirty?.(path) ?? false
      const isPreview = previewTab === path
      const iconHtml = options.renderFileIcon?.(fileName) ?? explorerIconHtml(EXPLORER_ICONS.file, 'vws-tab-file-icon')

      const tab = document.createElement('div')
      tab.className = `vws-tab${isActive ? ' vws-tab--active' : ''}${isPreview ? ' vws-tab--preview' : ''}`
      tab.title = path
      tab.dataset.path = path
      tab.innerHTML = `
        <span class="vws-tab-icon">${iconHtml}</span>
        <span class="vws-tab-label">${escapeHtml(fileName)}</span>
        <span class="vws-tab-trail">
          ${isDirty ? '<span class="vws-tab-dirty" title="Unsaved changes"></span>' : ''}
          <button type="button" class="vws-tab-close" aria-label="Close tab" title="Close tab">${explorerIconHtml(EXPLORER_ICONS.close, 'vws-tab-close-icon')}</button>
        </span>
      `

      tab.addEventListener('click', (e) => {
        const target = e.target as HTMLElement
        if (target.closest('.vws-tab-close')) return
        switchTab(path)
      })

      tab.querySelector('.vws-tab-close')?.addEventListener('click', (e) => {
        e.stopPropagation()
        closeTab(path)
      })

      tab.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        e.stopPropagation()
        contextMenuPath = path
        contextMenuX = e.clientX
        contextMenuY = e.clientY
        menu.style.left = `${contextMenuX}px`
        menu.style.top = `${contextMenuY}px`
        menu.hidden = false
      })

      scroll.appendChild(tab)
    }
  }

  const openTab = (path: string, opts?: { preview?: boolean }) => {
    const preview = opts?.preview === true
    if (openTabs.includes(path)) {
      if (!preview && previewTab === path) previewTab = null
      activeTab = path
      render()
      void options.onTabSwitch?.(path)
      return
    }

    if (preview && previewTab && openTabs.includes(previewTab)) {
      const canReplace = !options.isDirty?.(previewTab)
      if (canReplace) {
        const oldPreview = previewTab
        openTabs = openTabs.map((t) => (t === oldPreview ? path : t))
        if (activeTab === oldPreview) activeTab = path
        previewTab = path
        activeTab = path
        render()
        void options.onTabSwitch?.(path)
        return
      }
    }

    if (preview) previewTab = path
    else if (previewTab === path) previewTab = null

    openTabs = [...openTabs, path]
    activeTab = path
    render()
    void options.onTabSwitch?.(path)
  }

  const closeTab = (path: string) => {
    const idx = openTabs.indexOf(path)
    if (idx < 0) return
    const newTabs = openTabs.filter((t) => t !== path)
    if (path === activeTab) {
      if (newTabs.length > 0) {
        const nextIndex = idx < newTabs.length ? idx : idx - 1
        activeTab = newTabs[nextIndex] ?? null
      } else {
        activeTab = null
      }
    }
    if (path === previewTab) previewTab = null
    openTabs = newTabs
    render()
    options.onTabClose?.(path)
    if (activeTab) void options.onTabSwitch?.(activeTab)
    else options.onTabClose?.('')
  }

  const switchTab = (path: string) => {
    if (!openTabs.includes(path)) {
      openTab(path)
      return
    }
    activeTab = path
    if (previewTab === path) previewTab = null
    render()
    void options.onTabSwitch?.(path)
  }

  const closeAllTabs = () => {
    const closed = [...openTabs]
    openTabs = []
    activeTab = null
    previewTab = null
    render()
    closed.forEach((p) => options.onTabClose?.(p))
    options.onTabClose?.('')
  }

  const closeOtherTabs = (path: string) => {
    const closed = openTabs.filter((t) => t !== path)
    openTabs = openTabs.includes(path) ? [path] : []
    activeTab = openTabs[0] ?? null
    previewTab = previewTab === path ? previewTab : null
    render()
    closed.forEach((p) => options.onTabClose?.(p))
    if (activeTab) void options.onTabSwitch?.(activeTab)
  }

  const closeTabsToRight = (path: string) => {
    const idx = openTabs.indexOf(path)
    if (idx < 0) return
    const closed = openTabs.slice(idx + 1)
    openTabs = openTabs.slice(0, idx + 1)
    if (activeTab && !openTabs.includes(activeTab)) {
      activeTab = openTabs[openTabs.length - 1] ?? null
    }
    if (previewTab && !openTabs.includes(previewTab)) previewTab = null
    render()
    closed.forEach((p) => options.onTabClose?.(p))
    if (activeTab) void options.onTabSwitch?.(activeTab)
  }

  menu.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button[data-action]') as HTMLButtonElement | null
    if (!btn || !contextMenuPath) return
    const action = btn.dataset.action
    const path = contextMenuPath
    closeMenu()
    if (action === 'close') closeTab(path)
    else if (action === 'close-right') closeTabsToRight(path)
    else if (action === 'close-others') closeOtherTabs(path)
    else if (action === 'close-all') closeAllTabs()
  })

  document.addEventListener('mousedown', (e) => {
    if (!menu.hidden && !menu.contains(e.target as Node)) closeMenu()
  })

  return {
    openTab,
    closeTab,
    switchTab,
    closeAllTabs,
    closeOtherTabs,
    closeTabsToRight,
    getActiveTab: () => activeTab,
    getOpenTabs: () => [...openTabs],
    isTabOpen: (path) => openTabs.includes(path),
    refresh: render,
    destroy: () => {
      closeMenu()
      root.remove()
    },
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
