import { parseAdminHash } from './mm-admin-hash'
import { bindAdminNavIndicator } from './mm-admin-nav'

type AdminTabKey = 'servers' | 'scripts' | 'rules'

const REPO_URL = 'https://github.com/DavidKk/vercel-web-scripts'

const TAB_CONFIG: Array<{ key: AdminTabKey; label: string; hash: string }> = [
  { key: 'servers', label: 'Servers', hash: '#servers' },
  { key: 'scripts', label: 'Scripts', hash: '#scripts' },
  { key: 'rules', label: 'Rules', hash: '#rules' },
]

export class MmAdminTabs extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['current']
  }

  connectedCallback(): void {
    if (location.hash) {
      this.setAttribute('current', parseAdminHash(location.hash).tab)
    }
    if (!this.querySelector('.mm-admin-nav')) {
      this.buildNav()
    }
    this.syncCurrentTab()
  }

  attributeChangedCallback(name: string): void {
    if (name !== 'current') {
      return
    }
    this.syncCurrentTab()
  }

  private buildNav(): void {
    const navLabel = this.getAttribute('nav-label') || 'Extension pages'

    this.innerHTML = ''
    const nav = document.createElement('nav')
    nav.className = 'mm-admin-nav'
    nav.setAttribute('aria-label', navLabel)

    for (const tab of TAB_CONFIG) {
      const link = document.createElement('a')
      link.href = tab.hash
      link.className = 'mm-admin-nav-link'
      link.dataset.adminTab = tab.key
      link.textContent = tab.label
      nav.appendChild(link)
    }

    const github = document.createElement('a')
    github.href = REPO_URL
    github.className = 'mm-admin-nav-github'
    github.target = '_blank'
    github.rel = 'noreferrer noopener'
    github.setAttribute('aria-label', 'Open GitHub repository')
    github.title = 'Open GitHub repository'
    github.innerHTML =
      '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8a8.01 8.01 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.58 7.58 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>'
    nav.appendChild(github)

    this.appendChild(nav)
    bindAdminNavIndicator(nav)
  }

  private syncCurrentTab(): void {
    const currentAttr = (this.getAttribute('current') || 'servers').toLowerCase()
    const current = (['servers', 'scripts', 'rules'] as const).includes(currentAttr as AdminTabKey) ? (currentAttr as AdminTabKey) : 'servers'

    for (const link of this.querySelectorAll<HTMLAnchorElement>('.mm-admin-nav-link[data-admin-tab]')) {
      if (link.dataset.adminTab === current) {
        link.setAttribute('aria-current', 'page')
      } else {
        link.removeAttribute('aria-current')
      }
    }

    this.dispatchEvent(new CustomEvent('mm-admin-tabs-current-changed', { detail: { tab: current } }))
  }
}

export function defineMmAdminTabs(): void {
  if (!customElements.get('mm-admin-tabs')) {
    customElements.define('mm-admin-tabs', MmAdminTabs)
  }
}
