# Extension WebMCP Agent Side Panel — 技术规格

Status: **IMPLEMENTED**（WebMCP background 代理 + Side Panel Agent MVP：Chat / Settings、多 provider、API Base URL proxy、native 工具回退）

关联:

- 需求：`.ai/tasks/backlog/extension-webmcp-agent.md`
- 上游契约：`.ai/specs/preset-gme-webmcp.md`（`GME_registerWebMcpTool` — **P0 已实现**）
- 共享模块：`shared/webmcp/`（`classifyWebMcpToolProvider` 等）
- 注入：`extension/src/shell/csp-user-script-executor.ts`
- 消息：`extension/src/shared/messages.ts`
- 壳模块图：`.ai/specs/extension-shell.yaml`
- 互补：`tasks/backlog/agent-chat-panel.md`（Web Gist HTTP MCP Agent）

---

## 0. 产品决策（已确认）

| #      | 问题           | **已决定**                                                                           |
| ------ | -------------- | ------------------------------------------------------------------------------------ |
| **C1** | 扩展入口 UX    | **Popup 为主入口**（保留 `action.default_popup`）；**不**用 `openPanelOnActionClick` |
| **C2** | LLM 鉴权与调用 | **用户自备 API Key** → `chrome.storage.local` → **background 代理** Gemini           |

### C1 — Side Panel 打开方式（非主入口）

侧栏为辅助能力（非专业 Agent 产品），通过以下入口打开：

| 入口             | 实现                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| **Popup 菜单项** | Popup 增加「Open Agent」→ `sendShellMessage({ type: 'OPEN_SIDE_PANEL' })`                         |
| **快捷键**       | `manifest.json` → `commands.open_agent_side_panel`；`background` 监听 `chrome.commands.onCommand` |
| **命令**         | 同上 `commands`（Chrome 命令面板 / 快捷键统一入口）                                               |

点击扩展图标 → **始终打开 Popup**（现状不变）。

### 其他已拍板项

| 原开放项           | 决定                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D3 DOM scrape 兜底 | **永不**自动把 DOM 塞进 prompt；无工具时展示诊断与引导。通用读/控页见 **内置** `vws.page.*`（`.ai/specs/extension-page-webmcp.md`），仅经显式 tool call |
| D4 偏好 UI         | P2 MVP：**JSON 编辑器**；P3+ 表单化 per-host                                                                                                            |
| D5 Web Store 审核  | README 补 Permissions 说明；LLM Key 本地存储、不上传服务端                                                                                              |

---

## 1. 设计目标

在 Chrome 扩展内提供 **Side Panel Agent**，通过 background **WebMCP 代理**发现并调用当前 Tab 已注册工具（主路径：`vws.{scriptKey}.*`），实现自然语言控制浏览页面。

1. **不**在扩展内复制 HTTP MCP `scripts_*`（Gist CRUD 归 Web Agent）。
2. **不**在 content script isolated world 调用 WebMCP（仅 MAIN world）。
3. 默认 `toolProviderScope: magickmonkey_only`：**优先** `vws.*`；若当前页没有 MagickMonkey 工具，则 **回退** 到站点原生工具（如 `editor_*`）。设置为 `all` 时暴露全部可用工具（仍排除 `unknown`）。写工具默认需确认（`readOnlyHint !== true`）。
4. 复用 `shared/webmcp/provider.ts` 做提供方归类，避免重复实现。

---

## 2. 模块划分

```text
extension/src/
├── shell/webmcp/
│   ├── webmcp-tab-proxy.ts       # listTools / executeTool @ tabId
│   ├── webmcp-support.ts         # Tab URL 过滤、候选 Tab、tabId 校验
│   ├── webmcp-inject-scripts.ts  # MAIN world IIFE builders（可单测）
│   └── webmcp-types.ts           # 代理层类型（可 re-export shared）
├── sidepanel/
│   ├── sidepanel.ts              # 入口：挂载 UI、监听 Tab 变化
│   ├── agent-loop.ts             # LLM ↔ tools 多轮（调用 background LLM）
│   ├── agent-ui.ts               # 消息流、tool 卡片、停止
│   ├── agent-events.ts           # 侧栏内部事件类型（非网络 SSE）
│   ├── preferences.ts            # vws_agent_prefs 读写
│   └── settings.ts               # LLM API Key 配置 UI
├── shell/background-message-handlers.ts  # + WEBMCP_* / AGENT_LLM_*
└── shared/messages.ts            # ShellMessage / ShellResponse 扩展

extension/src/html/pages/sidepanel.ejs   # 编译 → dist/sidepanel.html

shared/webmcp/
└── support-report.ts             # 从 initializer/webmcp 迁出（P0 可选 PR）
```

**构建**：`extension/vite.config.ts` → `EXTENSION_ENTRIES` 增加 `{ name: 'sidepanel', input: 'src/ui/sidepanel/sidepanel.ts' }`。

**Manifest**（概念）：

```json
{
  "permissions": ["sidePanel"],
  "side_panel": { "default_path": "sidepanel.html" },
  "action": {
    "default_popup": "popup.html",
    "default_title": "MagickMonkey"
  },
  "commands": {
    "open_agent_side_panel": {
      "suggested_key": {
        "default": "Ctrl+Shift+M",
        "mac": "Command+Shift+M"
      },
      "description": "Open MagickMonkey Agent side panel"
    }
  }
}
```

**禁止**：`chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`（C1：图标点击保留 Popup）。

**Background 入口处理**：

```typescript
// Popup: call chrome.sidePanel.open synchronously in the click handler (user gesture).
// Do NOT route through background sendMessage — the gesture is lost after async gaps.

// Keyboard shortcut (background):
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open_agent_side_panel') {
    void openAgentSidePanelFromUserGesture().catch(() => openAgentSidePanelForActiveWindow())
  }
})
```

`ShellMessage` 增加：`{ type: 'OPEN_SIDE_PANEL' }` → 供非 Popup 入口兜底；**Popup 必须直接调用** `openAgentSidePanelFromUserGesture()`。

---

## 3. Shell 消息契约

在 `extension/src/shared/messages.ts` 扩展 `ShellMessage`：

```typescript
/** WebMCP proxy — background ↔ sidepanel / admin debug */
| { type: 'OPEN_SIDE_PANEL' }
| { type: 'WEBMCP_GET_SUPPORT'; tabId: number }
| { type: 'WEBMCP_LIST_TOOLS'; tabId: number }
| { type: 'WEBMCP_EXECUTE_TOOL'; tabId: number; name: string; args: Record<string, unknown> }
| { type: 'WEBMCP_LIST_CANDIDATE_TABS' }

/** LLM — sidepanel ↔ background only (API Key never in page world) */
| {
    type: 'AGENT_LLM_GENERATE'
    requestId: string
    messages: AgentChatMessage[]
    tools?: AgentLlmToolDefinition[]
  }
```

### 3.1 统一代理响应包络

```typescript
type WebMcpProxyReason =
  | 'supported'
  | 'api_missing'
  | 'no_secure_context'
  | 'no_document'
  | 'invalid_tab'
  | 'non_http_tab'
  | 'user_scripts_unavailable'
  | 'injection_failed'
  | 'csp_blocked'
  | 'tool_not_found'
  | 'tool_execute_failed'
  | 'internal_error'

interface WebMcpProxyResult<T> {
  ok: boolean
  reason?: WebMcpProxyReason
  message?: string
  data?: T
}
```

`ShellResponse` 扩展：

```typescript
| { ok: true; webmcp?: WebMcpProxyResult<unknown> }
| { ok: true; agentLlm?: { requestId: string; content?: string; toolCalls?: AgentLlmToolCall[] } }
| { ok: false; error: string; reason?: WebMcpProxyReason }
```

### 3.2 `WEBMCP_GET_SUPPORT`

**Request**: `{ type: 'WEBMCP_GET_SUPPORT', tabId }`

**Response** `data`:

```typescript
interface WebMcpSupportPayload {
  supported: boolean
  reason: WebMcpProxyReason
  hints: string[]
  details: {
    isSecureContext: boolean
    hasModelContextTesting: boolean
    hasListTools: boolean
    hasExecuteTool: boolean
    origin: string | null
    registrySize: number
  }
}
```

### 3.3 `WEBMCP_LIST_TOOLS`

**Request**: `{ type: 'WEBMCP_LIST_TOOLS', tabId }`

**Response** `data`:

```typescript
interface WebMcpListedTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  provider: 'magickmonkey' | 'native' | 'unknown'
  scriptKey?: string
  scriptFile?: string
  localName?: string
  readOnlyHint?: boolean
}

interface WebMcpListToolsPayload {
  tools: WebMcpListedTool[]
  filteredCount: number
  totalCount: number
}
```

提供方归类：**必须**调用 `classifyWebMcpToolProvider(name, registry)` from `@shared/webmcp/provider`。

注册表：MAIN world 读取 `globalThis.__VWS_WEBMCP_TOOL_REGISTRY__`（契约见 `preset-gme-webmcp.md` §3.1）。

### 3.4 `WEBMCP_EXECUTE_TOOL`

**Request**: `{ type: 'WEBMCP_EXECUTE_TOOL', tabId, name, args }`

**Response** `data`:

```typescript
interface WebMcpExecuteToolPayload {
  name: string
  result: unknown
}
```

失败时 `ok: false`, `reason: 'tool_not_found' | 'tool_execute_failed' | ...`, `message` 人类可读。

### 3.5 `WEBMCP_LIST_CANDIDATE_TABS`

**Response** `data`:

```typescript
interface WebMcpCandidateTab {
  tabId: number
  title: string
  url: string
  favIconUrl?: string
  operable: boolean
}
```

仅 `http://` / `https://` 标记 `operable: true`。

---

## 4. MAIN world 注入

所有 WebMCP 探测与执行经 `executeInMainWorldScriptForTab(tabId, 'global', { withBody })`（按 tab **串行**，见 `csp-user-script-executor.ts`）。

### 4.1 API 探测顺序（canonical）

1. `navigator.modelContextTesting`（扩展代理 **首选**）
   - `listTools()` → 工具发现
   - `executeTool(name, args)` → 工具执行
2. Fallback（仅当 testing API 缺失）：
   - `document.modelContext.getTools?.()` — 仅 list，**无 execute fallback 时不执行写操作**

若 `listTools` 与 `getTools` 均不可用 → `reason: 'api_missing'`。

### 4.2 List tools 注入脚本（规范输出）

`buildListToolsProbeSource(): string` 生成 IIFE，逻辑等价于：

```javascript
;(async () => {
  const out = {
    ok: false,
    reason: 'api_missing',
    tools: [],
    registryEntries: [],
    details: {},
  }
  try {
    const isSecure = typeof window !== 'undefined' && window.isSecureContext
    const origin = typeof window !== 'undefined' ? window.location.origin : null
    const testing = typeof navigator !== 'undefined' ? navigator.modelContextTesting : null
    const registry = globalThis.__VWS_WEBMCP_TOOL_REGISTRY__
    const registryEntries = registry && typeof registry.entries === 'function' ? Array.from(registry.entries()) : []

    out.details = { isSecure, origin, hasTesting: Boolean(testing) }

    if (!isSecure) {
      out.reason = 'no_secure_context'
      return out
    }
    if (!testing?.listTools && !document?.modelContext?.getTools) {
      out.reason = 'api_missing'
      return out
    }

    let tools = []
    if (typeof testing?.listTools === 'function') {
      tools = await testing.listTools()
    } else if (typeof document?.modelContext?.getTools === 'function') {
      tools = await document.modelContext.getTools()
    }

    out.ok = true
    out.reason = 'supported'
    out.tools = Array.isArray(tools) ? tools : []
    out.registryEntries = registryEntries.map(([name, rec]) => ({
      name,
      providerId: rec?.providerId,
      scriptKey: rec?.scriptKey,
      scriptFile: rec?.scriptFile,
      localName: rec?.localName,
      readOnlyHint: rec?.readOnlyHint,
      description: rec?.description,
    }))
    return out
  } catch (e) {
    out.reason = 'internal_error'
    out.message = e instanceof Error ? e.message : String(e)
    return out
  }
})()
```

Background 合并 `tools[]` 与 `registryEntries`，调用 `classifyWebMcpToolProvider`，组装 `WebMcpListedTool[]`。

### 4.3 Execute tool 注入脚本

`buildExecuteToolSource(name: string, argsJson: string): string`：

```javascript
;(async () => {
  const name = /* JSON-stringified canonical name */
  const args = /* JSON.parse injected literal */
  const testing = navigator.modelContextTesting
  if (!testing?.executeTool) {
    return { ok: false, reason: 'api_missing', message: 'executeTool unavailable' }
  }
  try {
    // Chrome requires the 2nd arg as a JSON string (not a plain object).
    let result = await testing.executeTool(name, JSON.stringify(args))
    if (typeof result === 'string') {
      try {
        result = JSON.parse(result)
      } catch {
        /* keep raw string */
      }
    }
    return { ok: true, result }
  } catch (e) {
    return {
      ok: false,
      reason: 'tool_execute_failed',
      message: e instanceof Error ? e.message : String(e),
    }
  }
})()
```

`name` / `args` 须经 `JSON.stringify` 嵌入，禁止字符串拼接用户输入。`executeTool` 的第二参必须再 `JSON.stringify(args)` 一次（Chrome 协议要求字符串）。

### 4.4 Tab 合法性（`webmcp-support.ts`）

| 检查              | 失败 reason                |
| ----------------- | -------------------------- |
| `tabId` 存在      | `invalid_tab`              |
| URL `http(s):`    | `non_http_tab`             |
| User Scripts API  | `user_scripts_unavailable` |
| 注入返回 CSP 错误 | `csp_blocked`              |

---

## 5. Tab 选择与刷新

| 行为         | 实现                                                                            |
| ------------ | ------------------------------------------------------------------------------- |
| 默认目标 Tab | `chrome.tabs.query({ active: true, currentWindow: true })`                      |
| 用户切换 Tab | 侧栏下拉 `WEBMCP_LIST_CANDIDATE_TABS`                                           |
| 自动刷新     | 监听 `tabs.onActivated`；`tabs.onUpdated` 当 `changeInfo.status === 'complete'` |
| 工具列表刷新 | **每次用户发送消息前** `WEBMCP_LIST_TOOLS`；工具抽屉可手动刷新                  |
| Agent 循环   | 单会话最多 **10** 轮 tool loop；每轮执行后不强制 re-list                        |

---

## 6. 用户偏好与 LLM 配置

### 6.1 存储键

| 键                     | 内容                                  |
| ---------------------- | ------------------------------------- |
| `vws_agent_prefs`      | 站点偏好 + global 策略                |
| `vws_agent_llm_config` | LLM 配置（**仅** sidepanel 设置写入） |

### 6.2 `vws_agent_prefs` 结构

```json
{
  "byHost": {
    "www.bilibili.com": {
      "blockDanmaku": true,
      "idleFullscreenSec": 30,
      "notes": "用户自定义说明"
    }
  },
  "global": {
    "confirmBeforeWriteTools": true,
    "toolProviderScope": "magickmonkey_only"
  }
}
```

| `toolProviderScope`         | Agent 可见工具                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `magickmonkey_only`（默认） | 优先 `provider === 'magickmonkey'`；若无 MagickMonkey 工具则回退到 `native`（如 `/editor` 的 `editor_*`） |
| `all`                       | 所有可用工具（仍排除 `unknown`）                                                                          |

`provider === 'unknown'`：**永不**交给 Agent。

### 6.3 `vws_agent_llm_config` 结构（C2 已确认）

```json
{
  "provider": "gemini",
  "apiKey": "…",
  "model": "gemini-2.0-flash",
  "proxyEnabled": false,
  "baseUrl": "",
  "proxyHeaders": {},
  "byProvider": { "gemini": { "apiKey": "…", "model": "…", "proxyEnabled": false, "baseUrl": "", "proxyHeaders": {} } }
}
```

- Provider：`gemini` | `openai` | `anthropic`（UI：Gemini / OpenAI / Claude）
- 侧栏 `sendMessage({ type: 'AGENT_LLM_GENERATE', ... })`
- Background 读取 config，`fetch` 对应官方或自定义 Base URL（**非流式 MVP**）
- Key **不得**传入 content script / MAIN world / DOM
- 详见 `.ai/specs/extension-agent-llm-proxy.md`

### 6.4 写操作确认

当 `confirmBeforeWriteTools !== false`（默认开启）：

- `readOnlyHint === true` → 无需确认
- 其余工具（含未知工具）→ 一律确认

确认 UI：`window.confirm`「执行 `{name}`？」展示 args JSON。

---

## 7. Agent loop（侧栏）

### 7.1 内部事件（`agent-events.ts`）

| type              | payload                                    |
| ----------------- | ------------------------------------------ |
| `text_delta`      | `{ delta: string }`                        |
| `tool_start`      | `{ id, name, params }`                     |
| `tool_end`        | `{ id, name, ok, summary?, error? }`       |
| `tools_refreshed` | `{ count, tabId }`                         |
| `done`            | `{ finishReason: 'stop' \| 'max_rounds' }` |
| `error`           | `{ message }`                              |

MVP：**非流式** LLM；`text_delta` 可在拿到完整 content 后一次性发出。P2+ 可加 `chrome.runtime.connect` 流式 port。

### 7.2 LLM tool schema 映射

```typescript
function toLlmToolName(canonical: string): string {
  return canonical.replace(/\./g, '__')
}

function fromLlmToolName(llmName: string, available: WebMcpListedTool[]): string | null {
  const canonical = llmName.replace(/__/g, '.')
  return available.some((t) => t.name === canonical) ? canonical : null
}
```

传给 LLM 的 tools 上限：**32**（超出时按当前 host 相关工具优先截断）。

### 7.3 System prompt 注入

- 当前 Tab URL + hostname
- `vws_agent_prefs.byHost[hostname]` 摘要
- `global.toolProviderScope`
- 简短边界：仅调用列表内工具；无工具时说明原因，**不** scrape DOM

---

## 8. Side Panel UI

### 8.1 布局

```text
┌─ MagickMonkey Agent ─────────────────────┐
│ [目标 Tab ▼]  host/path…     N MM · M Site │
├──────────────────────────────────────────┤
│ 消息区（流式文本 + tool 卡片）              │
├──────────────────────────────────────────┤
│ [⚙ 设定] [工具列表] [LLM 设置]              │
│ [输入框________________________] [发送][停] │
└──────────────────────────────────────────┘
```

- 样式：扩展现有 Tailwind + `mm-*`（Shadow DOM，对齐 admin/popup）
- P1：工具列表 + 手动 JSON 试跑（Inspector 等价）
- P2：Agent 聊天 + 偏好 JSON 编辑

### 8.2 降级文案

| 条件              | 行为                                      |
| ----------------- | ----------------------------------------- |
| WebMCP API 不可用 | 展示 `WEBMCP_GET_SUPPORT` hints + flag 链 |
| 无已注册工具      | 引导检查脚本 @match、Admin Scripts        |
| 非 http(s) Tab    | 固定空态，禁用执行                        |
| 未配置 LLM        | 引导打开 LLM 设置                         |

无工具时 CTA（P3）：`在 Web 中管理脚本` → active Service 的 `${baseUrl}/editor`（**不**内嵌 HTTP MCP）。

---

## 9. `getWebMcpSupportReport` 迁移

| 阶段 | 动作                                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------- |
| P0   | 扩展 `webmcp-support.ts` 内联精简探测（§4.2 `details` 字段）                                               |
| P0+  | 将 `initializer/webmcp/modelContext.ts` 中 `getWebMcpSupportReport` 迁至 `shared/webmcp/support-report.ts` |
|      | `initializer/webmcp` re-export shared；扩展与编辑器共用                                                    |

---

## 10. 测试计划

| 用例                           | 文件                                                |
| ------------------------------ | --------------------------------------------------- |
| Tab URL 过滤                   | `__tests__/extension/webmcp-support.spec.ts`        |
| 注入脚本 builder 输出合法 JSON | `__tests__/extension/webmcp-inject-scripts.spec.ts` |
| list/execute 消息处理          | `__tests__/extension/webmcp-tab-proxy.spec.ts`      |
| provider 归类                  | `__tests__/shared/webmcp-provider.spec.ts`（已有）  |
| LLM tool 名映射 round-trip     | `__tests__/extension/agent-llm-tools.spec.ts`       |

Mock：`chrome.userScripts.execute` 返回固定 `result`；不依赖真实 WebMCP flag。

---

## 11. 手动验证步骤

1. Chrome `chrome://flags/#enable-webmcp-testing` → Enabled，重启
2. Extension Details → 启用 **Allow User Scripts**
3. `pnpm build:extension`，加载 `extension/dist`
4. 打开带 `GME_registerWebMcpTool` 的测试页（或 `docs/examples/gme-webmcp-toggle-danmaku.ts` 对应脚本）
5. **Popup →「Open Agent」** 或快捷键 `Ctrl+Shift+M` / `Cmd+Shift+M` → Side Panel 打开
6. 工具列表可见 `vws.{scriptKey}.*`，provider = MM
7. 手动 JSON 执行 tool → 页面行为正确
8. 配置 Gemini API Key → Agent 自然语言触发正确 tool
9. 切换到 `chrome://extensions` → 空态 + 不崩溃
10. 点击扩展图标 → **仍打开 Popup**（非 Side Panel）
11. DevTools → 确认 API Key 未出现在页面 / content script

---

## 12. Chrome Web Store 说明（D5）

`extension/README.md` 增补：

- **`<all_urls>`**：仅在用户启用脚本的目标 HTML 页注入 preset（与 injection policy 一致）
- **`sidePanel`**：本地 Agent 控制当前 Tab 已注册 WebMCP 工具
- **LLM**：MVP 下 API Key 仅存用户浏览器 `chrome.storage.local`，不经 MagickMonkey 服务器

---

## 13. 分阶段实现对照

| Phase | 本 spec 章节        | 交付物                                         |
| ----- | ------------------- | ---------------------------------------------- |
| P0    | §3–§4, §10          | `shell/webmcp/*` + messages + 单元测试         |
| P1    | §2, §8.1（调试 UI） | manifest + sidepanel 壳 + README               |
| P2    | §6–§7, §8           | agent-loop + LLM background + 偏好             |
| P3    | §8.2 CTA            | 可选：服务端 LLM（非 C2 路径）、Web Agent 跳转 |

---

## 14. 修订记录

| 日期       | 说明                                                                                |
| ---------- | ----------------------------------------------------------------------------------- |
| 2026-07-09 | 初版技术规格：消息契约、注入脚本、LLM/偏好、测试与验证清单                          |
| 2026-07-09 | C1：Popup 主入口 + 快捷键/命令/Popup 菜单开侧栏；C2：插件本地 Key + background 代理 |
