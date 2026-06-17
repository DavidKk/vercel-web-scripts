import { ADMIN_PAGE, adminPagePathFromTabUrl, normalizeExtensionPagePath } from '@ext/shared/admin-page-url'

describe('admin-page-url', () => {
  describe('normalizeExtensionPagePath', () => {
    it('should pass through canonical admin paths unchanged', () => {
      expect(normalizeExtensionPagePath('admin.html#servers')).toBe('admin.html#servers')
      expect(normalizeExtensionPagePath('admin.html#scripts')).toBe('admin.html#scripts')
      expect(normalizeExtensionPagePath('admin.html#rules/new')).toBe('admin.html#rules/new')
    })

    it('should rewrite legacy servers.html to admin servers tab', () => {
      expect(normalizeExtensionPagePath('servers.html')).toBe('admin.html#servers')
      expect(normalizeExtensionPagePath('servers.html#ignored')).toBe('admin.html#servers')
    })

    it('should rewrite legacy scripts.html to admin scripts tab', () => {
      expect(normalizeExtensionPagePath('scripts.html')).toBe('admin.html#scripts')
    })

    it('should rewrite legacy rules.html bare hash to admin rules tab', () => {
      expect(normalizeExtensionPagePath('rules.html')).toBe('admin.html#rules')
    })

    it('should migrate legacy rules.html script deep links', () => {
      expect(normalizeExtensionPagePath('rules.html#script/abc123|develop.ts')).toBe('admin.html#rules/script/abc123|develop.ts')
      expect(normalizeExtensionPagePath('rules.html#new')).toBe('admin.html#rules/new')
      expect(normalizeExtensionPagePath('rules.html#rule/local-1')).toBe('admin.html#rules/rule/local-1')
    })

    it('should keep admin rules prefix when legacy path already includes rules/', () => {
      expect(normalizeExtensionPagePath('rules.html#rules/script/foo')).toBe('admin.html#rules/script/foo')
    })

    it('should leave non-admin extension pages unchanged', () => {
      expect(normalizeExtensionPagePath('popup.html')).toBe('popup.html')
    })

    it('should expose a single admin page constant', () => {
      expect(ADMIN_PAGE).toBe('admin.html')
    })
  })

  describe('adminPagePathFromTabUrl', () => {
    const extBase = 'chrome-extension://test-id/'

    it('should default to servers when url is missing', () => {
      expect(adminPagePathFromTabUrl(undefined)).toBe('admin.html#servers')
    })

    it('should preserve admin hash routes', () => {
      expect(adminPagePathFromTabUrl(`${extBase}admin.html#rules/rule/abc`)).toBe('admin.html#rules/rule/abc')
      expect(adminPagePathFromTabUrl(`${extBase}admin.html#scripts`)).toBe('admin.html#scripts')
    })

    it('should migrate legacy rules.html hashes', () => {
      expect(adminPagePathFromTabUrl(`${extBase}rules.html#rule/abc`)).toBe('admin.html#rules/rule/abc')
    })

    it('should migrate legacy servers.html to servers tab', () => {
      expect(adminPagePathFromTabUrl(`${extBase}servers.html`)).toBe('admin.html#servers')
    })
  })
})
