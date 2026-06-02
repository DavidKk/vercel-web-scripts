import { ADMIN_PAGE } from '../shared/admin-page-url'
import { buildRulesHash, parseRulesHash, type RulesHashRoute } from './mm-rules-hash'

export { ADMIN_PAGE }

export type AdminTab = 'servers' | 'scripts' | 'rules'

export type AdminRoute = {
  tab: AdminTab
  rules: RulesHashRoute
}

/** Parse `admin.html` location hash into tab + optional rules sub-route. */
export function parseAdminHash(hash: string): AdminRoute {
  const raw = (hash.startsWith('#') ? hash.slice(1) : hash).trim()
  if (!raw || raw === 'servers') {
    return { tab: 'servers', rules: { kind: 'empty' } }
  }
  if (raw === 'scripts') {
    return { tab: 'scripts', rules: { kind: 'empty' } }
  }
  if (raw === 'rules') {
    return { tab: 'rules', rules: { kind: 'empty' } }
  }
  if (raw.startsWith('rules/')) {
    return { tab: 'rules', rules: parseRulesHash(`#${raw.slice('rules/'.length)}`) }
  }
  if (raw === 'new' || raw.startsWith('rule/') || raw.startsWith('script/')) {
    return { tab: 'rules', rules: parseRulesHash(`#${raw}`) }
  }
  return { tab: 'servers', rules: { kind: 'empty' } }
}

/** Serialize admin tab route (with optional rules sub-path). */
export function buildAdminHash(route: { tab: AdminTab; rules?: RulesHashRoute }): string {
  if (route.tab === 'servers') {
    return '#servers'
  }
  if (route.tab === 'scripts') {
    return '#scripts'
  }
  const rulesHash = route.rules ? buildRulesHash(route.rules) : ''
  return rulesHash ? `#rules/${rulesHash}` : '#rules'
}

/** Extension-relative admin page URL with hash route. */
export function buildAdminPageUrl(route: { tab: AdminTab; rules?: RulesHashRoute }): string {
  return `${ADMIN_PAGE}${buildAdminHash(route)}`
}

export function adminTabTitle(tab: AdminTab): string {
  switch (tab) {
    case 'servers':
      return 'Servers'
    case 'scripts':
      return 'Scripts'
    case 'rules':
      return 'Rules'
  }
}
