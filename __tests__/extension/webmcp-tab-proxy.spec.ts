import * as cspExecutor from '@ext/shell/csp-user-script-executor'
import * as pageToolsEnsure from '@ext/shell/webmcp/page-tools-ensure'
import { webMcpExecuteTool, webMcpGetSupport, webMcpListTools } from '@ext/shell/webmcp/webmcp-tab-proxy'

jest.mock('@ext/shell/csp-user-script-executor', () => ({
  isUserScriptsApiAvailable: jest.fn(),
  executeRawMainWorldCodeForTab: jest.fn(),
}))

jest.mock('@ext/shell/webmcp/page-tools-ensure', () => ({
  ensurePageToolsForTab: jest.fn(),
  isVwsPageToolName: (name: string) => name.startsWith('vws.page.'),
}))

const isUserScriptsApiAvailable = cspExecutor.isUserScriptsApiAvailable as jest.Mock
const executeRawMainWorldCodeForTab = cspExecutor.executeRawMainWorldCodeForTab as jest.Mock
const ensurePageToolsForTab = pageToolsEnsure.ensurePageToolsForTab as jest.Mock

function installChromeTabsMock(tab: Partial<chrome.tabs.Tab>): void {
  ;(globalThis as { chrome?: unknown }).chrome = {
    tabs: {
      get: jest.fn().mockResolvedValue(tab),
    },
  }
}

describe('webmcp-tab-proxy', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    isUserScriptsApiAvailable.mockReturnValue(true)
    ensurePageToolsForTab.mockResolvedValue({ attempted: false, ok: true, skippedReason: 'no_matching_scripts' })
  })

  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome
  })

  it('webMcpListTools rejects non-http tabs', async () => {
    installChromeTabsMock({ id: 9, url: 'chrome://extensions' })
    const result = await webMcpListTools(9)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('non_http_tab')
    expect(executeRawMainWorldCodeForTab).not.toHaveBeenCalled()
  })

  it('webMcpListTools merges registry provider metadata', async () => {
    installChromeTabsMock({ id: 3, url: 'https://example.com' })
    executeRawMainWorldCodeForTab.mockResolvedValue({
      ok: true,
      value: {
        ok: true,
        reason: 'supported',
        tools: [{ name: 'vws.demo.toggle', description: 'Toggle', annotations: { readOnlyHint: false } }],
        registryEntries: [
          {
            name: 'vws.demo.toggle',
            providerId: 'magickmonkey',
            scriptKey: 'demo',
            scriptFile: 'demo.ts',
            localName: 'toggle',
          },
        ],
        details: { isSecure: true, hasTesting: true, hasListTools: true, hasExecuteTool: true },
      },
    })

    const result = await webMcpListTools(3)
    expect(ensurePageToolsForTab).toHaveBeenCalledWith(3, 'https://example.com')
    expect(result.ok).toBe(true)
    expect(result.data?.tools[0]).toMatchObject({
      name: 'vws.demo.toggle',
      provider: 'magickmonkey',
      scriptKey: 'demo',
    })
    expect(result.data?.filteredCount).toBe(1)
  })

  it('should restore readOnlyHint from pageHintEntries when Chromium omits annotations', async () => {
    installChromeTabsMock({ id: 7, url: 'https://example.com/editor' })
    executeRawMainWorldCodeForTab.mockResolvedValue({
      ok: true,
      value: {
        ok: true,
        reason: 'supported',
        tools: [{ name: 'editor_list_open_tabs', description: 'List tabs' }],
        registryEntries: [],
        pageHintEntries: [{ name: 'editor_list_open_tabs', readOnlyHint: true }],
        details: { isSecure: true, hasTesting: true, hasListTools: true, hasExecuteTool: true },
      },
    })

    const result = await webMcpListTools(7)
    expect(result.ok).toBe(true)
    expect(result.data?.tools[0]).toMatchObject({
      name: 'editor_list_open_tabs',
      provider: 'native',
      readOnlyHint: true,
    })
  })

  it('webMcpExecuteTool maps execute failures', async () => {
    installChromeTabsMock({ id: 4, url: 'https://example.com/page' })
    executeRawMainWorldCodeForTab.mockResolvedValue({
      ok: true,
      value: {
        ok: false,
        reason: 'tool_execute_failed',
        message: 'boom',
      },
    })

    const result = await webMcpExecuteTool(4, 'vws.demo.toggle', { visible: true })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('tool_execute_failed')
    expect(result.message).toBe('boom')
  })

  it('webMcpExecuteTool fails when builtin page tools ensure fails', async () => {
    installChromeTabsMock({ id: 8, url: 'https://example.com/page' })
    ensurePageToolsForTab.mockResolvedValue({
      attempted: true,
      ok: false,
      message: 'Failed to load page-tools-main.js (404)',
    })

    const result = await webMcpExecuteTool(8, 'vws.page.snapshot', {})
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('tool_not_found')
    expect(result.message).toMatch(/page-tools-main/)
    expect(executeRawMainWorldCodeForTab).not.toHaveBeenCalled()
  })

  it('webMcpGetSupport reports api_missing when probe is unsupported', async () => {
    installChromeTabsMock({ id: 5, url: 'https://example.com' })
    executeRawMainWorldCodeForTab.mockResolvedValue({
      ok: true,
      value: {
        ok: false,
        reason: 'api_missing',
        details: { isSecure: true, hasTesting: false, hasListTools: false, hasExecuteTool: false },
        registryEntries: [],
      },
    })

    const result = await webMcpGetSupport(5)
    expect(result.ok).toBe(true)
    expect(result.data?.supported).toBe(false)
    expect(result.data?.reason).toBe('api_missing')
  })
})
