# Preset `GME_registerWebMcpTool` — 技术规格

Status: **P0 IMPLEMENTED**（与 `tasks/backlog/preset-gme-webmcp.md` 配套；P1 文档已同步）

关联:

- 需求：`.ai/tasks/backlog/preset-gme-webmcp.md`
- 下游消费：`.ai/tasks/backlog/extension-webmcp-agent.md` §5.4
- 可复用实现：`initializer/webmcp/`（编辑器侧，待抽取共享层）
- 全局注册：`preset/src/services/global-registry.ts`
- scriptKey 注入：`__VWS_SCRIPT_KEY__`（`shared/preset-launcher-decls.ts`）

---

## 1. 设计目标

在 preset OTA bundle 中提供 **`GME_registerWebMcpTool`**，使 Gist 用户脚本在页面 MAIN world 注册 WebMCP 工具，并满足：

1. 与站点原生 `document.modelContext.registerTool` **可区分**（`vws.{scriptKey}.{localName}` + 注册表）。
2. WebMCP 不可用时 **不阻断** 脚本其余逻辑（warn + no-op）。
3. 与 launcher 沙箱兼容（`__GLOBAL__` / `__VWS_SCRIPT_KEY__`）。
4. 共享逻辑与 Next.js 编辑器解耦（`shared/webmcp/`）。

---

## 2. 模块划分

```text
shared/webmcp/
├── constants.ts          # PROVIDER_ID, NAME_PREFIX, REGISTRY_KEY, canonical name regex
├── types.ts            # WebMcpToolDefinition, VwsWebMcpToolRecord, register result
├── model-context.ts    # getDocumentModelContext, isWebMcpSupported, support report
├── registry.ts         # getOrCreateRegistry, add/remove record (Map on global)
├── naming.ts           # validateLocalName, buildCanonicalName, parseCanonicalName
└── register-tool.ts    # registerVwsWebMcpTool (pure, testable)

preset/src/helpers/webmcp.ts
└── GME_registerWebMcpTool  # 读 scriptKey/scriptFile，调 shared，GME_warn

initializer/webmcp/       # 后续可选：re-export shared 或薄包装 editor 场景
```

**决策 D2（已定）**：核心逻辑放 **`shared/webmcp/`**，preset 与 `initializer/webmcp` 均依赖；避免 preset 内联复制。

---

## 3. 稳定契约（扩展 / Agent 依赖）

### 3.1 全局注册表

| 符号                           | 类型                               | 说明                                  |
| ------------------------------ | ---------------------------------- | ------------------------------------- |
| `__VWS_WEBMCP_TOOL_REGISTRY__` | `Map<string, VwsWebMcpToolRecord>` | **稳定对外契约**；key = canonicalName |

```typescript
interface VwsWebMcpToolRecord {
  providerId: 'magickmonkey'
  canonicalName: string
  localName: string
  scriptKey: string
  scriptFile: string
  description: string
  readOnlyHint: boolean
  registeredAt: number
}
```

扩展 background 在 `WEBMCP_LIST_TOOLS` 时读取该 Map，与 `listTools()` 合并 `provider` 字段（见 `extension-webmcp-agent.md`）。

### 3.2 命名常量

| 常量                      | 值                                       |
| ------------------------- | ---------------------------------------- |
| `VWS_WEBMCP_PROVIDER_ID`  | `'magickmonkey'`                         |
| `VWS_WEBMCP_NAME_PREFIX`  | `'vws'`                                  |
| `VWS_WEBMCP_TITLE_PREFIX` | `'MagickMonkey'`                         |
| Canonical 模式            | `^vws\.([^.]+)\.([a-z][a-z0-9_]{0,63})$` |

### 3.3 提供方判定（扩展侧复用）

```typescript
function classifyWebMcpToolProvider(name: string, registry: Map<string, VwsWebMcpToolRecord>): 'magickmonkey' | 'native' | 'unknown' {
  if (registry.has(name)) return 'magickmonkey'
  if (/^vws\.[^.]+\.[a-z][a-z0-9_]{0,63}$/.test(name)) return 'unknown'
  return 'native'
}
```

---

## 4. 运行时上下文

### 4.1 scriptKey

读取顺序（与 `preset/src/helpers/logger.ts` / `launcher-script-url.ts` 一致）：

1. `__VWS_SCRIPT_KEY__`（launcher 注入；扩展路径必有）
2. `window.__VWS_PAGE_CONFIG__?.scriptKey`
3. 从 `__SCRIPT_URL__` 解析 `/static/{scriptKey}/`

若仍为空 → **拒绝注册**，`GME_warn('[WebMCP] missing scriptKey; skip register')`，返回 `{ ok: false, reason: 'missing_script_key' }`。

### 4.2 scriptFile

读取顺序：

1. `GM_info?.script?.name`（Tampermonkey 兼容）
2. `GM_info?.script?.namespace` + `GM_info?.script?.name` 组合（若需要）
3. 回退 `unknown`

用于注册表 `scriptFile` 字段与日志；**不参与** canonical name。

### 4.3 Global 根对象

与 `registerGlobals()` 相同：

```typescript
const g = typeof __GLOBAL__ !== 'undefined' ? __GLOBAL__ : globalThis
```

注册表挂在 `g.__VWS_WEBMCP_TOOL_REGISTRY__`（与 `g` 同源，确保 Gist 与 preset 同沙箱可见）。

---

## 5. API 行为规格

### 5.1 入口

```typescript
declare function GME_registerWebMcpTool(definition: GME_WebMcpToolDefinition, options?: { signal?: AbortSignal }): Promise<GME_RegisterWebMcpToolResult>

interface GME_RegisterWebMcpToolResult {
  ok: boolean
  canonicalName?: string
  reason?: 'unsupported' | 'missing_script_key' | 'invalid_local_name' | 'duplicate' | 'register_failed'
  message?: string
}
```

### 5.2 localName 校验（决策 D1：拒绝）

- 模式：`^[a-z][a-z0-9_]{0,63}$`（小写 snake_case）
- 禁止：以 `vws` 开头、含 `.`、空串、超 64 字符
- 失败：`ok: false`, `reason: 'invalid_local_name'`, `GME_warn` 带建议

作者若传入 `vws.foo.bar`，API **剥离**或拒绝——**拒绝**（避免与 canonical 混淆）。

### 5.3 注册流程

```text
GME_registerWebMcpTool(def, { signal })
  ├─ resolve scriptKey / scriptFile
  ├─ validate localName
  ├─ canonicalName = `vws.${scriptKey}.${localName}`
  ├─ if registry.has(canonicalName) → duplicate error
  ├─ if !isWebMcpSupported() → warn, return unsupported (不 throw)
  ├─ build WebMcpToolDefinition for modelContext:
  │     name: canonicalName
  │     title: def.title ?? `MagickMonkey · ${localName}`
  │     description, inputSchema, execute (wrapped), annotations
  ├─ await modelContext.registerTool(..., { signal })
  ├─ registry.set(canonicalName, record)
  ├─ signal abort → registry.delete(canonicalName)
  └─ return { ok: true, canonicalName }
```

### 5.4 execute 包装

```typescript
async function wrappedExecute(input: Record<string, unknown>) {
  try {
    const result = await definition.execute(input)
    return result
  } catch (error) {
    return {
      ok: false,
      error: 'tool_execute_failed',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
```

保证 Agent 收到结构化错误，而非未处理 rejection（WebMCP 实现因浏览器而异，包装层统一形状）。

### 5.5 去重

- 同一 `canonicalName` 二次注册 → `duplicate`，不覆盖
- 不同 `localName`、同一 scriptKey → 允许
- 不同 scriptKey 同页（多 bundle）→ 靠 scriptKey 段隔离

---

## 6. WebMCP 检测

复用/迁移 `initializer/webmcp/modelContext.ts` 逻辑至 `shared/webmcp/model-context.ts`：

- `document.modelContext.registerTool` 优先
- 回退 `navigator.modelContext.registerTool`（旧 Chromium）
- `isWebMcpSupported()`：存在 `registerTool` 且 `window.isSecureContext`

不支持时 **单次 warn**（可按 tool 或按页面去重，实现用 `WeakSet` 记页面）。

---

## 7. Preset 集成

### 7.1 `preset/src/helpers/webmcp.ts`

- 导出 `GME_registerWebMcpTool`
- 内部调用 `registerVwsWebMcpTool` from `@shared/webmcp/register-tool`
- 使用 `GME_warn` from `@/helpers/logger`

### 7.2 `global-registry.ts`

在 `Object.assign(g, { ... })` 增加：

```typescript
GME_registerWebMcpTool,
```

确保 `document-start` 运行的 Gist 脚本在 preset IIFE 之后可调用。

### 7.3 `editor-typings.d.ts`

增加 `GME_WebMcpToolDefinition`、`GME_RegisterWebMcpToolResult`、`GME_registerWebMcpTool` 声明；运行 `build:preset` 同步 generated typings。

### 7.4 Bundle 体积

`shared/webmcp` 应保持无 React/DOM UI 依赖；仅 `modelContext` + Map + 校验。

---

## 8. Tampermonkey 路径（决策 D3）

- **不实现** TM 专用 polyfill
- `scripts-ai-skill.md` 注明：**扩展壳 + WebMCP flag** 下可用；纯 TM 安装无 `__VWS_SCRIPT_KEY__` 时可能 `missing_script_key`

---

## 9. 测试计划

| 用例                                      | 位置                                       |
| ----------------------------------------- | ------------------------------------------ |
| `validateLocalName` 合法/非法             | `__tests__/shared/webmcp-naming.spec.ts`   |
| `buildCanonicalName`                      | 同上                                       |
| `classifyWebMcpToolProvider`              | 同上                                       |
| `registerVwsWebMcpTool` mock modelContext | `__tests__/shared/webmcp-register.spec.ts` |
| duplicate / abort 清理 registry           | 同上                                       |
| missing scriptKey → unsupported path      | 同上                                       |

不依赖真实 Chrome WebMCP flag；`document.modelContext` 用 jest mock。

---

## 10. 实现清单（Phase P0–P1）

### P0 — 核心

- [x] `shared/webmcp/*` 模块
- [x] `preset/src/helpers/webmcp.ts` + `global-registry.ts` 挂载
- [x] `editor-typings.d.ts` + regenerate（typings 源已更新；`build:preset` 时同步 generated）
- [x] `__tests__/shared/webmcp-*.spec.ts`
- [ ] 从 `initializer/webmcp/modelContext.ts` 迁出或 re-export shared（编辑器侧后续 PR，不阻塞 P0）

### P1 — 文档

- [x] `public/docs/scripts-ai-skill.md` — WebMCP / `GME_registerWebMcpTool` 小节
- [x] `services/scripts/scriptMcpTools.ts` — `scripts_runtime_summary` 增加 `integrationPaths` + `gmeApis.webMcp`
- [x] `public/docs/gme-webmcp-skill.md` — 脚本作者速查 + MCP resource
- [x] 示例片段：`docs/examples/gme-webmcp-toggle-danmaku.ts`（仓库内参考，非 Gist）
- [x] `.cursor/skills/scripts-api-mcp/SKILL.md` — 三条集成路径
- [x] `app/api/mcp/skillResources.ts` — `gme-webmcp-skill.md` resource

---

## 11. 验证步骤（手动）

1. Chrome `chrome://flags/#enable-webmcp-testing` → Enabled，重启
2. 扩展加载带测试脚本的页面（脚本内 `GME_registerWebMcpTool`）
3. 控制台：`globalThis.__VWS_WEBMCP_TOOL_REGISTRY__`
4. 控制台：`await navigator.modelContextTesting?.listTools?.()` 含 `vws.{scriptKey}.*`
5. `executeTool` 返回脚本 `execute` 结果

---

## 12. 修订记录

| 日期       | 说明                                               |
| ---------- | -------------------------------------------------- |
| 2026-07-09 | 初版技术规格：shared/webmcp 模块、契约、集成与测试 |
