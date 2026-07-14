import type { AgentPrefs } from '@ext/shell/webmcp/agent-types'
import type { WebMcpListedTool } from '@ext/shell/webmcp/webmcp-types'
import { buildAgentSystemPrompt, filterToolsForAgent, fromLlmToolName, shouldConfirmTool, toAgentLlmTools, toLlmToolName } from '@ext/ui/sidepanel/agent-tools'

describe('agent-tools', () => {
  it('round-trips canonical tool names for LLM', () => {
    const canonical = 'vws.demo.toggle_danmaku'
    const llmName = toLlmToolName(canonical)
    expect(llmName).toBe('vws__demo__toggle_danmaku')
    expect(fromLlmToolName(llmName, [{ name: canonical, provider: 'magickmonkey' }])).toBe(canonical)
  })

  it('buildAgentSystemPrompt includes host preferences and tool guidance', () => {
    const prompt = buildAgentSystemPrompt('https://www.bilibili.com/video/1', { blockDanmaku: true }, ['editor_add_rule', 'vws.demo.foo'])
    expect(prompt).toContain('bilibili.com')
    expect(prompt).toContain('blockDanmaku')
    expect(prompt).toContain('editor_add_rule')
    expect(prompt).toContain('Do NOT call list_tools')
  })

  it('buildAgentSystemPrompt warns when no tools are available', () => {
    const prompt = buildAgentSystemPrompt('https://example.com/', undefined, [])
    expect(prompt).toContain('No WebMCP tools are available')
    expect(prompt).toContain('list_tools')
  })

  it('toAgentLlmTools maps schema', () => {
    const tools = toAgentLlmTools([
      {
        name: 'vws.demo.foo',
        description: 'Foo',
        provider: 'magickmonkey',
        inputSchema: { type: 'object', properties: { on: { type: 'boolean' } } },
      },
    ])
    expect(tools[0]?.name).toBe('vws__demo__foo')
    expect(tools[0]?.parameters).toEqual({ type: 'object', properties: { on: { type: 'boolean' } } })
  })

  it('filterToolsForAgent falls back to native tools when MagickMonkey tools are absent', () => {
    const tools: WebMcpListedTool[] = [
      { name: 'editor_add_rule', provider: 'native', description: 'Add rule' },
      { name: 'vws.ghost.tool', provider: 'unknown' },
    ]
    const prefs: AgentPrefs = { global: { toolProviderScope: 'magickmonkey_only' } }
    expect(filterToolsForAgent(tools, prefs).map((tool) => tool.name)).toEqual(['editor_add_rule'])
  })

  it('filterToolsForAgent keeps MagickMonkey-only when MagickMonkey tools exist', () => {
    const tools: WebMcpListedTool[] = [
      { name: 'editor_add_rule', provider: 'native' },
      { name: 'vws.demo.foo', provider: 'magickmonkey' },
    ]
    const prefs: AgentPrefs = { global: { toolProviderScope: 'magickmonkey_only' } }
    expect(filterToolsForAgent(tools, prefs).map((tool) => tool.name)).toEqual(['vws.demo.foo'])
  })

  it('filterToolsForAgent includes all usable tools when scope is all', () => {
    const tools: WebMcpListedTool[] = [
      { name: 'editor_add_rule', provider: 'native' },
      { name: 'vws.demo.foo', provider: 'magickmonkey' },
      { name: 'vws.ghost.tool', provider: 'unknown' },
    ]
    const prefs: AgentPrefs = { global: { toolProviderScope: 'all' } }
    expect(filterToolsForAgent(tools, prefs).map((tool) => tool.name)).toEqual(['editor_add_rule', 'vws.demo.foo'])
  })

  it('shouldConfirmTool confirms non-read-only tools including native editor writes', () => {
    const prefs: AgentPrefs = { global: { confirmBeforeWriteTools: true } }
    expect(shouldConfirmTool({ name: 'editor_add_rule', provider: 'native' }, prefs)).toBe(true)
    expect(shouldConfirmTool({ name: 'editor_get_session', provider: 'native', readOnlyHint: true }, prefs)).toBe(false)
    expect(shouldConfirmTool(undefined, prefs)).toBe(true)
    expect(shouldConfirmTool({ name: 'editor_add_rule', provider: 'native' }, { global: { confirmBeforeWriteTools: false } })).toBe(false)
  })
})
