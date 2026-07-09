# Preset `GME_registerWebMcpTool` — 需求文档

Status: **P0 IMPLEMENTED**（共享模块 + preset API；P1 文档/示例已补）

关联:

- **技术规格**：`.ai/specs/preset-gme-webmcp.md`
- [Chrome WebMCP 文档](https://developer.chrome.com/docs/ai/webmcp)
- [Chrome WebMCP Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- `preset/src/editor-typings.d.ts` — GME API 类型源
- `initializer/webmcp/` — 编辑器侧注册（共享层抽取见技术规格）
- `.ai/tasks/backlog/extension-webmcp-agent.md` — 扩展侧栏 Agent **消费**页面工具（下游）
- `public/docs/scripts-ai-skill.md` — 脚本作者文档（含 WebMCP 小节）
- `public/docs/gme-webmcp-skill.md` — 页面 WebMCP 作者速查（MCP resource）

---

## 1. 问题陈述

MagickMonkey 用户脚本已在页面内通过 `GME_*` 操作 DOM，但 **AI / 扩展 Agent 无法发现「当前页有哪些可调用的动词」**，只能依赖硬编码菜单或 DOM 猜测。

WebMCP 提供 Tab 内结构化工具注册。本需求在 **preset 运行时** 增加 `GME_registerWebMcpTool`，让脚本作者把页面能力（关弹幕、全屏、读播放器状态等）注册为 Agent 可调用的工具。

**完成标准**：Gist 脚本在扩展注入的页面上调用 `GME_registerWebMcpTool` 后，工具以 **`vws.{scriptKey}.{localName}`** 出现在 WebMCP 工具列表中，且扩展可通过 `__VWS_WEBMCP_TOOL_REGISTRY__` 识别为 MagickMonkey 提供方（与站点原生工具区分）。

---

## 2. 定位与边界

```text
Gist 脚本 ──GME_registerWebMcpTool──► 页面 WebMCP + 注册表
                                              ▲
扩展 Side Panel Agent（另需求）──listTools/executeTool──┘
```

| 属于本需求                         | 不属于本需求               |
| ---------------------------------- | -------------------------- |
| preset API + 共享 `shared/webmcp/` | 扩展 Side Panel / Agent UI |
| 插件标识命名与注册表               | `editor_*` 编辑器工具      |
| typings、单元测试、作者文档        | HTTP MCP `scripts_*`       |
| `global-registry` 挂载             | Tampermonkey 专用侧栏      |

---

## 3. 用户与场景

| 角色       | 场景                                                |
| ---------- | --------------------------------------------------- |
| 脚本作者   | 为 B 站脚本注册 `toggle_danmaku`，供后续 Agent 调用 |
| 终端用户   | （间接）通过扩展 Agent 自然语言触发脚本能力         |
| 平台维护者 | 统一 `vws.*` 命名空间，避免与站点 WebMCP 混淆       |

---

## 4. 功能需求

### FR-1 注册 API

- 提供全局函数 `GME_registerWebMcpTool(definition, options?)`。
- 返回 `Promise<{ ok, canonicalName?, reason?, message? }>`，**不 throw** 阻断脚本主流程（除编程错误）。

### FR-2 插件标识（必选）

- Canonical 名：`vws.{scriptKey}.{localName}`。
- 作者只传 **短名** `localName`；API 自动加前缀。
- 页面维护 `globalThis.__VWS_WEBMCP_TOOL_REGISTRY__`（`Map`）。
- WebMCP `title` 默认 `MagickMonkey · {localName}`。
- `providerId` 固定 `magickmonkey`（写入注册表）。

详见技术规格 §3。

### FR-3 运行时上下文

- `scriptKey` 来自 `__VWS_SCRIPT_KEY__` 等（与 OTA/RULE 一致）。
- 缺失 `scriptKey` 时拒绝注册并 warn。

### FR-4 生命周期

- 支持 `options.signal`（`AbortSignal`）：abort 时从 WebMCP 与注册表移除。
- 同 canonical 名重复注册 → 明确 `duplicate` 错误。

### FR-5 降级

- 无 `document.modelContext.registerTool` 时：`GME_warn` + `{ ok: false, reason: 'unsupported' }`。
- 脚本其余逻辑继续执行。

### FR-6 全局暴露

- preset 加载后 `GME_registerWebMcpTool` 在 `__GLOBAL__` / `globalThis` 可用（与现有 GME API 一致）。

### FR-7 文档与类型

- `editor-typings.d.ts` 声明完整类型。
- P1 文档与示例已同步（`scripts-ai-skill.md`、`gme-webmcp-skill.md`、MCP resource、示例片段）。

---

## 5. 非功能需求

| 项   | 要求                                               |
| ---- | -------------------------------------------------- |
| 体积 | 共享模块无 React 依赖，适合打入 preset IIFE        |
| 安全 | `execute` 包装捕获异常，返回结构化 `{ ok: false }` |
| 测试 | `shared/webmcp` 单元测试，mock modelContext        |
| 兼容 | 扩展壳 MAIN world + launcher 沙箱                  |

---

## 6. API 摘要

```typescript
interface GME_WebMcpToolDefinition {
  /** 短名 only：^[a-z][a-z0-9_]{0,63}$ */
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>
  annotations?: { readOnlyHint?: boolean }
  title?: string
}

declare function GME_registerWebMcpTool(definition: GME_WebMcpToolDefinition, options?: { signal?: AbortSignal }): Promise<GME_RegisterWebMcpToolResult>
```

### 作者示例

```typescript
void GME_registerWebMcpTool({
  name: 'toggle_danmaku',
  description: 'Show or hide bullet comments on the current video player.',
  inputSchema: {
    type: 'object',
    properties: { visible: { type: 'boolean' } },
    required: ['visible'],
  },
  annotations: { readOnlyHint: false },
  execute: async ({ visible }) => {
    // DOM 逻辑
    return { ok: true, visible: Boolean(visible) }
  },
})
// → vws.<scriptKey>.toggle_danmaku
```

---

## 7. 验收标准

### 7.1 自动测试

- [ ] localName 校验通过/拒绝用例
- [ ] canonical 名构建正确
- [ ] 注册成功写入 registry；abort 后删除
- [ ] duplicate 拒绝
- [ ] 无 modelContext 时返回 `unsupported`

### 7.2 手动验证

- [ ] WebMCP flag 开启后，测试脚本注册工具
- [ ] `listTools` / `getTools` 可见 `vws.*` 名称
- [ ] `__VWS_WEBMCP_TOOL_REGISTRY__` 含对应 record
- [ ] `executeTool` 触发脚本 `execute` 并返回 JSON 可序列化结果

### 7.3 文档

- [x] 技术规格 `.ai/specs/preset-gme-webmcp.md` 与实现一致
- [x] P1：`scripts-ai-skill.md` 更新
- [x] `gme-webmcp-skill.md` + MCP resource

---

## 8. 分阶段交付

### P0 — 实现（本任务首选）

- [x] `shared/webmcp/*`
- [x] `GME_registerWebMcpTool` + `global-registry`
- [x] typings + 单元测试

### Phase P1 — 文档与示例

- [x] `scripts-ai-skill.md` WebMCP 小节
- [x] `scripts_runtime_summary` capability（`integrationPaths` + `gmeApis.webMcp`）
- [x] MCP resource `skill://magickmonkey/gme-webmcp-skill.md`
- [x] `.cursor/skills/scripts-api-mcp/SKILL.md` 三条路径说明
- [x] 仓库内示例脚本片段 `docs/examples/gme-webmcp-toggle-danmaku.ts`

---

## 9. 已决事项（原开放问题）

| #               | 决策                                          |
| --------------- | --------------------------------------------- |
| D1 localName    | **拒绝**非法名；模式 `^[a-z][a-z0-9_]{0,63}$` |
| D2 代码位置     | **`shared/webmcp/`** + preset 薄封装          |
| D3 Tampermonkey | **仅文档**说明限制，不做 TM polyfill          |
| D4 注册表符号   | **`__VWS_WEBMCP_TOOL_REGISTRY__` 为稳定契约** |

---

## 10. 依赖与风险

| 依赖                 | 说明                                  |
| -------------------- | ------------------------------------- |
| Chrome WebMCP flag   | 用户需开启实验 flag；API 不存在时降级 |
| `__VWS_SCRIPT_KEY__` | 扩展注入路径由 launcher 提供          |
| 下游扩展 Agent       | 本 API 可独立交付；Agent 后接         |

| 风险                  | 缓解                           |
| --------------------- | ------------------------------ |
| WebMCP 规范变动       | feature detect；共享层单点维护 |
| 多脚本同名 localName  | scriptKey 段隔离               |
| Origin isolation 失败 | warn + unsupported             |

---

## 11. 修订记录

| 日期       | 说明                                                                    |
| ---------- | ----------------------------------------------------------------------- |
| 2026-07-09 | 初稿：从 extension-webmcp-agent 拆出                                    |
| 2026-07-09 | 强制插件标识 `vws.{scriptKey}.*` + 注册表                               |
| 2026-07-09 | 状态改为 READY；补充 FR/验收；技术规格 `.ai/specs/preset-gme-webmcp.md` |
