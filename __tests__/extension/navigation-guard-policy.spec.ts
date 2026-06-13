import { DEFAULT_NAV_GUARD_POLICY, evaluateNavigation, getRegistrableDomain, parseNavGuardPolicy } from '../../shared/navigation-guard'

describe('navigation-guard policy', () => {
  it('should resolve registrable domain for common suffixes', () => {
    expect(getRegistrableDomain('www.example.com')).toBe('example.com')
    expect(getRegistrableDomain('shop.example.co.uk')).toBe('example.co.uk')
  })

  it('should log outbound navigations in log mode without blocking', () => {
    const result = evaluateNavigation('https://news.example.com/a', 'https://ads.evil.net/x', DEFAULT_NAV_GUARD_POLICY)
    expect(result.action).toBe('log')
  })

  it('should block cross-host navigations in same-host mode', () => {
    const policy = { ...DEFAULT_NAV_GUARD_POLICY, mode: 'same-host' as const }
    expect(evaluateNavigation('https://news.example.com/a', 'https://news.example.com/b', policy).action).toBe('allow')
    expect(evaluateNavigation('https://news.example.com/a', 'https://ads.evil.net/x', policy).action).toBe('block')
  })

  it('should allow same registrable domain in same-site mode', () => {
    const policy = { ...DEFAULT_NAV_GUARD_POLICY, mode: 'same-site' as const }
    expect(evaluateNavigation('https://www.example.com/a', 'https://shop.example.com/b', policy).action).toBe('allow')
    expect(evaluateNavigation('https://www.example.com/a', 'https://evil.net/x', policy).action).toBe('block')
  })

  it('should honor custom allow and block patterns', () => {
    const policy = {
      ...DEFAULT_NAV_GUARD_POLICY,
      mode: 'custom' as const,
      allowUrlPatterns: ['https://partner.example.com/*'],
      blockUrlPatterns: ['*://ads.*/*'],
    }
    expect(evaluateNavigation('https://www.example.com/', 'https://partner.example.com/deal', policy).action).toBe('allow')
    expect(evaluateNavigation('https://www.example.com/', 'https://ads.evil.net/pop', policy).action).toBe('block')
  })

  it('should not treat host substring as allow match for unrelated domains', () => {
    const policy = {
      ...DEFAULT_NAV_GUARD_POLICY,
      mode: 'custom' as const,
      allowUrlPatterns: ['github.com'],
      blockUrlPatterns: [],
    }
    expect(evaluateNavigation('https://www.example.com/', 'https://github.com/repo', policy).action).toBe('allow')
    expect(evaluateNavigation('https://www.example.com/', 'https://evil.github.com.attacker.com/x', policy).action).toBe('block')
  })

  it('should default to block in custom mode when block patterns are configured', () => {
    const policy = {
      ...DEFAULT_NAV_GUARD_POLICY,
      mode: 'custom' as const,
      allowUrlPatterns: [],
      blockUrlPatterns: ['https://ads.example.com/*'],
    }
    expect(evaluateNavigation('https://www.example.com/', 'https://safe.example.com/', policy).action).toBe('block')
  })

  it('should parse persisted policy safely', () => {
    expect(parseNavGuardPolicy(undefined)).toEqual(DEFAULT_NAV_GUARD_POLICY)
    expect(parseNavGuardPolicy({ enabled: false, mode: 'same-site', allowUrlPatterns: ['a'], blockUrlPatterns: ['b'] })).toEqual({
      enabled: false,
      mode: 'same-site',
      allowUrlPatterns: ['a'],
      blockUrlPatterns: ['b'],
    })
  })
})
