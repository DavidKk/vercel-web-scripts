import { buildExecuteToolCode, buildListToolsProbeCode } from '@ext/shell/webmcp/webmcp-inject-scripts'

describe('webmcp-inject-scripts', () => {
  it('buildListToolsProbeCode includes registry and testing API probes', () => {
    const code = buildListToolsProbeCode()
    expect(code).toContain('modelContextTesting')
    expect(code).toContain('__VWS_WEBMCP_TOOL_REGISTRY__')
    expect(code).toContain('__VWS_WEBMCP_PAGE_TOOL_HINTS__')
    expect(code).toContain('pageHintEntries')
    expect(code).toContain('listTools')
  })

  it('buildExecuteToolCode embeds JSON-safe name and args', () => {
    const code = buildExecuteToolCode('vws.demo.toggle', { visible: false })
    expect(code).toContain('"vws.demo.toggle"')
    expect(code).toContain('"visible":false')
    expect(code).toContain('executeTool')
  })

  it('buildExecuteToolCode escapes quotes in tool names', () => {
    const code = buildExecuteToolCode('vws.demo."unsafe"', {})
    expect(code).not.toContain('"vws.demo."unsafe""')
    expect(code).toContain('\\"unsafe\\"')
  })
})
