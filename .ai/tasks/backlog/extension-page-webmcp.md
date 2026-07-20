# 扩展内置页面理解 / 控制（`vws.page.*`）— 需求文档

Status: **IN PROGRESS**（技术规格：`.ai/specs/extension-page-webmcp.md`；2026-07-19 review 通过；P0 实现已落地核心路径，待手工验收）

关联:

- **技术规格**：`.ai/specs/extension-page-webmcp.md`
- 上游已实现：`.ai/tasks/backlog/extension-webmcp-agent.md`（Side Panel Agent + WebMCP 代理）
- 上游已实现：`.ai/tasks/backlog/preset-gme-webmcp.md`（`GME_registerWebMcpTool` / `vws.{scriptKey}.*`）
- 上游规格：`.ai/specs/extension-webmcp-agent.md`（D3：Agent **不**自动 scrape；无工具时诊断）
- 参考实现：[`alibaba/page-agent`](https://github.com/alibaba/page-agent) 的 **`@page-agent/page-controller`**（仅控制器层）
- 互补（**非本需求**）：`.ai/tasks/backlog/editor-webmcp.md`（`editor_*` / 站点构建器语义桥）

---

## 0. 产品决策（已确认）

| #      | 问题       | **已决定**                                                                                                  |
| ------ | ---------- | ----------------------------------------------------------------------------------------------------------- |
| **P1** | 交付形态   | **A. 扩展内置**：符合注入门槛时，扩展在 MAIN world **自动**注册 `vws.page.*`                                |
| **P2** | 权限边界   | **仅**沿用「该站允许 MagickMonkey 脚本注入」；**不**再做独立 Agent「读页授权」                              |
| **P3** | DOM 引擎   | 复用 **`@page-agent/page-controller`**（索引化 DOM + click/input/scroll）；**不**嵌入 `PageAgent` UI/LLM 环 |
| **P4** | 运行时     | **当前已登录 Tab**；**不**引入 Playwright / CDP / 独立浏览器会话                                            |
| **P5** | 与 D3 关系 | Agent **仍不**把 DOM 塞进 system prompt；读页 **只**经显式工具调用（`vws.page.snapshot` 等）                |
| **P6** | 敏感存储   | 内置工具 **永不**暴露 Cookie / `localStorage` / `sessionStorage`；用户可自写脚本另做                        |
| **P7** | 写操作     | 继续走现有 `confirmBeforeWriteTools`（`readOnlyHint !== true` 需确认）                                      |

---

## 1. 问题陈述

扩展 Side Panel Agent 已能发现并调用当前 Tab 的 WebMCP 工具，但：

| 能力                | 现状                         | 缺口                                                     |
| ------------------- | ---------------------------- | -------------------------------------------------------- |
| 通用「看见页面」    | 依赖各站脚本自行注册只读工具 | 普通站点无脚本工具时，无法回答「几个 H1 / 填哪个输入框」 |
| 通用「点击 / 填写」 | 无统一索引动作层             | 只能靠站点专用工具；表单类任务难做                       |
| 权限心智            | 注入开关 + 写工具确认        | 若再加「Agent 读页授权」会三层叠乱（已否决）             |

本需求补齐：**在允许脚本注入的站点上，提供一套内置、可控、可撤销（关注入即消失）的通用页面工具**，让 Agent 在无站点专用工具时仍能理解并操作可见 UI。

**完成标准**：在已开启 User Scripts、且该 origin 允许 MagickMonkey 注入的 http(s) Tab 上，Side Panel `listTools` 可见 `vws.page.*`；Agent 可经工具拿到索引化页面摘要，并在用户确认后执行 click / fill 等写操作；全程不启动 Playwright/CDP，不嵌入阿里 PageAgent 聊天 UI。

---

## 2. 定位与边界

```text
用户允许该站脚本注入
        ↓
扩展 MAIN world 注册 vws.page.*（page-controller）
        ↓
Side Panel Agent（现有 LLM loop）
        ↓
WEBMCP_LIST_TOOLS / EXECUTE_TOOL（现有代理）
        ↓
读：snapshot / outline …
写：click / fill / scroll …（二次确认）
```

| 属于本需求                                      | 不属于本需求                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| 内置 `vws.page.*` 工具集 + page-controller 封装 | 整包 `PageAgent` / 竞品 Side Panel                                      |
| 注入门槛与生命周期（随 Tab / 注入策略）         | 独立「Agent 读页」权限 UI                                               |
| 隐私：禁止内置读 Cookie/Web Storage             | 用户 Gist 自写敏感工具                                                  |
| 与现有写确认、provider 过滤对齐                 | Playwright MCP / Pilot / Nanobrowser 运行时                             |
|                                                 | **站点构建器语义 API**（组件树 / inspector → 另开 `editor_*` / 产品桥） |
|                                                 | 截图多模态、AXTree via CDP                                              |
|                                                 | HTTP MCP `scripts_*`、Gist CRUD                                         |

---

## 3. 用户与场景

| 角色           | 场景                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| 终端用户       | 对侧栏说「这个表单的邮箱填 test@example.com 并点提交」→ Agent `snapshot` → `fill` / `click`（写操作需确认） |
| 终端用户       | 「页面有几个 H1？」→ `snapshot` / `outline`，无需为每个站写脚本                                             |
| 关闭注入的用户 | 关掉该站脚本注入后，`vws.page.*` 不再出现；行为回到「无通用读页」                                           |
| 脚本作者       | 仍可用 `GME_registerWebMcpTool` 注册领域工具；与 `vws.page.*` **并存**，领域工具优先表达业务语义            |
| 平台维护者     | 保留 MagickMonkey「工具编排」定位，而不是 Monica 式默认整页上云                                             |

---

## 4. 功能需求

### FR-1 自动注册（方案 A）

- 当 Tab 满足 **注入门槛**（见技术规格 §3）时，扩展在 **MAIN world** 注册内置页面工具。
- 不满足门槛时：**不**注册；Agent 行为与今日一致（无工具则诊断，不 scrape）。
- **不**增加第二套「允许 Agent 读此页」开关。

### FR-2 命名与提供方

- Canonical 名：`vws.page.{localName}`（保留 `scriptKey = page`）。
- 写入 `__VWS_WEBMCP_TOOL_REGISTRY__`，`providerId = magickmonkey`，以便默认 `toolProviderScope: magickmonkey_only` 可见。
- 用户 Gist **不得**占用 `scriptKey === 'page'`（冲突时内置优先或拒绝用户注册，见技术规格）。

### FR-3 只读工具（一期必做）

| 工具（localName） | 说明                                                           |
| ----------------- | -------------------------------------------------------------- |
| `snapshot`        | 刷新 page-controller 树，返回面向 LLM 的简化文本（含元素索引） |
| `outline`         | 标题 / 地标级大纲（token 更省；可与 snapshot 共用底层）        |
| `page_meta`       | URL、title、可见性等非敏感元数据                               |

全部 `readOnlyHint: true`。

### FR-4 写工具（一期必做）

| 工具（localName） | 说明                                       |
| ----------------- | ------------------------------------------ |
| `click`           | 按 **snapshot 索引** 点击                  |
| `fill`            | 按索引输入文本（覆盖或追加策略见技术规格） |
| `scroll`          | 页或元素滚动                               |

- `readOnlyHint: false` → 走现有写确认。
- 索引仅对最近一次成功的 `snapshot`（或写操作前强制 `updateTree`）有效；过期索引须明确失败信息，引导重新 `snapshot`。

### FR-5 安全与隐私

- 内置实现路径 **禁止** 读取或返回 Cookie、`localStorage`、`sessionStorage`。
- **禁止** 暴露任意 `eval` / 任意函数执行工具（一期）。
- snapshot 结果设 **硬性长度上限**（截断策略见技术规格），降低意外敏感正文外泄面。
- Agent system prompt **仍禁止**「无工具时自行假设或伪造 DOM」。

### FR-6 与脚本工具共存

- 同页可同时存在 `vws.{scriptKey}.*` 与 `vws.page.*`。
- Prompt 指引：有明确业务工具时优先用业务工具；通用 DOM 操作用 `vws.page.*`。

### FR-7 可观测

- 侧栏 tool 卡片展示工具名、参数（索引、截断后的文本）、结果摘要。
- 注册失败（WebMCP API 缺失、CSP、未达注入门槛）须有可诊断 reason，复用现有 `WebMcpProxyReason` 或扩展枚举。

---

## 5. 非功能需求

| ID    | 要求                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------- |
| NFR-1 | 不引入 Playwright、Puppeteer、CDP 依赖到扩展运行时                                                            |
| NFR-2 | page-controller 体积与注入成本可接受；大 DOM 须有 `maxNodes` / 截断                                           |
| NFR-3 | 核心注册 / 动作包装可单测；不依赖真实 Chrome WebMCP flag 的纯逻辑优先抽 `shared/`                             |
| NFR-4 | License：阿里 page-controller 为 MIT；保留归因（README / NOTICE）                                             |
| NFR-5 | 中文/英文 Agent 提示均可；工具 description 用英文（与现有 WebMCP 习惯一致）亦可，但侧栏用户可见错误信息需可读 |

---

## 6. 成功标准

1. 允许注入的普通 https 页：无任何 Gist 业务工具时，Agent 仍能通过 `vws.page.snapshot` 回答简单结构问题（如 H1 数量）。
2. 写路径：`fill` / `click` 在确认后真实作用于当前 Tab DOM（与用户手势事件兼容度达到 page-controller 能力上限）。
3. 关闭该站注入或扩展总开关后：工具消失；Agent 不再读到通用 DOM。
4. 内置工具调用路径的单元测试覆盖：命名、注册门槛、禁止 storage、索引过期错误。
5. **不**出现 PageAgent 浮层 UI；LLM 环仍仅在 MagickMonkey Side Panel。

---

## 7. 分期

| 阶段             | 内容                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| **P0（本需求）** | 注入门槛 + `snapshot` / `outline` / `page_meta` + `click` / `fill` / `scroll` + 写确认 + 隐私硬约束 |
| **P1**           | `hover` / `select_option` / `press_key`；viewport-only 选项；snapshot diff                          |
| **P2**           | iframe / shadow DOM 策略增强（跟进 page-controller 能力）                                           |
| **另轨**         | 站点构建器 `get_component_tree` 等语义工具（不进本需求）                                            |

---

## 8. 已锁定实现细则（原开放项）

| 项               | 决定                                                             |
| ---------------- | ---------------------------------------------------------------- |
| Gate             | 总开 + User Scripts + http(s)；不要求匹配脚本（2026-07-20 放宽） |
| `scriptKey=page` | 保留字；`GME_registerWebMcpTool` 拒绝                            |
| SimulatorMask    | 一期 **关**（`enableMask: false`）                               |

---

## 9. 修订记录

| 日期       | 说明                                                         |
| ---------- | ------------------------------------------------------------ |
| 2026-07-19 | 初稿：方案 A + page-controller；对齐 Agent D3 / 无第二授权层 |

|
