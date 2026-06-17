import { ADMIN_PAGE } from '../../shared/admin-page-url'
import { buildRulesHash, parseRulesHash, type RulesHashRoute } from '../rules/mm-rules-hash'
import { buildScriptsHash, parseScriptsHashSegment, type ScriptsHashRoute } from '../scripts/mm-scripts-hash'

export { ADMIN_PAGE }

export type AdminTab = 'servers' | 'scripts' | 'permissions' | 'rules' | 'logs'

const EMPTY_SCRIPTS_ROUTE: ScriptsHashRoute = { kind: 'empty' }
const EMPTY_RULES_ROUTE: RulesHashRoute = { kind: 'empty' }

export type AdminRoute = {
  tab: AdminTab
  rules: RulesHashRoute
  scripts: ScriptsHashRoute
}

/** Parse `admin.html` location hash into tab + optional sub-routes. */
export function parseAdminHash(hash: string): AdminRoute {
  const raw = (hash.startsWith('#') ? hash.slice(1) : hash).trim()
  if (!raw || raw === 'servers') {
    return { tab: 'servers', rules: EMPTY_RULES_ROUTE, scripts: EMPTY_SCRIPTS_ROUTE }
  }
  if (raw === 'scripts/logs') {
    return { tab: 'logs', rules: EMPTY_RULES_ROUTE, scripts: EMPTY_SCRIPTS_ROUTE }
  }
  if (raw === 'scripts') {
    return { tab: 'scripts', rules: EMPTY_RULES_ROUTE, scripts: EMPTY_SCRIPTS_ROUTE }
  }
  if (raw.startsWith('scripts/')) {
    return {
      tab: 'scripts',
      rules: EMPTY_RULES_ROUTE,
      scripts: parseScriptsHashSegment(raw.slice('scripts/'.length)),
    }
  }
  if (raw === 'permissions') {
    return { tab: 'permissions', rules: EMPTY_RULES_ROUTE, scripts: EMPTY_SCRIPTS_ROUTE }
  }
  if (raw === 'logs') {
    return { tab: 'logs', rules: EMPTY_RULES_ROUTE, scripts: EMPTY_SCRIPTS_ROUTE }
  }
  if (raw === 'rules') {
    return { tab: 'rules', rules: EMPTY_RULES_ROUTE, scripts: EMPTY_SCRIPTS_ROUTE }
  }
  if (raw.startsWith('rules/')) {
    return { tab: 'rules', rules: parseRulesHash(`#${raw.slice('rules/'.length)}`), scripts: EMPTY_SCRIPTS_ROUTE }
  }
  if (raw === 'new' || raw.startsWith('rule/') || raw.startsWith('script/')) {
    return { tab: 'rules', rules: parseRulesHash(`#${raw}`), scripts: EMPTY_SCRIPTS_ROUTE }
  }
  return { tab: 'servers', rules: EMPTY_RULES_ROUTE, scripts: EMPTY_SCRIPTS_ROUTE }
}

/** Serialize admin tab route (with optional rules / scripts sub-path). */
export function buildAdminHash(route: { tab: AdminTab; rules?: RulesHashRoute; scripts?: ScriptsHashRoute }): string {
  if (route.tab === 'servers') {
    return '#servers'
  }
  if (route.tab === 'scripts') {
    const scriptsHash = route.scripts ? buildScriptsHash(route.scripts) : ''
    return scriptsHash ? `#scripts/${scriptsHash}` : '#scripts'
  }
  if (route.tab === 'permissions') {
    return '#permissions'
  }
  if (route.tab === 'logs') {
    return '#logs'
  }
  const rulesHash = route.rules ? buildRulesHash(route.rules) : ''
  return rulesHash ? `#rules/${rulesHash}` : '#rules'
}

/** Extension-relative admin page URL with hash route. */
export function buildAdminPageUrl(route: { tab: AdminTab; rules?: RulesHashRoute; scripts?: ScriptsHashRoute }): string {
  return `${ADMIN_PAGE}${buildAdminHash(route)}`
}

export function adminTabTitle(tab: AdminTab): string {
  switch (tab) {
    case 'servers':
      return 'Servers'
    case 'scripts':
      return 'Scripts'
    case 'permissions':
      return 'Permissions'
    case 'rules':
      return 'Rules'
    case 'logs':
      return 'Logs'
  }
}
