# 编辑器 WebMCP — 需求文档

Status: **TODO**（需求待确认 / 待排期；**不改代码**）

关联:

- [Chrome WebMCP 文档](https://developer.chrome.com/docs/ai/webmcp)
- [WebMCP vs HTTP MCP](https://developer.chrome.com/docs/ai/webmcp/compare-mcp)
- `.cursor/skills/scripts-api-mcp/SKILL.md` — 现有 HTTP MCP / REST 契约（**非** WebMCP）
- `app/api/mcp/` — HTTP MCP Server（Cursor / VS Code 等外部客户端）
- `app/editor/` — WebMCP 主要落点
- `.ai/tasks/backlog/agent-chat-panel.md` — 服务端 Agent 聊天框（互补，非替代）

---

## 1. 背景与问题

### 1.1 现状

MagickMonkey 已提供 **HTTP MCP**（`/api/mcp`），供 Cursor、VS Code 等**外部 Agent** 在无浏览器 Tab 的情况下读写 GitHub Gist 中的用户脚本。编辑器（`/editor`）另有完整的 UI 状态层：

- Monaco buffer（含**未保存**修改）
- TabBar、FileListPanel
- IndexedDB 本地缓存
- AI 改写面板（diff 预览）
- URL Rules 面板
- Dev Mode → Tampermonkey preset 实时推送
- 发布流程（ALPHA debug / STABLE / OTA lock）

这些状态**HTTP MCP 无法感知**，外部 Agent 只能操作 Gist 持久层，无法代表用户操作「眼前看到的编辑器」。

### 1.2 WebMCP 是什么

**WebMCP**（Web Model Context Protocol）是 Google / Chrome 提出的**浏览器原生 API**（`document.modelContext.registerTool`），让网站在**用户打开 Tab 期间**向 Chrome 内置 Agent 暴露结构化工具。

| 维度       | HTTP MCP（已有）       | WebMCP（本需求）                  |
| ---------- | ---------------------- | --------------------------------- |
| 运行位置   | Next.js 服务端         | 浏览器 Tab 内客户端 JS            |
| 协议       | JSON-RPC over HTTP     | `document.modelContext`           |
| 生命周期   | 持久，随时可调用       | **临时**，Tab 关闭即失效          |
| 典型消费者 | Cursor、CI、云端 Agent | **Chrome 内置 Agent**             |
| 会话       | Cookie 或 `x-api-key`  | **自动继承**浏览器 Session        |
| 支持原语   | Tools + Resources      | **目前仅 Tools**                  |
| 核心价值   | Gist 仓库 CRUD、自动化 | **编辑器 UI / buffer / 会话**操作 |

**本需求不是**把 HTTP MCP 再包一层，而是为 `/editor` 定义一套**页面语义**的 `editor_*` 工具，与 `scripts_*` 明确分工。

### 1.3 要解决的问题

当用户**正在浏览器中编辑脚本**时，Chrome Agent 应能：

1. 读取当前会话状态（打开哪些 Tab、谁有未保存修改、当前 buffer 内容）
2. 在 buffer 层安全地改代码（而非直接写 Gist）
3. 触发编译校验、展示 diff、经用户确认后发布
4. 操作 Dev Mode、Rules 面板等**仅存在于浏览器**的能力

---

## 2. 目标与非目标

### 2.1 目标

- 在 `/editor`（已登录）页面注册 WebMCP 工具，供 Chrome Agent 发现与调用
- 工具命名统一 `editor_*` 前缀，语义为**页面 / 会话 / UI**，而非 Gist 文件 API
- 与现有 React Context（`FileStateContext`、`TabBarContext`、`LayoutContext` 等）桥接，**复用业务逻辑**，不重复实现 Gist CRUD
- 写操作（落盘 Gist、发布 STABLE、OTA lock）走与 UI 相同的确认策略
- 不支持 WebMCP 的浏览器正常降级，不影响现有编辑器功能

### 2.2 非目标

- **不**复制 HTTP MCP 的 `scripts_list` / `scripts_get` / `scripts_patch` 等工具
- **不**替代 HTTP MCP 或 Cursor 集成
- **不**在本阶段实现服务端 Agent 聊天框（见 `agent-chat-panel.md`）
- **不**在 `/login` 或未鉴权页面注册敏感工具
- **不**支持 headless / 无 Tab 调用
- **不**实现 WebMCP Resources / Prompts（规范暂不支持）

---

## 3. 用户与场景

| 角色         | 场景                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| 脚本管理员   | 开着 `/editor`，对 Chrome Agent 说「看当前文件，把 @match 改成 example.com，编译通过后帮我发布 debug」 |
| 脚本管理员   | Agent 读取 buffer 中未保存修改，展示 diff，用户确认后 Save as debug                                    |
| 脚本管理员   | 切换 Dev Mode，保存后推送到 Tampermonkey preset 做 live 调试                                           |
| 脚本管理员   | 为当前脚本在 Rules 面板添加 wildcard 规则                                                              |
| Chrome Agent | 需要结构化工具而非猜测 DOM 按钮位置                                                                    |

**不在范围**：用户不在浏览器、或 Cursor 里批量改 10 个 Gist 文件 → 继续用 **HTTP MCP**。

---

## 4. 编辑器页面能力盘点（WebMCP 作用域）

```text
/editor
├── EditorHeader
│   ├── 集成文档（MCP/OpenAPI）          → 非 WebMCP
│   ├── 快捷键帮助                       → 低优先级 / 跳过
│   ├── Rules / AI 面板开关              → WebMCP
│   ├── Dev Mode                         → WebMCP
│   ├── Chrome Extension 连接            → P2
│   ├── Tampermonkey 安装（外链）        → 跳过
│   ├── 发布（ALPHA / STABLE）           → WebMCP（需确认）
│   └── 用户菜单（OTA lock/unlock、登出）→ lock/unlock 可选；登出跳过
│
└── ScriptEditorContent
    ├── FileListPanel（树、搜索、新建/删/改名、Reset to Online、Local Map）
    ├── TabBar
    ├── Monaco Editor（buffer、Cmd+S、navigateToLine）
    └── 右侧面板：AIPanel / RulePanel
```

### 4.1 仅浏览器存在的 state（WebMCP 独有信息）

| State                                          | 来源                       |
| ---------------------------------------------- | -------------------------- |
| 打开 Tab、active Tab                           | `TabBarContext`            |
| originalContent vs modifiedContent、FileStatus | `FileStateContext`         |
| IndexedDB 本地持久化                           | `useFileStorage`           |
| 右侧面板类型（ai / rules / null）              | `LayoutContext`            |
| Dev Mode、editorHostId                         | `Editor.tsx`               |
| Rules（React state，落盘随 publish）           | `Editor.tsx` + `RulePanel` |
| AI 改写历史与 pending diff                     | `AIPanel`                  |
| activeScriptOta                                | `EditorContent`            |
| Extension 连接状态                             | `EditorHeader`             |
| Local Map 模式                                 | `LocalMapContext`          |

---

## 5. 与 HTTP MCP 的边界

```text
HTTP MCP 回答：「Gist 仓库里有什么？怎么改持久化文件？」
WebMCP  回答：「用户眼前编辑器里是什么？怎么帮用户操作界面与 buffer？」
```

| 用户意图                             | 推荐通道                                                 |
| ------------------------------------ | -------------------------------------------------------- |
| 列出 Gist 全部脚本（用户不在编辑器） | HTTP MCP `scripts_list`                                  |
| 当前 buffer 有没有未保存修改         | WebMCP `editor_get_session`                              |
| 批量 patch 10 个 Gist 文件           | HTTP MCP `scripts_batch_patch`                           |
| 改当前打开文件并 preview diff 再发布 | WebMCP 工具链                                            |
| 查询 preset GM\_\* API               | HTTP MCP `scripts_runtime_summary`（或 WebMCP 只读转发） |

**实现原则**：Gist 写入最终仍走现有 `saveScriptFiles` / `handlePublish` 等；WebMCP 对外暴露**页面动词**，不暴露 REST 路径。

### 5.1 Page Handle Slot 注册规范

页面能力下放到不同组件时，用 **不同 slot 名** 分工，**不做 tier / 优先级栈**。

| 规则     | 说明                                                                       |
| -------- | -------------------------------------------------------------------------- |
| 一名一主 | 每个 `EditorPageSlot` 同时只允许 **一个** `useEditorPageSlot` 注册         |
| 重名拒绝 | 相同 slot 名再次注册 → `console.warn` + **拒绝**（不覆盖）                 |
| 整包注册 | 一个 slot 的对象（如整个 `PublishSlot`）由唯一 Owner 组件提供              |
| 能力拆分 | 需要多个组件协作时，由 Owner 内部 compose，或扩展 **新 slot 名**           |
| 挂载位置 | 必须在对应 Provider 子树内（如 `buffer`/`tabs` 在 `FileStateProvider` 下） |

**推荐 Owner（新增/变更须同步本表）：**

| Slot      | Owner                   | 备注                                  |
| --------- | ----------------------- | ------------------------------------- |
| `session` | `EditorContent`（目标） | smoke 阶段暂在 `EditorPageWebMcpHost` |
| `tabs`    | `ScriptEditorContent`   | 依赖 `TabBarProvider`                 |
| `buffer`  | `ScriptEditorContent`   | 依赖 `FileStateProvider`              |
| `monaco`  | `InternalCodeEditor`    | Monaco ref                            |
| `publish` | `EditorContent`         | compile / debug / stable              |
| `devMode` | `EditorContent`         | Dev Mode + preset 推送                |
| `layout`  | `EditorHeaderWrapper`   | 右侧面板开关                          |
| `ai`      | `AIPanel`               | 面板 mount 时注册                     |
| `rules`   | `RulePanel`             | 面板 mount 时注册                     |

**反模式：** 两个组件注册同一 slot 名；用「覆盖」表达分工；在 `FileStateProvider` 外注册 `buffer`。

---

## 6. WebMCP 工具需求清单

工具均在**已登录且 `/editor` 已渲染**时注册；登出或路由离开时 `AbortSignal` 注销。

图例：**P0** MVP · **P1** 第二阶段 · **P2** 可选 · **—** 不做

### 6.1 会话感知（只读）

| Tool                       | 描述                                                                            | 优先级 | readOnlyHint |
| -------------------------- | ------------------------------------------------------------------------------- | ------ | ------------ |
| `editor_get_session`       | 会话快照：open tabs、active、dirty 文件、右侧面板、dev mode、extension 状态摘要 | **P0** | true         |
| `editor_list_open_tabs`    | 打开 Tab 及 unsaved 标记                                                        | **P0** | true         |
| `editor_get_active_buffer` | 当前 active 文件 buffer（modifiedContent、status、与 original 差异摘要）        | **P0** | true         |
| `editor_get_file_buffer`   | 指定文件 buffer                                                                 | **P0** | true         |
| `editor_list_dirty_files`  | 所有未保存文件路径                                                              | **P0** | true         |
| `editor_get_layout`        | 面板宽度、右侧 panel 类型                                                       | P1     | true         |
| `editor_get_active_ota`    | 当前脚本 OTA stage / lockedVersion                                              | P1     | true         |
| `editor_get_selection`     | Monaco 选区（行/列）                                                            | P2     | true         |

### 6.2 Tab / 导航

| Tool                      | 描述               | 优先级 |
| ------------------------- | ------------------ | ------ |
| `editor_open_tab`         | 打开并聚焦文件 Tab | **P0** |
| `editor_switch_tab`       | 切换到已打开 Tab   | **P0** |
| `editor_close_tab`        | 关闭 Tab           | P1     |
| `editor_close_other_tabs` | 关闭除当前外 Tab   | P2     |

### 6.3 Buffer 编辑（本地，默认不落 Gist）

| Tool                      | 描述                          | 优先级 |
| ------------------------- | ----------------------------- | ------ |
| `editor_apply_buffer`     | 写入指定或 active 文件 buffer | **P0** |
| `editor_apply_patch`      | 对 buffer 做 search/replace   | P1     |
| `editor_discard_changes`  | 单文件恢复 originalContent    | P1     |
| `editor_navigate_to_line` | 跳转并高亮行                  | P1     |
| `editor_create_file`      | 新建文件并打开 Tab            | P1     |
| `editor_rename_file`      | 重命名（buffer 层）           | P1     |
| `editor_delete_file`      | 标记删除（buffer 层）         | P1     |

### 6.4 保存与发布

| Tool                     | 描述                             | 优先级 | 确认                         |
| ------------------------ | -------------------------------- | ------ | ---------------------------- |
| `editor_save_local`      | Cmd+S：IndexedDB + Dev Mode 推送 | P1     | 否                           |
| `editor_compile_active`  | 编译校验，返回错误 or compiled   | P1     | 否                           |
| `editor_publish_debug`   | Save as debug (ALPHA)            | P1     | 建议                         |
| `editor_publish_stable`  | 当前 active 发布 STABLE          | P1     | **必须**（复用现有 confirm） |
| `editor_lock_version`    | Fleet-lock @version              | P2     | **必须**                     |
| `editor_unlock_version`  | 解除 lock                        | P2     | **必须**                     |
| `editor_reset_to_online` | 清 IndexedDB，从 Gist 重载       | P2     | **必须**                     |

### 6.5 Dev Mode / 浏览器联动

| Tool                         | 描述                         | 优先级 |
| ---------------------------- | ---------------------------- | ------ |
| `editor_get_dev_mode`        | Dev Mode 状态与 hostId       | P1     |
| `editor_toggle_dev_mode`     | 开关 Dev Mode                | P1     |
| `editor_push_dev_mode`       | 编译并 postMessage 到 preset | P1     |
| `editor_push_script_update`  | 触发 open tabs 热更新        | P2     |
| `editor_get_extension_state` | Extension 连接状态           | P2     |
| `editor_connect_extension`   | 连接 Extension               | P2     |

### 6.6 AI 改写面板

| Tool                         | 描述                           | 优先级 |
| ---------------------------- | ------------------------------ | ------ |
| `editor_toggle_ai_panel`     | 开关 AI 面板                   | P1     |
| `editor_ai_rewrite`          | 对 active 文件发起 Gemini 改写 | P1     |
| `editor_ai_get_pending_diff` | 获取未 apply 的 AI 结果        | P1     |
| `editor_ai_apply_diff`       | Accept diff 写入 buffer        | P1     |
| `editor_ai_reject_diff`      | 丢弃 AI 结果                   | P2     |

### 6.7 URL Rules 面板

| Tool                          | 描述                     | 优先级 |
| ----------------------------- | ------------------------ | ------ |
| `editor_toggle_rules_panel`   | 开关 Rules 面板          | P1     |
| `editor_get_rules_for_script` | 当前 active 脚本的 rules | P1     |
| `editor_add_rule`             | 新增 wildcard 规则       | P1     |
| `editor_update_rule`          | 修改 rule wildcard       | P1     |
| `editor_delete_rule`          | 删除 rule                | P2     |

Rules 变更须同步更新 `ENTRY_SCRIPT_RULES_FILE` 的 fileState。

### 6.8 明确不做

| 功能                                    | 原因                                        |
| --------------------------------------- | ------------------------------------------- |
| `scripts_*` 全套 Gist CRUD              | HTTP MCP 已有                               |
| MCP/OpenAPI 安装弹窗                    | 文档，非 Agent 操作                         |
| 登出                                    | 安全敏感，用户手动                          |
| Tampermonkey 安装链接                   | 外链跳转                                    |
| `editor_map_to_local` / sync from local | File System Access 需用户手势，Agent 难满足 |
| 跨文件批量 Gist patch                   | HTTP MCP `scripts_batch_patch`              |

---

## 7. 典型 Agent 工作流（验收参考）

### 7.1 改当前文件并发布 debug

```text
1. editor_get_session
2. editor_get_active_buffer
3. editor_apply_buffer({ content })
4. editor_compile_active → 失败则继续修改
5. （可选）editor_toggle_ai_panel + editor_ai_rewrite + editor_ai_apply_diff
6. 用户确认
7. editor_publish_debug
8. editor_push_script_update（可选）
```

### 7.2 打开文件、改 rules、再保存

```text
1. editor_open_tab("foo.ts")
2. editor_toggle_rules_panel
3. editor_add_rule({ wildcard: "https://example.com/*" })
4. editor_publish_debug
```

---

## 8. 安全与鉴权

| 项                      | 要求                                                           |
| ----------------------- | -------------------------------------------------------------- |
| 注册时机                | 仅 `/editor` 鉴权通过后挂载 `WebMcpProvider`                   |
| 未登录                  | 不注册任何 `editor_*` 工具（依赖 `checkAccess` redirect）      |
| 登出 / unmount          | `AbortController.abort()` 注销全部工具                         |
| 写 Gist / STABLE / lock | 复用现有 `window.confirm` 或等价 UI 确认                       |
| execute 纵深防御        | 写工具内再次校验 session / file 可写                           |
| 密钥                    | 不向客户端暴露 `SCRIPTS_MCP_HEADERS`；WebMCP 用 Session Cookie |
| agentInvoked            | 若使用 Declarative API，**不得**仅凭 `agentInvoked` 提升权限   |

---

## 9. 技术方案概要

### 9.1 架构

```text
Chrome Agent
    ↓ document.modelContext（浏览器内）
WebMcpProvider（Client Component，/editor）
    ↓ EditorWebMcpBridge（聚合 Context + refs + callbacks）
现有模块：FileState / TabBar / Layout / EditorContent handlers
    ↓ Server Actions / fetch（与 UI 相同路径）
GitHub Gist / compile / preset postMessage
```

### 9.2 建议文件（实现阶段）

```text
lib/webmcp/
  featureDetect.ts
  types.d.ts
  registerEditorTools.ts
  editorToolSchemas.ts          # JSON Schema（与 HTTP MCP 的 scripts-function-tools 分离）

app/editor/components/
  WebMcpProvider.tsx
  EditorWebMcpBridge.tsx        # Context：暴露 bridge API 给 registerEditorTools
```

### 9.3 需改造点

| 项                   | 说明                                                              |
| -------------------- | ----------------------------------------------------------------- |
| `EditorWebMcpBridge` | 聚合 fileState、tabBar、layout、EditorContent 回调                |
| `AIPanel`            | 暴露 rewrite / apply / pending diff 的 imperative API             |
| `CodeEditorRef`      | P2：扩展 `getSelection()`                                         |
| Rules                | `onRulesChange` 同步写 rules 文件到 fileState                     |
| Monaco ref           | `WebMcpProvider` 需能访问 `codeEditorRef`（下沉或 callback 注册） |

### 9.4 环境与前缀

- API：`document.modelContext.registerTool`（Chrome 150+；150 前 `navigator.modelContext` 已 deprecated）
- 特性检测：`if (document.modelContext?.registerTool)`
- 本地调试：`chrome://flags/#enable-webmcp-testing`
- 生产：Chrome Origin Trial（约 149–156）或正式版（约 157+）
- HTTPS：Vercel 部署已满足 Secure Context

### 9.5 HTTP Headers（待评估）

WebMCP 要求 **Origin-Isolated** 文档，可能需：

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp  # 或 credentialless，需验证 Monaco/CDN 影响
Permissions-Policy: tools=(self)
```

**实施前必须**评估 COEP 对编辑器第三方资源的影响；若阻塞，可先仅本地 flag 验证 P0。

---

## 10. 分阶段交付

### Phase 0 — 调研验证（无生产依赖）

- [ ] 本地 Chrome flag 开启 WebMCP
- [ ] 在 `/editor` 注册 1 个只读 tool（`editor_get_session`）
- [ ] 用 [Model Context Tool Inspector Extension](https://developer.chrome.com/docs/ai/webmcp) 验证 discover / execute
- [ ] 评估 COEP 对 `/editor` 的影响

### Phase 1 — MVP（P0 工具）

- [ ] `WebMcpProvider` + feature detect + 登录 gating
- [ ] P0 只读：session、tabs、buffer、dirty list
- [ ] P0 导航：`editor_open_tab`、`editor_switch_tab`
- [ ] P0 编辑：`editor_apply_buffer`
- [ ] P0 校验：`editor_compile_active`
- [ ] 文档：工具列表与 HTTP MCP 边界说明

### Phase 2 — 编辑闭环（P1）

- [ ] discard / patch / create / rename / delete
- [ ] save_local、publish_debug、publish_stable（确认流）
- [ ] Dev Mode 三件套
- [ ] AI 面板桥接
- [ ] Rules 面板桥接

### Phase 3 — 增强（P2）

- [ ] OTA lock/unlock、reset_to_online
- [ ] Extension 状态、selection API
- [ ] Origin Trial token 与生产 Headers

---

## 11. 验收标准

### 11.1 功能

- [ ] 未登录访问 `/editor` 时，DevTools 中 `document.modelContext.getTools()` 无 `editor_*` 工具
- [ ] 已登录 `/editor`，Agent 可 discover P0 工具列表
- [ ] `editor_get_active_buffer` 返回内容与 Monaco 显示一致（含未保存修改）
- [ ] `editor_apply_buffer` 后 UI 与 fileState 同步，**不**自动写 Gist
- [ ] `editor_publish_debug` 行为与点击「Save as debug」一致
- [ ] 登出或离开 `/editor` 后工具注销

### 11.2 非功能

- [ ] 不支持 WebMCP 的浏览器：编辑器功能无回归
- [ ] 无 `SCRIPTS_MCP_HEADERS` / `GEMINI_API_KEY` 泄露到 client bundle
- [ ] 工具 `description` 明确何时用 WebMCP vs 建议 HTTP MCP

### 11.3 文档

- [ ] 更新 `.ai/INDEX.md` 索引（已完成）
- [ ] 可选：新增 `public/docs/editor-webmcp-skill.md` 供 Agent 路由（实现阶段）

---

## 12. 风险与开放问题

| 风险                      | 缓解                                                    |
| ------------------------- | ------------------------------------------------------- |
| WebMCP 规范仍变动         | feature detect + 小步 P0                                |
| COEP 破坏 Monaco/CDN      | Phase 0 专项评估；可 defer 生产                         |
| AIPanel / Monaco ref 耦合 | Bridge 层隔离                                           |
| Agent 误用 publish_stable | 强制 confirm；tool description 写清                     |
| 与 agent-chat-panel 混淆  | 文档区分：WebMCP=Chrome Tab；Agent 聊天=服务端 LLM loop |

### 开放问题（待产品确认）

1. **P0 是否包含 `editor_publish_debug`？** 还是 MVP 仅 buffer + compile，发布一律人工点按钮？
2. **是否在 P1 提供 `editor_runtime_summary`？** 只读转发 HTTP MCP 摘要，还是 Agent 自行调 HTTP MCP？
3. **Declarative API**（登录 form 等）是否纳入首版？建议首版仅 Imperative API。
4. **Origin Trial** 何时申请？是否阻塞 Phase 1 合并？

---

## 13. 与相关任务关系

| 任务                      | 关系                                                          |
| ------------------------- | ------------------------------------------------------------- |
| HTTP MCP `/api/mcp`       | 互补；Gist 自动化仍走 HTTP MCP                                |
| `agent-chat-panel.md`     | 互补；服务端 Agent UI 可直接调 service 层，不必经 WebMCP      |
| `gist-script-rollback.md` | 未来可在 WebMCP 增加 `editor_show_history`（本需求未纳入）    |
| Chrome Extension          | WebMCP P2 可读 extension 状态；Extension 不实现 WebMCP Server |

---

## 14. 修订记录

| 日期       | 说明                                       |
| ---------- | ------------------------------------------ |
| 2026-07-07 | 初稿：基于编辑器代码盘点与 WebMCP 官方定位 |
