# 扩展内置页面工具（`vws.page.*`）— 技术规格

Status: **APPROVED**（2026-07-19 review：可实现；见 §8 / §12 修订）

关联:

- 需求：`.ai/tasks/backlog/extension-page-webmcp.md`
- Agent 代理：`.ai/specs/extension-webmcp-agent.md`
- 注册契约：`.ai/specs/preset-gme-webmcp.md`（`__VWS_WEBMCP_TOOL_REGISTRY__`、`vws.{scriptKey}.{localName}`）
- 依赖：npm [`@page-agent/page-controller`](https://www.npmjs.com/package/@page-agent/page-controller)（MIT；源码在 alibaba/page-agent `packages/page-controller`）

---

## 0. 已确认决策

| #   | 决策                                            |
| --- | ----------------------------------------------- |
| P1  | **扩展内置**自动注册，非独立 Gist 技能          |
| P2  | 权限 = 脚本注入门槛；无第二套 Agent 读页授权    |
| P3  | 只用 **page-controller**；不用 PageAgent UI/LLM |
| P4  | 当前 Tab MAIN world；无 Playwright/CDP          |
| P5  | Agent 不自动 scrape；读页只经工具               |
| P6  | 内置禁止 Cookie / Web Storage                   |
| P7  | 写工具走现有 `confirmBeforeWriteTools`          |

---

## 1. 设计目标

1. 在满足门槛的 Tab 上，向 WebMCP 注册稳定工具集 `vws.page.*`。
2. 底层用 page-controller：`updateTree` → 简化文本 + `selectorMap`；按索引 `clickElement` / `inputText` / `scroll`。
3. 复用现有 Side Panel Agent + background `WEBMCP_*`；**不**新开 LLM 环。
4. 与 `vws.{userScriptKey}.*` 共存；保留字 `page`。

---

## 2. 模块划分

```text
extension/src/shell/webmcp/
├── page-tools/
│   ├── page-tools-gate.ts          # 注入门槛判定（可单测纯函数优先）
│   ├── page-tools-register.ts      # MAIN world：注册/幂等/卸载
│   ├── page-tools-definitions.ts   # 工具 schema + readOnlyHint
│   └── page-controller-adapter.ts  # 对 PageController 的薄封装（可选同文件）

extension/src/shell/webmcp/webmcp-tab-proxy.ts       # LIST/EXECUTE 前 ensure（主钩点）
extension/src/shell/csp-user-script-executor.ts      # executeRawMainWorldCodeForTab（实际注入 API）
extension/vite.config.ts                             # + page-tools-main IIFE entry → 注入字符串

shared/webmcp/
├── constants.ts                    # + VWS_WEBMCP_PAGE_SCRIPT_KEY = 'page'
└── register-tool.ts                # GME 路径拒绝 scriptKey === 'page'

# 依赖（Vite IIFE 打进 MAIN 注入包；enableMask: false）
@page-agent/page-controller
```

**禁止**：

- 在 Side Panel / background Node 环境直接操作页面 DOM。
- 把 `PageAgent` / `@page-agent/ui` / `@page-agent/llms` 打进扩展。
- 在 content script isolated world 注册 WebMCP。
- 用手写模板字符串把 page-controller 塞进 `webmcp-inject-scripts.ts`（体积过大；必须独立 IIFE entry）。

---

## 3. 注入门槛（Gate）

`shouldRegisterPageTools(ctx)` 为真当且仅当：

| #   | 条件                                         | 失败时行为                                     |
| --- | -------------------------------------------- | ---------------------------------------------- |
| G1  | 扩展总开关开启（现有 master switch）         | 不注册                                         |
| G2  | Tab URL 为 `http:` / `https:`                | 同现有 `non_http_tab`                          |
| G3  | User Scripts API 可用且策略允许对该 Tab 注入 | `user_scripts_unavailable` / 不注册            |
| G4  | Secure Context + WebMCP `registerTool` 可用  | 注册尝试失败；LIST 附带 `pageToolsEnsure` 诊断 |

**实现**：G1–G3 决定是否注入 `page-tools-main`；**不再要求**页面已有匹配 MagickMonkey 脚本（builtin 正是为无脚本工具的页面准备的）。组合：`isShellEnabledForTab` + `isUserScriptsApiAvailable` + `isOperableHttpTabUrl`。

**不**单独检查「Agent 偏好里的读页开关」。

### 3.1 何时 ensure

| 时机                                            | 动作                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `webMcpListTools`（`webmcp-tab-proxy.ts`）      | Gate 通过后 **先** `executeRawMainWorldCodeForTab(ensureBundle)`，再 list probe |
| `webMcpExecuteTool` 且 name 匹配 `^vws\.page\.` | 若未注册则 ensure；仍失败则 `tool_not_found`                                    |
| Tab `complete` / 侧栏刷新                       | 可再 ensure（幂等）                                                             |
| Gate 从真变假                                   | 下一轮 list 不再 ensure；P0 不强制主动 unregister（导航后 MAIN 重建即可）       |

---

## 4. 命名与注册表

| 项           | 值                                                   |
| ------------ | ---------------------------------------------------- |
| `scriptKey`  | `page`（保留字）                                     |
| Canonical    | `vws.page.{localName}`                               |
| `providerId` | `magickmonkey`                                       |
| `scriptFile` | `__builtin__/page-tools`（元数据，非真实 Gist 文件） |

### 4.1 保留字

- `shared/webmcp`：`VWS_WEBMCP_PAGE_SCRIPT_KEY = 'page'`。
- `GME_registerWebMcpTool`：若解析到 `scriptKey === 'page'` → `invalid_script_key`（无 `allowReservedPageScriptKey`）。
- 扩展内置 ensure 调用 `registerVwsWebMcpTool(..., { scriptKey: 'page', allowReservedPageScriptKey: true, scriptFile: '__builtin__/page-tools' })`。
- 分类：注册表有记录 → 仍为 `magickmonkey`（与现有 `classifyWebMcpToolProvider` 一致）。

### 4.2 幂等

- `ensureVwsPageTools`：已注册且 handler 仍绑定同一 controller 会话则 no-op。
- 整页导航后 MAIN world 重建 → 重新 ensure。

---

## 5. PageController 适配

### 5.1 生命周期

```text
ensure → new PageController({ enableMask: false, … })（module 闭包单例，不挂 globalThis）
      → createPageControllerAdapter(controller)
snapshot/outline → controller.updateTree()
click/fill → assertIndexed 或写前 updateTree → clickElement / inputText
```

### 5.2 与工具映射

| WebMCP 工具          | PageController / 适配                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `vws.page.snapshot`  | `updateTree()` → 返回 `{ url, title, simplifiedHtml, indexCount, truncated }`             |
| `vws.page.outline`   | 基于同一 flat tree 抽 heading / landmark 文本；可共享最近一次 tree                        |
| `vws.page.page_meta` | `location.href`、`document.title`、`visibilityState`；**无** storage                      |
| `vws.page.click`     | args: `{ index: number }` → `clickElement(index)`                                         |
| `vws.page.fill`      | args: `{ index: number, text: string, clear?: boolean }` → `inputText`（clear 默认 true） |
| `vws.page.scroll`    | args: `{ down?: boolean, numPages?: number, index?: number }` → `scroll(...)`             |

### 5.3 截断

| 常量                      | 建议默认 | 说明                             |
| ------------------------- | -------- | -------------------------------- |
| `PAGE_SNAPSHOT_MAX_CHARS` | `24000`  | 超出尾部截断并 `truncated: true` |
| `PAGE_OUTLINE_MAX_CHARS`  | `8000`   | 同上                             |
| `PAGE_FILL_MAX_CHARS`     | `8000`   | 单次 fill 文本上限               |

### 5.4 索引有效性

- 每次成功 `snapshot` / `outline`（会 `updateTree`）刷新索引纪元 `treeEpoch`。
- `click` / `fill`：若未索引 → 先 `updateTree` 一次；若 index 不在 `selectorMap` → 返回可恢复错误：`index_out_of_range`，message 提示重新 `snapshot`。

### 5.5 禁止能力（硬约束）

内置 adapter **不得**实现或间接提供：

- 读/写 `document.cookie`
- 读/写 `localStorage` / `sessionStorage` / `indexedDB`
- `eval` / `new Function` / 任意 `element` 上执行用户传入 JS 字符串
- 导出全量 `outerHTML`（snapshot 只用 controller 的简化文本路径）

---

## 6. 工具 Schema（P0）

### 6.1 `vws.page.snapshot`

```json
{
  "name": "snapshot",
  "description": "Refresh the interactive DOM index and return a compact text map for the current page. Call before click/fill when the page may have changed.",
  "annotations": { "readOnlyHint": true },
  "inputSchema": {
    "type": "object",
    "properties": {
      "viewportOnly": { "type": "boolean", "description": "If true, prefer visible viewport elements when supported." }
    },
    "additionalProperties": false
  }
}
```

### 6.2 `vws.page.outline`

```json
{
  "name": "outline",
  "description": "Return a heading/landmark outline of the current page (cheaper than full snapshot).",
  "annotations": { "readOnlyHint": true },
  "inputSchema": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  }
}
```

### 6.3 `vws.page.page_meta`

```json
{
  "name": "page_meta",
  "description": "Return non-sensitive page metadata: URL, title, visibilityState.",
  "annotations": { "readOnlyHint": true },
  "inputSchema": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  }
}
```

### 6.4 `vws.page.click`

```json
{
  "name": "click",
  "description": "Click an interactive element by index from the latest snapshot.",
  "annotations": { "readOnlyHint": false },
  "inputSchema": {
    "type": "object",
    "required": ["index"],
    "properties": {
      "index": { "type": "integer", "minimum": 0 }
    },
    "additionalProperties": false
  }
}
```

### 6.5 `vws.page.fill`

```json
{
  "name": "fill",
  "description": "Type text into an element by snapshot index.",
  "annotations": { "readOnlyHint": false },
  "inputSchema": {
    "type": "object",
    "required": ["index", "text"],
    "properties": {
      "index": { "type": "integer", "minimum": 0 },
      "text": { "type": "string", "maxLength": 8000 },
      "clear": { "type": "boolean", "default": true }
    },
    "additionalProperties": false
  }
}
```

### 6.6 `vws.page.scroll`

```json
{
  "name": "scroll",
  "description": "Scroll the page or an indexed element.",
  "annotations": { "readOnlyHint": false },
  "inputSchema": {
    "type": "object",
    "properties": {
      "down": { "type": "boolean", "default": true },
      "numPages": { "type": "number", "minimum": 0.1, "maximum": 10, "default": 1 },
      "index": { "type": "integer", "minimum": 0 }
    },
    "additionalProperties": false
  }
}
```

---

## 7. 与 Agent 规格的衔接

### 7.1 D3 澄清（修订语义，不推翻）

原 D3：「永不自动 scrape」。

本规格下含义：

- **自动**：Agent / background **不得**在发消息时静默把 DOM 塞进 prompt。
- **允许**：用户对话触发的 **显式** `vws.page.*` tool call 读取简化 DOM。
- 无 Gate / 无 WebMCP：仍展示诊断，**不** scrape。

在 `extension-webmcp-agent.md` §0 增加交叉引用即可（实现 PR 同步改一行）。

### 7.2 System prompt 增补（要点）

- 需要理解或操作可见 UI 时：先 `vws.page.snapshot`（或 `outline`）。
- 索引可能因页面变化失效；写失败后重新 snapshot。
- 存在更具体的 `vws.{scriptKey}.*` 业务工具时优先用之。
- 不要请求或假设 Cookie / storage 内容。

### 7.3 写确认

沿用 `confirmBeforeWriteTools`：`click` / `fill` / `scroll` 均需确认（除非用户关闭全局确认）。

---

## 8. 打包与依赖

| 项         | 做法                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 包         | `pnpm add @page-agent/page-controller`（已发布，如 `1.12.x`）；**默认不 vendor**                                               |
| 注入       | Vite 新增 **page-tools-main** IIFE entry（`inlineDynamicImports`）；background 经 `executeRawMainWorldCodeForTab` 注入产物文本 |
| Mask       | `enableMask: false`（避免拉起 SimulatorMask UI）；构建时确认 `ai-motion` 不被强制打进关键路径，体积异常则再评估 vendor 精简    |
| Tree-shake | 不引用 `page-agent` / `@page-agent/ui` / `@page-agent/llms`                                                                    |
| License    | `extension/NOTICE` 或 README 致谢 page-agent / browser-use 衍生 DOM 处理                                                       |

---

## 9. 测试计划

| 层级         | 覆盖                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 单元         | `shouldRegisterPageTools` 真值表；保留字 `page`；snapshot 截断；fill maxLength；禁止 storage 的静态检查（adapter 无相关 API 调用） |
| 单元         | 工具 schema / canonical 名生成                                                                                                     |
| 集成（扩展） | mock MAIN：ensure → list 含 `vws.page.snapshot`；execute click 调到 adapter                                                        |
| 手工         | 开 WebMCP flag → 普通 https → 启用匹配脚本 → 侧栏问 H1 → 确认后 fill                                                               |

---

## 10. 非目标（实现时拒绝 scope creep）

- Nanobrowser / Pilot 式整产品嵌入
- CDP Accessibility.dump
- 默认截图进多模态
- 站点构建器组件树 API
- 内置读剪贴板 / 下载文件

---

## 11. 实现顺序建议

1. Gate 纯函数 + 常量保留字 + GME 拒绝 `page`
2. Vendor/依赖 page-controller + adapter（无 WebMCP）单测
3. MAIN ensure 注册 IIFE + LIST_TOOLS 钩子
4. 接通六工具 + 写确认回归
5. Agent prompt 一小段 + README / NOTICE
6. 手工验收清单（需求 §6）

---

## 12. 修订记录

| 日期       | 说明                                                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-19 | 初稿：方案 A、page-controller、Gate=启用脚本匹配、工具清单 P0                                                                          |
| 2026-07-19 | Review：钩点改为 `webmcp-tab-proxy` + `executeRawMainWorldCodeForTab`；G4 锁定 `getMergedTabMatchCount`；npm 包已确认；独立 IIFE entry |

|
