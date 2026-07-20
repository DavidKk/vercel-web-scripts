import { shouldRegisterPageTools } from '@ext/shell/webmcp/page-tools/page-tools-gate'

describe('shouldRegisterPageTools', () => {
  const ok = {
    shellEnabled: true,
    isHttpUrl: true,
    userScriptsAvailable: true,
  }

  it('should allow when shell, http(s), and User Scripts are ready', () => {
    expect(shouldRegisterPageTools(ok)).toBe(true)
  })

  it('should allow even when no MagickMonkey script matches the URL', () => {
    expect(shouldRegisterPageTools(ok)).toBe(true)
  })

  it('should deny when shell is off', () => {
    expect(shouldRegisterPageTools({ ...ok, shellEnabled: false })).toBe(false)
  })

  it('should deny when URL is not http(s)', () => {
    expect(shouldRegisterPageTools({ ...ok, isHttpUrl: false })).toBe(false)
  })

  it('should deny when User Scripts API is unavailable', () => {
    expect(shouldRegisterPageTools({ ...ok, userScriptsAvailable: false })).toBe(false)
  })
})
