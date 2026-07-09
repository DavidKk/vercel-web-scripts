# GME_registerWebMcpTool — 脚本作者速查

Use when authoring **MagickMonkey Gist userscripts** that expose **page actions** for the Chrome extension WebMCP Agent (side panel). This is **not** HTTP MCP (`/api/mcp`).

> **三条路径别混用**：HTTP MCP（`/api/mcp`）= Gist 远程 CRUD；`GME_registerWebMcpTool` = 在当前 Tab 注册页面工具；扩展侧栏 Agent（backlog）= 自然语言调用这些工具。

## MCP resource

When connected to MagickMonkey HTTP MCP, read this doc via:

- URI: `skill://magickmonkey/gme-webmcp-skill.md`
- Static URL: `/docs/gme-webmcp-skill.md`

General Gist authoring (including capability tables): `skill://magickmonkey/scripts-ai-skill.md` → section **WebMCP (page tab tools)**.

## When to use

- Register structured tools on the **current tab** (toggle UI, read player state, fullscreen, etc.).
- Let the extension Agent call your tool by name instead of scraping the DOM.
- Keep DOM/site logic inside `execute()`; expose only a clear verb + JSON Schema.

## When not to use

- Remote Gist CRUD → use HTTP MCP / `scripts_*` tools.
- Tampermonkey-only installs without extension shell → `scriptKey` may be missing; registration will no-op with a warning.
- Pages without Chrome WebMCP (`chrome://flags/#enable-webmcp-testing`) → API unavailable; script continues.

## API

```typescript
void GME_registerWebMcpTool({
  name: 'toggle_danmaku', // short name only (snake_case)
  description: 'What the tool does; written for an AI agent.',
  inputSchema: { type: 'object', properties: { visible: { type: 'boolean' } }, required: ['visible'] },
  annotations: { readOnlyHint: false },
  execute: async (input) => ({ ok: true }),
})
```

Registered WebMCP name (automatic):

```text
vws.{scriptKey}.toggle_danmaku
```

- **Do not** prefix `vws.` yourself.
- `localName` must match `^[a-z][a-z0-9_]{0,63}$`.

## Provider identity

MagickMonkey tools are tagged for the extension Agent:

| Field       | Value                                     |
| ----------- | ----------------------------------------- |
| Provider    | `magickmonkey`                            |
| Name prefix | `vws.`                                    |
| Registry    | `globalThis.__VWS_WEBMCP_TOOL_REGISTRY__` |

Site-native WebMCP tools (no `vws.` prefix) are separate; the extension Agent defaults to **MagickMonkey tools only**.

## Lifecycle

```typescript
const controller = new AbortController()
void GME_registerWebMcpTool(
  {
    /* ... */
  },
  { signal: controller.signal }
)
// later: controller.abort() unregisters
```

## Return value

```typescript
const result = await GME_registerWebMcpTool(/* ... */)
// { ok: true, canonicalName: 'vws.<scriptKey>.toggle_danmaku' }
// { ok: false, reason: 'unsupported' | 'missing_script_key' | 'invalid_local_name' | 'duplicate' | ... }
```

## Related docs

- Repo spec: `.ai/specs/preset-gme-webmcp.md`
- Task (extension Agent consumer): `.ai/tasks/backlog/extension-webmcp-agent.md`
- General scripting + HTTP MCP boundaries: `/docs/scripts-ai-skill.md`
- Cursor skill: `.cursor/skills/scripts-api-mcp/SKILL.md` (section **Page WebMCP**)
- Example snippet: `docs/examples/gme-webmcp-toggle-danmaku.ts`
- Chrome: [WebMCP Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
