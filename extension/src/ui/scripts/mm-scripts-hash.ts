import { buildAdminPageUrl } from '../admin/mm-admin-hash'
import { buildRulesHash, parseRulesHash } from '../rules/mm-rules-hash'

export type ScriptsHashRoute = { kind: 'empty' } | { kind: 'script'; scriptKey: string; file: string }

/** Parse scripts sub-route hash segment (without `#scripts/` prefix). */
export function parseScriptsHashSegment(segment: string): ScriptsHashRoute {
  const route = parseRulesHash(`#${segment}`)
  if (route.kind !== 'script') {
    return { kind: 'empty' }
  }
  const pipe = route.scriptValue.indexOf('|')
  if (pipe <= 0) {
    return { kind: 'empty' }
  }
  const scriptKey = route.scriptValue.slice(0, pipe)
  const file = route.scriptValue.slice(pipe + 1)
  if (!scriptKey || !file) {
    return { kind: 'empty' }
  }
  return { kind: 'script', scriptKey, file }
}

/** Serialize a scripts sub-route (without `#scripts/` prefix). */
export function buildScriptsHash(route: ScriptsHashRoute): string {
  if (route.kind === 'empty') {
    return ''
  }
  return buildRulesHash({ kind: 'script', scriptValue: `${route.scriptKey}|${route.file}` })
}

/** Extension page path for scripts list focused on one script file. */
export function buildScriptsPageScriptUrl(scriptKey: string, file: string): string {
  return buildAdminPageUrl({ tab: 'scripts', scripts: { kind: 'script', scriptKey, file } })
}
