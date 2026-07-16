import { VWS_WEBMCP_PAGE_TOOL_HINTS_KEY } from '@shared/webmcp/constants'
import { getOrCreateVwsWebMcpPageToolHints, rememberVwsWebMcpPageToolHint } from '@shared/webmcp/page-tool-hints'

describe('webmcp page-tool-hints', () => {
  afterEach(() => {
    const host = globalThis as unknown as Record<string, unknown>
    delete host[VWS_WEBMCP_PAGE_TOOL_HINTS_KEY]
  })

  it('should remember and clear readOnlyHint on abort', () => {
    const controller = new AbortController()
    rememberVwsWebMcpPageToolHint('editor_list_open_tabs', true, controller.signal)

    const hints = getOrCreateVwsWebMcpPageToolHints()
    expect(hints.get('editor_list_open_tabs')).toEqual({ readOnlyHint: true })

    controller.abort()
    expect(hints.has('editor_list_open_tabs')).toBe(false)
  })
})
