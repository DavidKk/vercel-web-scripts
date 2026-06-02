import { buildAdminHash, buildAdminPageUrl, parseAdminHash } from '../../extension/src/ui/mm-admin-hash'
import { buildRulesHash, buildRulesPageScriptUrl, parseRulesHash } from '../../extension/src/ui/mm-rules-hash'

describe('admin-hash', () => {
  describe('parseAdminHash', () => {
    it('should default empty hash to servers tab', () => {
      expect(parseAdminHash('')).toEqual({ tab: 'servers', rules: { kind: 'empty' } })
      expect(parseAdminHash('#servers')).toEqual({ tab: 'servers', rules: { kind: 'empty' } })
    })

    it('should parse top-level admin tabs', () => {
      expect(parseAdminHash('#scripts')).toEqual({ tab: 'scripts', rules: { kind: 'empty' } })
      expect(parseAdminHash('#rules')).toEqual({ tab: 'rules', rules: { kind: 'empty' } })
    })

    it('should parse rules sub-routes under rules/ prefix', () => {
      expect(parseAdminHash('#rules/new')).toEqual({ tab: 'rules', rules: { kind: 'new' } })
      expect(parseAdminHash('#rules/rule/id-1')).toEqual({ tab: 'rules', rules: { kind: 'rule', ruleId: 'id-1' } })
      expect(parseAdminHash('#rules/script/key|file.ts')).toEqual({
        tab: 'rules',
        rules: { kind: 'script', scriptValue: 'key|file.ts' },
      })
    })

    it('should accept legacy bare rules hashes on admin.html', () => {
      expect(parseAdminHash('#script/key|file.ts')).toEqual({
        tab: 'rules',
        rules: { kind: 'script', scriptValue: 'key|file.ts' },
      })
      expect(parseAdminHash('#new')).toEqual({ tab: 'rules', rules: { kind: 'new' } })
    })

    it('should fall back to servers for unknown hashes', () => {
      expect(parseAdminHash('#not-a-tab')).toEqual({ tab: 'servers', rules: { kind: 'empty' } })
    })
  })

  describe('buildAdminHash', () => {
    it('should round-trip top-level tabs', () => {
      for (const tab of ['servers', 'scripts', 'rules'] as const) {
        const hash = buildAdminHash({ tab, rules: { kind: 'empty' } })
        expect(parseAdminHash(hash).tab).toBe(tab)
      }
    })

    it('should round-trip rules sub-routes', () => {
      const routes = [{ kind: 'new' as const }, { kind: 'rule' as const, ruleId: 'rule-42' }, { kind: 'script' as const, scriptValue: 'abc|develop.ts' }]
      for (const rules of routes) {
        const hash = buildAdminHash({ tab: 'rules', rules })
        expect(parseAdminHash(hash)).toEqual({ tab: 'rules', rules })
      }
    })
  })

  describe('buildAdminPageUrl', () => {
    it('should build extension-relative admin urls', () => {
      expect(buildAdminPageUrl({ tab: 'scripts' })).toBe('admin.html#scripts')
      expect(buildAdminPageUrl({ tab: 'rules', rules: { kind: 'script', scriptValue: 'k|f.ts' } })).toBe('admin.html#rules/script/k%7Cf.ts')
    })
  })

  describe('rules hash helpers', () => {
    it('should encode script values in buildRulesPageScriptUrl', () => {
      const url = buildRulesPageScriptUrl('abc123', 'path/file.ts')
      expect(url).toBe('admin.html#rules/script/abc123%7Cpath%2Ffile.ts')
      expect(parseAdminHash(`#${url.split('#')[1]}`)).toEqual({
        tab: 'rules',
        rules: { kind: 'script', scriptValue: 'abc123|path/file.ts' },
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
})
