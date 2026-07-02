import { handleCaptureVisibleTab } from '@ext/shell/background-bridge'
import { ensureScriptPermissionForTab } from '@ext/shell/permission-manager'
import { PERMISSION_DENIED_CODE } from '@shared/script-permission'

jest.mock('@ext/shell/permission-manager', () => ({
  ensureScriptPermissionForTab: jest.fn(),
}))

const mockedEnsure = ensureScriptPermissionForTab as jest.MockedFunction<typeof ensureScriptPermissionForTab>

describe('handleCaptureVisibleTab', () => {
  const permissionRequest = {
    scriptKey: 'key-a',
    file: 'quick-page-screenshot.ts',
    capability: 'capture-screenshot' as const,
    resource: 'www.example.com',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockedEnsure.mockResolvedValue(true)
    ;(globalThis as unknown as { chrome?: { tabs: { captureVisibleTab: jest.Mock } } }).chrome = {
      tabs: {
        captureVisibleTab: jest.fn().mockResolvedValue('data:image/png;base64,abc'),
      },
    }
  })

  it('captures visible tab when permission is allowed', async () => {
    const result = await handleCaptureVisibleTab({ type: 'CAPTURE_VISIBLE_TAB', options: { format: 'png' }, permission: permissionRequest }, 1, 2, 'https://www.example.com/page')

    expect(result).toEqual({ ok: true, dataUrl: 'data:image/png;base64,abc' })
    expect(mockedEnsure).toHaveBeenCalledWith(1, permissionRequest)
    expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledWith(2, { format: 'png', quality: undefined })
  })

  it('rejects when permission resource does not match tab URL', async () => {
    await expect(
      handleCaptureVisibleTab({ type: 'CAPTURE_VISIBLE_TAB', options: {}, permission: { ...permissionRequest, resource: 'other.com' } }, 1, 2, 'https://www.example.com/page')
    ).rejects.toThrow(PERMISSION_DENIED_CODE)
  })

  it('rejects when permission is denied', async () => {
    mockedEnsure.mockResolvedValue(false)

    await expect(handleCaptureVisibleTab({ type: 'CAPTURE_VISIBLE_TAB', options: {}, permission: permissionRequest }, 1, 2, 'https://www.example.com/page')).rejects.toThrow(
      PERMISSION_DENIED_CODE
    )
  })
})
