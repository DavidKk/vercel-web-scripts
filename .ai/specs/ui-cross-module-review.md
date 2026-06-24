# UI 跨模块审查：WEB · Extension · Preset

Status: **REVIEW** (2026-06-18)  
Task: `../tasks/backlog/ui-cross-module-dedup.md`（需求待提 / 待排期）  
Related: `tasks/done/ui-folder-restructure.md`（Extension 内部已重组）

---

## 1. 审查结论（摘要）

| 维度               | 现状                                                                                                                                       | 建议                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| **设计 token**     | WEB `homePalette`、Preset `vws-ui-tokens.css` 数值一致；Extension 独立浅色 `mmPalette`；WEB 编辑器内部还有 VS Code 色                      | 语义 token 抽到 `shared/ui/tokens/`；主题分 dark / light 两套 |
| **行为逻辑**       | scroll-indicator、tooltip 定位、debug state 等多处平行实现                                                                                 | 纯 TS 函数优先合并到 `shared/ui/`                             |
| **组件代码**       | React（WEB）vs Web Components / Shadow DOM（Extension / Preset）                                                                           | **不强行共享组件 DOM**；共享 token + 行为 + 约定              |
| **Extension 内部** | form / tooltip / notification 已抽 shared；debug panel ×3、toolbar EJS 仍重复                                                              | Extension 内先抽象，再与 Preset 对齐                          |
| **Preset 轻量 UI** | 已移除未接入 bundle 的 CM 相关模块（`string-tool`、`compiled-code-viewer`、`codemirror-editor`）；富编辑留待独立 `editor-lib` 或脚本侧方案 | 见 `tasks/done/preset-cm-ui-removal.md`                       |

**原则**：样式跟脚本要区分——**样式 token 与纯函数可跨端复用**；**各端渲染层保持独立**，特殊场景允许拆分。

---

## 2. 三端 UI 架构对照

### 2.1 WEB（Next.js / React）

```
app/                          # 页面壳：layout、login、editor、home
components/
  ScriptEditor/               # Monaco 编辑器主体（最大 UI 子系统）
  Notification/               # 全局 toast 栈（Context + hooks）
  ConfirmDialog/              # 确认模态框
  Tooltip/                    # Portal tooltip
  Alert.tsx, Spinner.tsx      # 零散原语
app/components/home/palette.ts  # homePalette + homeUi Tailwind 类名包
app/globals.css               # Tailwind + 首页滚动条
```

- **样式**：Tailwind utility + 大量 inline hex；无 shadcn / CVA / `cn()` helper
- **两套视觉并存**：MagickMonkey shell（`#111318` / `#3b82f6`）与 VS Code 风（`#1e1e1e` / `#007acc`，ConfirmDialog、Notification、Monaco 周边）
- **遗留**：`FilterBar.tsx`、`ClearableSelect.tsx` 浅色风格、无引用

### 2.2 Extension（Chrome MV3 Admin / Popup）

```
extension/src/ui/
  admin/           # 路由、tab、lifecycle、debug 可见性
  servers|scripts|permissions|rules|logs/   # 各 tab app + debug
  popup/           # popup 专用（bottom toast，不用 admin notification）
  shared/          # tooltip、switch/checkbox 工厂、相对时间
  mm-form-components/   # WC：input/select/button/switch/checkbox + scroll-indicator
  mm-notification/      # admin 右上角通知栈
  mm-icons/             # MDI hydration
  tailwind.css          # ~3100 行单一 CSS 入口
extension/src/html/     # EJS 静态 markup（data-ref 契约）
```

- **样式**：`extension/tailwind.config.ts` → `mmPalette`（**浅色** admin shell）
- **DOM**：Light DOM Custom Elements + EJS；无 Shadow DOM
- **已完成**：2026-06-16 folder restructure（见 `tasks/done/ui-folder-restructure.md`）

### 2.3 Preset（页面注入 runtime UI）

```
preset/src/ui/
  notification/      # core bundle — toast（Shadow DOM）
  corner-widget/     # core bundle — 角落菜单
  command-palette/   # preset-ui 懒加载
  log-viewer/        # preset-ui 懒加载
  node-selector/     # preset-ui 懒加载
  node-toolbar/      # preset-ui 懒加载
  shared/
    vws-ui-tokens.css
    vws-scroll.css
    scroll-indicator.ts
    wrap-ui-styles.ts
```

- **样式**：CSS variables（`--vws-*`），与 WEB `homePalette` 注释对齐
- **打包**：HTML/CSS/TS `?raw` → `wrapUiStyles()` → Shadow DOM 或 imperative overlay
- **Bundle 分层**：轻量 notification/corner-widget 在 core；重组件 lazy load

### 2.4 已有跨模块共享（repo `shared/`）

当前 `shared/` **无 UI 组件**，仅有业务逻辑与 DevTools 样式：

- `shared/script-permission.ts` — 权限模型（三端共用 ✅）
- `shared/vws-console-log-styles.ts` — preset + extension 控制台 `%c` 样式（**跨端共享范例** ✅）

---

## 3. 重复项清单（按优先级）

### P0 — 高价值、低耦合（建议优先做）

#### 3.1 Scroll indicator（Preset ↔ Extension）

|      | Preset                                                           | Extension                                                 |
| ---- | ---------------------------------------------------------------- | --------------------------------------------------------- |
| TS   | `preset/src/ui/shared/scroll-indicator.ts`                       | `extension/src/ui/mm-form-components/scroll-indicator.ts` |
| CSS  | `vws-scroll.css`（`.vws-scroll-indicator-*`）                    | `tailwind.css`（`.mm-scroll-indicator-*`）                |
| 差异 | 有 `computeScrollThumbMetrics`（有单测）、`applyDraggableScroll` | 有 `ensureMenuScrollIndicator`；thumb 计算内联            |
| 额外 | —                                                                | `mm-scripts-app.ts` **自实现** scrollbar（未用 shared）   |

**优化**：合并为 `shared/ui/scroll-indicator.ts` + `shared/ui/scroll-indicator.css`（class 前缀参数化或共用 `--scroll-*` token）；Extension scripts tab 改用 shared 实现。

#### 3.2 Tooltip 视口定位（WEB ↔ Extension）

|      | WEB                                                           | Extension                                         |
| ---- | ------------------------------------------------------------- | ------------------------------------------------- |
| 实现 | `components/Tooltip/index.tsx`（React portal + layoutEffect） | `shared/mm-tooltip-position.ts`（纯函数）         |
| 测试 | `__tests__/components/Tooltip/`                               | `__tests__/extension/mm-tooltip-position.spec.ts` |

**优化**：将 `computeMmTooltipPosition` 提升到 `shared/ui/tooltip-position.ts`；WEB Tooltip 与 Extension 共用算法；Preset node-selector 悬停 tooltip 可后续接入。

#### 3.3 设计 token 语义层（WEB ↔ Preset ↔ Extension）

三处 token 定义，注释声称对齐但**无代码级单一来源**：

| 来源      | 文件                                       | 主题                        |
| --------- | ------------------------------------------ | --------------------------- |
| WEB       | `app/components/home/palette.ts`           | 深色 MagickMonkey           |
| Preset    | `preset/src/ui/shared/vws-ui-tokens.css`   | 深色（与 homePalette 一致） |
| Extension | `extension/tailwind.config.ts` `mmPalette` | **浅色** admin（有意不同）  |

**优化**：

```
shared/ui/tokens/
  semantic.json 或 semantic.css   # canvas, surface, brand, danger… 语义名
  theme-dark.css                  # WEB + Preset
  theme-light.css                 # Extension admin
```

WEB 逐步从 inline hex 迁移到 CSS 变量或 TS 常量 re-export；Preset 继续 `wrapUiStyles(tokens + moduleCss)`。

---

### P1 — Extension 内部重复（先做内聚，再跨端）

#### 3.4 Debug panel 三件套（~80% 相同 TS）

文件：

- `scripts/mm-scripts-debug-panel.ts`
- `logs/mm-logs-debug-panel.ts`
- `permissions/mm-permissions-debug-panel.ts`

共同模式：`TRIGGER_SIZE=36`、draggable trigger、sheet toggle、四件套 override UI（force-loading / force-error / force-empty / mock-sample）、`enhanceMmCheckboxLabel`、`bindDebugPanelToAdminTab`。

**优化**：抽象 `extension/src/ui/admin/mm-admin-debug-panel-base.ts`（或 factory），各 tab 只提供 tab id、额外 override 字段、测试按钮配置。

#### 3.5 Debug state 三份平行实现

- `scripts-debug-state.ts`
- `logs-debug-state.ts`
- `permissions-debug-state.ts`

同一模式：`overrides` → `get/set/subscribe/isActive/createMock`。

**优化**：泛型 factory `createDebugState<TOverrides>(defaults)`。

#### 3.6 Admin tab app 启动样板

五个 `mm-*-app.ts` 重复：

- `bound` guard
- `subscribeAdminViewActivated(tab, reload)`
- `MmToast` / `showMmNotification`
- `initMmTooltipDelegation` / `hydrateMmIcons`
- `disconnectedCallback` 批量 unsubscribe

**优化**：可选 base class 或 `bindAdminTabApp(element, { tab, onActivate, ... })` helper。

#### 3.7 Toolbar EJS 片段

`scripts-panel.ejs`、`permissions-panel.ejs`、`logs-panel.ejs` 中 search input + `mm-select` 结构高度相似。

**优化**：`partials/views/admin-toolbar.ejs` 参数化 partial（search placeholder、filter options）。

#### 3.8 SearchSelect 类型重复

`rules/mm-rules-app.ts` 与 `popup/mm-popup-app.ts` 各定义相同 `SearchSelectElement` interface。

**优化**：移到 `mm-form-components/` 或 `types.ts`。

---

### P2 — 概念重复、实现差异大（对齐 API / token，组件仍分叉）

#### 3.9 Notification / Toast（三端）

| 端              | 实现                                     | 能力                                  |
| --------------- | ---------------------------------------- | ------------------------------------- |
| WEB             | `components/Notification/` React Context | success/warn/error/loading + 进度条   |
| Extension admin | `mm-notification/` light DOM             | success/error/info/warn，无 loading   |
| Extension popup | inline `.mm-popup-toast`                 | 底部 overlay，独立样式                |
| Preset          | `notification/` Shadow DOM               | loading/progress/update/close，最完整 |

**优化**：

- 短期：统一 variant 命名与 auto-dismiss 约定；共用 MDI icon 映射（已在用 `~icons/mdi/*`）
- 中期：`shared/ui/notification-types.ts` + icon SVG 常量；Extension admin 可选补齐 loading（Preset 已有实现可参考）
- **不合并** React / WC / Shadow DOM 组件本身

#### 3.10 Switch / Checkbox

| 端                | 实现                                                            |
| ----------------- | --------------------------------------------------------------- |
| Extension         | `shared/mm-switch.ts` + `shared/mm-checkbox.ts` + WC + Tailwind |
| Preset log-viewer | 内联 CSS `.log-viewer__switch` / filter checkbox                |
| WEB login         | 自定义 peer checkbox                                            |

**优化**：共享 **DOM 结构约定 + CSS 片段**（或 `createSwitch()` / `createCheckbox()` 工厂）；各端样式仍走各自 theme。

#### 3.11 Modal / Overlay

- WEB：`ConfirmDialog`、 `ShortcutsHelpModal`、`EditorIntegrationModals`（各自实现）
- Extension：`bridge/permission-modal.ts`（Shadow DOM + 内联 HTML）
- Preset：log-viewer 等 BEM modal（`string-tool` / `compiled-code-viewer` 已删除，见 `tasks/done/preset-cm-ui-removal.md`）

**优化**：`shared/ui/modal-behavior.ts`（Escape 关闭、focus trap 约定、backdrop click）；CSS 按主题分叉。

#### 3.12 WEB 内部重复

- 按钮样式：各文件重复 `px-3 py-1.5 rounded`、`hover:bg-[#2a303a]`
- `ShortcutsHelpModal` 内联 scroll thumb 计算 → 应用 P0 scroll-indicator
- `Alert.tsx` 与 `Notification` 两套反馈系统（login vs editor）

**优化**：editor 侧抽取 `editorUi` 类名包（仿 `homeUi`）；login 迁移到 Notification 或明确「单页 imperative alert」边界。

---

### P3 — 架构决策 / 低优先级

#### 3.13 `wrapUiStyles` vs Extension Tailwind

Preset 每模块独立 CSS + Shadow DOM；Extension 预编译单一 `tailwind.css`。统一需决定：

- Extension 是否部分 UI 改 Shadow DOM（成本高，一般不推荐）
- 或 Preset 大模块是否引入 Tailwind 构建（与当前 `?raw` 模式冲突）

**建议**：保持渲染层分离；仅共享 token + 纯函数。

#### 3.14 Preset CM 编辑器模块（已关闭）

**决策（2026-06）**：删除 `string-tool`、`compiled-code-viewer`、`codemirror-editor` 及 `preset/src/codemirror.ts`；移除 `@codemirror/*` 依赖。上述模块从未接入 `entry-ui.ts`，删除不影响当前运行时。富文本/代码编辑需求留待独立 `editor-lib` OTA 模块或各 Gist 脚本按需加载。

记录：`tasks/done/preset-cm-ui-removal.md`

#### 3.15 WEB 遗留组件

`FilterBar.tsx`、`ClearableSelect.tsx` — 无引用、浅色风格与当前 shell 不一致 → 删除或重写。

---

## 4. 建议目录结构

```
shared/ui/
  tokens/
    semantic.css          # --vws-canvas, --vws-brand, … 语义变量
    theme-dark.css        # WEB homepage + Preset + editor shell
    theme-light.css       # Extension admin
  scroll-indicator.ts
  scroll-indicator.css    # 或合并进 vws-scroll.css
  tooltip-position.ts
  modal-behavior.ts       # 可选：Escape / focus 约定
  notification-types.ts   # 可选：variant + icon 映射
  form-controls.ts        # 可选：createSwitch / createCheckbox
```

**Extension** 继续：

```
extension/src/ui/shared/          # 端内共享（已有）
extension/src/ui/mm-form-components/
extension/src/ui/tailwind.css     # 引用 shared token，@apply 生成 .mm-*
```

**Preset** 继续：

```
preset/src/ui/shared/wrap-ui-styles.ts  # import shared/ui/tokens/*
```

**WEB**：

```
app/components/home/palette.ts      # re-export shared semantic 或 @import theme-dark.css
components/                         # React 原语保持独立
```

---

## 5. 什么应该保持拆分

| 场景                                         | 原因                                              |
| -------------------------------------------- | ------------------------------------------------- |
| Extension 浅色 admin vs WEB/Preset 深色      | 产品定位不同；共享**语义 token**，不共享**色值**  |
| React 组件 vs Web Components                 | 技术栈不可互 import；共享行为与 token             |
| Popup bottom toast vs Admin top notification | 交互位置不同；可共享 variant 约定                 |
| ScriptEditor（Monaco 生态）                  | 体量大、VS Code 色合理；不与 shell token 强行统一 |
| Preset node-selector / node-toolbar          | 页面注入专用，无 Extension 对应物                 |
| Extension EJS + data-ref 契约                | Admin 静态 markup 模式；Preset 用 `?raw` template |
| Permission modal（Shadow DOM 隔离）          | 安全/样式隔离需求；允许特殊实现                   |

---

## 6. 推荐实施顺序

| 阶段  | 内容                                                       | 风险 | 收益                   |
| ----- | ---------------------------------------------------------- | ---- | ---------------------- |
| **A** | `shared/ui/scroll-indicator` 合并 + Extension scripts 改用 | 低   | 高                     |
| **A** | `shared/ui/tooltip-position` + WEB 接入                    | 低   | 中                     |
| **A** | `shared/ui/tokens/semantic` + Preset/WEB re-export         | 低   | 高（后续所有 UI 受益） |
| **B** | Extension debug panel base + debug state factory           | 中   | 高（减 ~600 行重复）   |
| **B** | Extension admin toolbar EJS partial                        | 低   | 中                     |
| **B** | Extension `bindAdminTabApp` 样板                           | 低   | 中                     |
| **C** | Notification variant 对齐 + icon 常量                      | 中   | 中                     |
| **C** | WEB `editorUi` 类名包 + 清理遗留组件                       | 低   | 中                     |
| **D** | ~~Preset 孤儿模块决策~~（**已完成**：删除 CM 相关模块）    | —    | 避免 dead code 误导    |
| **D** | Modal behavior 共享                                        | 中   | 低-中                  |

每阶段独立 PR；先 A 再 B，避免大范围同时改三端。

---

## 7. 验收标准（完成后）

- [ ] `shared/ui/` 存在且 Preset + Extension 至少各有一处 consumer
- [ ] scroll-indicator 单测覆盖 shared 模块（迁移 preset 现有 spec）
- [ ] token 变更只需改 `shared/ui/tokens/` 一处（WEB/Preset dark 同步）
- [ ] Extension 三个 debug panel 共用 base，新增 tab debug 不超过 ~100 行差异代码
- [ ] 文档：`knowledge/glossary.md` 或本文件更新 Status → DONE

---

## 8. 参考文件速查

| 模块               | 关键路径                                                  |
| ------------------ | --------------------------------------------------------- |
| WEB token          | `app/components/home/palette.ts`                          |
| WEB 通知           | `components/Notification/`                                |
| WEB tooltip        | `components/Tooltip/index.tsx`                            |
| Extension token    | `extension/tailwind.config.ts`                            |
| Extension CSS      | `extension/src/ui/tailwind.css`                           |
| Extension scroll   | `extension/src/ui/mm-form-components/scroll-indicator.ts` |
| Extension tooltip  | `extension/src/ui/shared/mm-tooltip-position.ts`          |
| Preset token       | `preset/src/ui/shared/vws-ui-tokens.css`                  |
| Preset scroll      | `preset/src/ui/shared/scroll-indicator.ts`                |
| Preset 样式包装    | `preset/src/ui/shared/wrap-ui-styles.ts`                  |
| 跨端范例           | `shared/vws-console-log-styles.ts`                        |
| Extension 重组记录 | `tasks/done/ui-folder-restructure.md`                     |
