export type RulesHashRoute = { kind: 'empty' } | { kind: 'new' } | { kind: 'rule'; ruleId: string } | { kind: 'script'; scriptValue: string }

/** Parse `rules.html` location hash into a client route. */
export function parseRulesHash(hash: string): RulesHashRoute {
  const raw = (hash.startsWith('#') ? hash.slice(1) : hash).trim()
  if (!raw) {
    return { kind: 'empty' }
  }
  if (raw === 'new') {
    return { kind: 'new' }
  }
  if (raw.startsWith('rule/')) {
    const ruleId = decodeURIComponent(raw.slice('rule/'.length))
    return ruleId ? { kind: 'rule', ruleId } : { kind: 'empty' }
  }
  if (raw.startsWith('script/')) {
    const scriptValue = decodeURIComponent(raw.slice('script/'.length))
    return scriptValue ? { kind: 'script', scriptValue } : { kind: 'empty' }
  }
  return { kind: 'empty' }
}

/** Serialize a rules page route (without leading `#`). */
export function buildRulesHash(route: RulesHashRoute): string {
  switch (route.kind) {
    case 'empty':
      return ''
    case 'new':
      return 'new'
    case 'rule':
      return `rule/${encodeURIComponent(route.ruleId)}`
    case 'script':
      return `script/${encodeURIComponent(route.scriptValue)}`
  }
}

/** Extension page path for rules editor pre-selected to one script file. */
export function buildRulesPageScriptUrl(scriptKey: string, file: string): string {
  return `rules.html#${buildRulesHash({ kind: 'script', scriptValue: `${scriptKey}|${file}` })}`
}
