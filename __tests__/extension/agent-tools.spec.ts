import type { AgentPrefs } from '@ext/shell/webmcp/agent-types'
import type { WebMcpListedTool } from '@ext/shell/webmcp/webmcp-types'
import {
  buildAgentSystemPrompt,
  filterToolsForAgent,
  fromLlmToolName,
  resolvePageToolsHint,
  shouldConfirmTool,
  toAgentLlmTools,
  toLlmToolName,
  WEBMCP_NO_TOOLS_DEFAULT_HINT,
} from '@ext/ui/sidepanel/agent-tools'

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
    expect(prompt).toContain('vws.page.outline')
    expect(prompt).toContain('never for heading')
    expect(prompt).toContain('ALWAYS reply to the user in natural language')
  })

  it('buildAgentSystemPrompt warns when no tools are available', () => {
    const prompt = buildAgentSystemPrompt('https://example.com/', undefined, [])
    expect(prompt).toContain('No WebMCP tools are available')
    expect(prompt).toContain('list_tools')
    expect(prompt).toContain('enable-webmcp-testing')
    expect(prompt).toContain(WEBMCP_NO_TOOLS_DEFAULT_HINT)
  })

  it('resolvePageToolsHint prefers ensure/list diagnostics over the default hint', () => {
    expect(resolvePageToolsHint([], undefined, 'WebMCP is unavailable on this page. Enable chrome://flags/#enable-webmcp-testing')).toContain('enable-webmcp-testing')
    expect(resolvePageToolsHint([], { attempted: true, ok: false, message: 'Register failed' })).toBe('Register failed')
    expect(resolvePageToolsHint([], { attempted: false, ok: true, skippedReason: 'user_scripts_unavailable' })).toContain('Allow User Scripts')
    expect(resolvePageToolsHint([], undefined)).toBe(WEBMCP_NO_TOOLS_DEFAULT_HINT)
    expect(
      resolvePageToolsHint([{ name: 'vws.page.snapshot', provider: 'magickmonkey' }], {
        attempted: true,
        ok: true,
        registered: ['vws.page.snapshot'],
      })
    ).toBeUndefined()
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

  it('filterToolsForAgent keeps builtin vws.page.* tools as MagickMonkey', () => {
    const tools: WebMcpListedTool[] = [
      { name: 'vws.page.snapshot', provider: 'magickmonkey' },
      { name: 'editor_add_rule', provider: 'native' },
    ]
    const prefs: AgentPrefs = { global: { toolProviderScope: 'magickmonkey_only' } }
    expect(filterToolsForAgent(tools, prefs).map((tool) => tool.name)).toEqual(['vws.page.snapshot'])
  })

  it('shouldConfirmTool confirms non-read-only tools including native editor writes', () => {
    const prefs: AgentPrefs = { global: { confirmBeforeWriteTools: true } }
    expect(shouldConfirmTool({ name: 'editor_add_rule', provider: 'native' }, prefs)).toBe(true)
    expect(shouldConfirmTool({ name: 'editor_get_session', provider: 'native', readOnlyHint: true }, prefs)).toBe(false)
    expect(shouldConfirmTool(undefined, prefs)).toBe(true)
    expect(shouldConfirmTool({ name: 'editor_add_rule', provider: 'native' }, { global: { confirmBeforeWriteTools: false } })).toBe(false)
  })
})
