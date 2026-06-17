import { buildAdminHash, buildAdminPageUrl, parseAdminHash } from '@ext/ui/admin/mm-admin-hash'
import { buildRulesHash, buildRulesPageScriptUrl, parseRulesHash } from '@ext/ui/rules/mm-rules-hash'
import { buildScriptsHash, buildScriptsPageScriptUrl, parseScriptsHashSegment } from '@ext/ui/scripts/mm-scripts-hash'

const EMPTY_SCRIPTS = { kind: 'empty' as const }
const EMPTY_RULES = { kind: 'empty' as const }

describe('admin-hash', () => {
  describe('parseAdminHash', () => {
    it('should default empty hash to servers tab', () => {
      expect(parseAdminHash('')).toEqual({ tab: 'servers', rules: EMPTY_RULES, scripts: EMPTY_SCRIPTS })
      expect(parseAdminHash('#servers')).toEqual({ tab: 'servers', rules: EMPTY_RULES, scripts: EMPTY_SCRIPTS })
    })

    it('should parse top-level admin tabs', () => {
      expect(parseAdminHash('#scripts')).toEqual({ tab: 'scripts', rules: EMPTY_RULES, scripts: EMPTY_SCRIPTS })
      expect(parseAdminHash('#permissions')).toEqual({ tab: 'permissions', rules: EMPTY_RULES, scripts: EMPTY_SCRIPTS })
      expect(parseAdminHash('#rules')).toEqual({ tab: 'rules', rules: EMPTY_RULES, scripts: EMPTY_SCRIPTS })
      expect(parseAdminHash('#logs')).toEqual({ tab: 'logs', rules: EMPTY_RULES, scripts: EMPTY_SCRIPTS })
    })

    it('should map legacy scripts/logs hash to logs tab', () => {
      expect(parseAdminHash('#scripts/logs')).toEqual({ tab: 'logs', rules: EMPTY_RULES, scripts: EMPTY_SCRIPTS })
    })

    it('should parse scripts sub-routes under scripts/ prefix', () => {
      expect(parseAdminHash('#scripts/script/key|file.ts')).toEqual({
        tab: 'scripts',
        rules: EMPTY_RULES,
        scripts: { kind: 'script', scriptKey: 'key', file: 'file.ts' },
      })
    })

    it('should parse rules sub-routes under rules/ prefix', () => {
      expect(parseAdminHash('#rules/new')).toEqual({ tab: 'rules', rules: { kind: 'new' }, scripts: EMPTY_SCRIPTS })
      expect(parseAdminHash('#rules/rule/id-1')).toEqual({ tab: 'rules', rules: { kind: 'rule', ruleId: 'id-1' }, scripts: EMPTY_SCRIPTS })
      expect(parseAdminHash('#rules/script/key|file.ts')).toEqual({
        tab: 'rules',
        rules: { kind: 'script', scriptValue: 'key|file.ts' },
        scripts: EMPTY_SCRIPTS,
      })
    })

    it('should accept legacy bare rules hashes on admin.html', () => {
      expect(parseAdminHash('#script/key|file.ts')).toEqual({
        tab: 'rules',
        rules: { kind: 'script', scriptValue: 'key|file.ts' },
        scripts: EMPTY_SCRIPTS,
      })
      expect(parseAdminHash('#new')).toEqual({ tab: 'rules', rules: { kind: 'new' }, scripts: EMPTY_SCRIPTS })
    })

    it('should fall back to servers for unknown hashes', () => {
      expect(parseAdminHash('#not-a-tab')).toEqual({ tab: 'servers', rules: EMPTY_RULES, scripts: EMPTY_SCRIPTS })
    })
  })

  describe('buildAdminHash', () => {
    it('should round-trip top-level tabs', () => {
      for (const tab of ['servers', 'scripts', 'permissions', 'rules', 'logs'] as const) {
        const hash = buildAdminHash({ tab, rules: EMPTY_RULES, scripts: EMPTY_SCRIPTS })
        expect(parseAdminHash(hash).tab).toBe(tab)
      }
    })

    it('should build logs tab hash', () => {
      expect(buildAdminHash({ tab: 'logs' })).toBe('#logs')
    })

    it('should round-trip rules sub-routes', () => {
      const routes = [{ kind: 'new' as const }, { kind: 'rule' as const, ruleId: 'rule-42' }, { kind: 'script' as const, scriptValue: 'abc|develop.ts' }]
      for (const rules of routes) {
        const hash = buildAdminHash({ tab: 'rules', rules })
        expect(parseAdminHash(hash)).toEqual({ tab: 'rules', rules, scripts: EMPTY_SCRIPTS })
      }
    })

    it('should round-trip scripts sub-routes', () => {
      const scripts = { kind: 'script' as const, scriptKey: 'abc', file: 'develop.ts' }
      const hash = buildAdminHash({ tab: 'scripts', scripts })
      expect(parseAdminHash(hash)).toEqual({ tab: 'scripts', rules: EMPTY_RULES, scripts })
    })
  })

  describe('buildAdminPageUrl', () => {
    it('should build extension-relative admin urls', () => {
      expect(buildAdminPageUrl({ tab: 'scripts' })).toBe('admin.html#scripts')
      expect(buildAdminPageUrl({ tab: 'logs' })).toBe('admin.html#logs')
      expect(buildAdminPageUrl({ tab: 'rules', rules: { kind: 'script', scriptValue: 'k|f.ts' } })).toBe('admin.html#rules/script/k%7Cf.ts')
      expect(buildAdminPageUrl({ tab: 'scripts', scripts: { kind: 'script', scriptKey: 'k', file: 'f.ts' } })).toBe('admin.html#scripts/script/k%7Cf.ts')
    })
  })

  describe('rules hash helpers', () => {
    it('should encode script values in buildRulesPageScriptUrl', () => {
      const url = buildRulesPageScriptUrl('abc123', 'path/file.ts')
      expect(url).toBe('admin.html#rules/script/abc123%7Cpath%2Ffile.ts')
      expect(parseAdminHash(`#${url.split('#')[1]}`)).toEqual({
        tab: 'rules',
        rules: { kind: 'script', scriptValue: 'abc123|path/file.ts' },
        scripts: EMPTY_SCRIPTS,
      })
    })

    it('should round-trip parseRulesHash and buildRulesHash', () => {
      const samples = [
        { input: 'new', route: { kind: 'new' as const } },
        { input: 'rule/id', route: { kind: 'rule' as const, ruleId: 'id' } },
        { input: 'script/a|b.ts', route: { kind: 'script' as const, scriptValue: 'a|b.ts' } },
      ]
      for (const sample of samples) {
        expect(parseRulesHash(`#${sample.input}`)).toEqual(sample.route)
        expect(buildRulesHash(sample.route)).toBe(sample.input === 'script/a|b.ts' ? 'script/a%7Cb.ts' : sample.input)
        expect(parseRulesHash(`#${buildRulesHash(sample.route)}`)).toEqual(sample.route)
      }
    })
  })

  describe('scripts hash helpers', () => {
    it('should encode script values in buildScriptsPageScriptUrl', () => {
      const url = buildScriptsPageScriptUrl('abc123', 'shopline-debug.ts')
      expect(url).toBe('admin.html#scripts/script/abc123%7Cshopline-debug.ts')
      expect(parseAdminHash(`#${url.split('#')[1]}`)).toEqual({
        tab: 'scripts',
        rules: EMPTY_RULES,
        scripts: { kind: 'script', scriptKey: 'abc123', file: 'shopline-debug.ts' },
      })
    })

    it('should round-trip parseScriptsHashSegment and buildScriptsHash', () => {
      const route = { kind: 'script' as const, scriptKey: 'k', file: 'demo.ts' }
      expect(parseScriptsHashSegment(buildScriptsHash(route))).toEqual(route)
    })
  })
})
