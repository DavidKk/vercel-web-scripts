import { isCloudflareChallengeRtTkUrl, isShellEnabledForTabState } from '@ext/shared/extension-storage/shell-master-switch-pure'

describe('shell master switch pure', () => {
  it('should treat missing global enable as off for all tabs', () => {
    expect(isShellEnabledForTabState(false, [], 1)).toBe(false)
    expect(isShellEnabledForTabState(false, [2], 1)).toBe(false)
  })

  it('should allow tabs when global is on and tab is not disabled', () => {
    expect(isShellEnabledForTabState(true, [], 42)).toBe(true)
    expect(isShellEnabledForTabState(true, [7, 8], 42)).toBe(true)
  })

  it('should block disabled tabs even when global is on', () => {
    expect(isShellEnabledForTabState(true, [42], 42)).toBe(false)
  })

  it('should detect cloudflare challenge urls with __cf_chl_rt_tk', () => {
    expect(isCloudflareChallengeRtTkUrl('https://example.com/?__cf_chl_rt_tk=abc')).toBe(true)
    expect(isCloudflareChallengeRtTkUrl('https://example.com/path?foo=1&__cf_chl_rt_tk=xyz#hash')).toBe(true)
    expect(isCloudflareChallengeRtTkUrl('https://example.com/?__cf_chl_rt_tk')).toBe(true)
  })

  it('should ignore urls without __cf_chl_rt_tk', () => {
    expect(isCloudflareChallengeRtTkUrl('https://example.com/')).toBe(false)
    expect(isCloudflareChallengeRtTkUrl('https://example.com/?foo=__cf_chl_rt_tk')).toBe(false)
    expect(isCloudflareChallengeRtTkUrl('https://example.com/?__cf_chl_tk=tok')).toBe(false)
    expect(isCloudflareChallengeRtTkUrl('')).toBe(false)
  })
})
