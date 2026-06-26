import { matchUrlPattern } from './url-pattern-match'

/** Per-script module entry from module-manifest `scriptModules`. */
export interface RuntimeScriptModuleCatalogEntry {
  file: string
  match: string[]
  track: 'stable' | 'alpha'
  url: string
  hash: { algorithm: 'sha1'; value: string }
  dependsOn?: string[]
}

/** RULE row used for matchRule-style URL matching. */
export interface ScriptModuleRuleEntry {
  script?: string
  wildcard?: string
}

/**
 * Whether a script file matches the page URL via @match headers and/or RULE wildcards.
 * @param file Gist script filename
 * @param headerMatch Userscript @match values
 * @param rules RULE cache rows
 * @param pageUrl Full page URL
 */
export function scriptModuleMatchesUrl(file: string, headerMatch: string[], rules: ScriptModuleRuleEntry[], pageUrl: string): boolean {
  if (headerMatch.some((pattern) => pattern && matchUrlPattern(pattern, pageUrl))) {
    return true
  }
  return rules.some((rule) => rule.script === file && rule.wildcard && matchUrlPattern(rule.wildcard, pageUrl))
}

/**
 * Filter catalog entries that would run on the given page URL.
 * @param modules Manifest script module catalog
 * @param pageUrl Page URL
 * @param rules RULE rows (same semantics as tab-match API)
 */
export function filterScriptModulesByUrl(modules: RuntimeScriptModuleCatalogEntry[], pageUrl: string, rules: ScriptModuleRuleEntry[]): RuntimeScriptModuleCatalogEntry[] {
  return modules.filter((module) => scriptModuleMatchesUrl(module.file, module.match ?? [], rules, pageUrl))
}

/**
 * Topological sort with dependency closure: dependencies not in `matched` are auto-included (MVP).
 * @param matched Modules selected for the current URL
 * @param catalog Full catalog for dependency lookup
 */
export function topoSortScriptModulesWithDeps(matched: RuntimeScriptModuleCatalogEntry[], catalog: RuntimeScriptModuleCatalogEntry[]): RuntimeScriptModuleCatalogEntry[] {
  const byFile = new Map(catalog.map((entry) => [entry.file, entry]))
  const selected = new Map<string, RuntimeScriptModuleCatalogEntry>()
  for (const entry of matched) {
    selected.set(entry.file, entry)
  }

  const visit = (file: string, stack: Set<string>): void => {
    if (selected.has(file)) {
      return
    }
    const entry = byFile.get(file)
    if (!entry) {
      return
    }
    if (stack.has(file)) {
      throw new Error(`Circular script module dependency: ${file}`)
    }
    stack.add(file)
    for (const dep of entry.dependsOn ?? []) {
      visit(dep, stack)
    }
    stack.delete(file)
    selected.set(file, entry)
  }

  for (const entry of matched) {
    for (const dep of entry.dependsOn ?? []) {
      visit(dep, new Set())
    }
  }

  const ordered: RuntimeScriptModuleCatalogEntry[] = []
  const placed = new Set<string>()
  const place = (file: string, stack: Set<string>): void => {
    if (placed.has(file)) {
      return
    }
    const entry = selected.get(file)
    if (!entry) {
      return
    }
    if (stack.has(file)) {
      throw new Error(`Circular script module dependency: ${file}`)
    }
    stack.add(file)
    for (const dep of entry.dependsOn ?? []) {
      place(dep, stack)
    }
    stack.delete(file)
    if (!placed.has(file)) {
      placed.add(file)
      ordered.push(entry)
    }
  }

  for (const file of selected.keys()) {
    place(file, new Set())
  }
  return ordered
}
