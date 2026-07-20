import type { AgentLlmToolDefinition, AgentPrefs } from '@ext/shell/webmcp/agent-types'
import type { WebMcpListedTool } from '@ext/shell/webmcp/webmcp-types'

const LLM_TOOL_NAME_ESCAPE = '__'

/** Shown when Agent has zero tools and no more specific diagnostic. */
export const WEBMCP_NO_TOOLS_DEFAULT_HINT =
  'Enable chrome://flags/#enable-webmcp-testing, restart Chrome, reload the tab, then retry. Builtin vws.page.* tools also require this flag.'

export interface PageToolsEnsureSnapshot {
  attempted: boolean
  ok: boolean
  skippedReason?: string
  message?: string
  registered?: string[]
}

/**
 * Build a user-facing diagnostic when WebMCP tools are missing or page-tools ensure failed.
 * @param tools Tools returned by listTools (may be empty)
 * @param ensure Builtin page-tools ensure payload from the same list call
 * @param listFailureMessage Optional hard list/proxy failure message
 * @returns Diagnostic string, or undefined when tools look healthy
 */
export function resolvePageToolsHint(tools: WebMcpListedTool[], ensure?: PageToolsEnsureSnapshot, listFailureMessage?: string): string | undefined {
  if (listFailureMessage?.trim()) {
    const message = listFailureMessage.trim()
    if (/webmcp|enable-webmcp-testing|unsupported/i.test(message)) {
      return message
    }
    return `${message} ${WEBMCP_NO_TOOLS_DEFAULT_HINT}`
  }

  if (ensure) {
    if (ensure.attempted && !ensure.ok) {
      return ensure.message?.trim() || 'Builtin vws.page.* registration failed.'
    }
    if (ensure.attempted && ensure.ok && (ensure.registered?.length ?? 0) > 0 && tools.every((tool) => !tool.name.startsWith('vws.page.'))) {
      return 'Builtin page tools reported registration, but listTools did not return vws.page.*. Reload the tab and confirm chrome://flags/#enable-webmcp-testing is enabled.'
    }
    if (ensure.attempted && ensure.ok && tools.length === 0) {
      return 'Page-tools ensure ran, but WebMCP listTools is still empty. Reload the tab (and confirm chrome://flags/#enable-webmcp-testing).'
    }
    if (!ensure.attempted && ensure.skippedReason === 'user_scripts_unavailable') {
      return 'Allow User Scripts is off for MagickMonkey (chrome://extensions → Details).'
    }
    if (!ensure.attempted && ensure.skippedReason === 'shell_disabled') {
      return 'MagickMonkey shell is disabled for this tab or globally.'
    }
  }

  if (tools.length === 0) {
    return WEBMCP_NO_TOOLS_DEFAULT_HINT
  }

  return undefined
}

/**
 * Map canonical WebMCP tool name to Gemini-safe function name.
 * @param canonical Canonical tool name
 */
export function toLlmToolName(canonical: string): string {
  return canonical.replace(/\./g, LLM_TOOL_NAME_ESCAPE)
}

/**
 * Resolve Gemini function name back to canonical WebMCP tool name.
 * @param llmName Function name from LLM
 * @param available Listed tools for the active tab
 */
export function fromLlmToolName(llmName: string, available: WebMcpListedTool[]): string | null {
  const canonical = llmName.replace(new RegExp(LLM_TOOL_NAME_ESCAPE, 'g'), '.')
  return available.some((tool) => tool.name === canonical) ? canonical : null
}

/**
 * Convert listed WebMCP tools to LLM function declarations.
 * @param tools Listed tools
 * @param limit Max tools to expose
 */
export function toAgentLlmTools(tools: WebMcpListedTool[], limit = 32): AgentLlmToolDefinition[] {
  return tools.slice(0, limit).map((tool) => ({
    name: toLlmToolName(tool.name),
    description: tool.description ?? tool.name,
    parameters: tool.inputSchema ?? { type: 'object', properties: {} },
  }))
}

/**
 * Filter page tools for the Agent by preference scope.
 * `magickmonkey_only` prefers MagickMonkey tools, but falls back to native page tools
 * (e.g. editor_*) when none are registered — otherwise Chat would see an empty tool list.
 * @param tools Tools listed from the active tab
 * @param prefs Agent preferences
 * @returns Tools exposed to the LLM
 */
export function filterToolsForAgent(tools: WebMcpListedTool[], prefs: AgentPrefs): WebMcpListedTool[] {
  const usable = tools.filter((tool) => tool.provider !== 'unknown')
  const scope = prefs.global?.toolProviderScope ?? 'magickmonkey_only'

  if (scope === 'all') {
    return usable
  }

  const magickmonkey = usable.filter((tool) => tool.provider === 'magickmonkey')
  if (magickmonkey.length > 0) {
    return magickmonkey
  }

  return usable.filter((tool) => tool.provider === 'native')
}

/**
 * Whether the Agent should ask the user before executing a tool.
 * When confirmations are enabled, any tool that is not explicitly read-only requires confirm.
 * @param tool Tool metadata from the active tab (undefined = unknown tool)
 * @param prefs Agent preferences
 * @returns True when a confirm dialog should be shown
 */
export function shouldConfirmTool(tool: WebMcpListedTool | undefined, prefs: AgentPrefs): boolean {
  if (prefs.global?.confirmBeforeWriteTools === false) {
    return false
  }
  if (!tool) {
    return true
  }
  return tool.readOnlyHint !== true
}

/**
 * Build a compact system prompt for the active tab.
 * @param url Active tab URL
 * @param prefs Host-specific preference notes
 * @param toolNames Canonical tool names already exposed as functions
 */
export function buildAgentSystemPrompt(url: string, prefs: Record<string, unknown> | undefined, toolNames: string[] = [], pageToolsHint?: string): string {
  const host = (() => {
    try {
      return new URL(url).hostname
    } catch {
      return url
    }
  })()

  const prefLines = prefs && Object.keys(prefs).length > 0 ? `User preferences for ${host}:\n${JSON.stringify(prefs, null, 2)}` : `No saved preferences for ${host}.`

  const toolLines =
    toolNames.length > 0
      ? [
          `WebMCP tools already available as callable functions (${toolNames.length}): ${toolNames.slice(0, 40).join(', ')}${toolNames.length > 40 ? ', …' : ''}.`,
          'Do NOT call list_tools, tools/list, vws.list_tools, or any discovery tool — they do not exist. Use only the function names provided.',
        ].join('\n')
      : [
          'No WebMCP tools are available on this page right now. Do not invent tool names such as list_tools; explain that tools are missing instead.',
          `Page tools diagnostic: ${pageToolsHint?.trim() || WEBMCP_NO_TOOLS_DEFAULT_HINT}`,
          'Tell the user to enable chrome://flags/#enable-webmcp-testing (restart Chrome + reload the tab) when builtin page tools are expected.',
        ].join('\n')

  return [
    'You are MagickMonkey Agent — a browser assistant that controls the current web page via WebMCP tools registered by the page or MagickMonkey scripts.',
    `Current page: ${url}`,
    prefLines,
    toolLines,
    'Rules:',
    '- Only call tools from the provided function list.',
    '- Do not guess DOM selectors or scrape the page when tools are missing.',
    '- vws.page tool choice:',
    '  • Headings / H1–H6 / section titles / “how many H1” / heading text → vws.page.outline (read headings[] / h1Count).',
    '  • Interactive UI / buttons / inputs / click targets → vws.page.snapshot, then click/fill with fresh indices.',
    '  • Only document.title / URL / tab visibility → vws.page.page_meta (never for heading or body content).',
    '- Prefer specific MagickMonkey business tools (vws.{scriptKey}.*) over generic vws.page.* when both fit.',
    '- Prefer MagickMonkey (vws.*) tools when both MagickMonkey and native tools are available.',
    '- Never request Cookie, localStorage, or sessionStorage via tools.',
    '- Indexes from snapshot can go stale; on index errors, snapshot again then retry.',
    "- After you receive tool results, ALWAYS reply to the user in natural language with a clear answer (Chinese or the user's language). Tool JSON in the UI is not enough — never end with tools only and no text.",
    '- Prefer a short verdict first, then 1–3 supporting details from the tool result.',
  ].join('\n\n')
}
