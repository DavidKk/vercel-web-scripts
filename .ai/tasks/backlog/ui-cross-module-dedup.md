# UI 跨模块去重与公共层 — task thread

Status: **DONE (Phase A)** — B/C/D **defer**（触 UI 改动时再按需推进）

**结案（2026-06-27）**：Phase A 高价值部分已落地；A3 token、Phase B/C/D 不强行推进，后续改 UI 时顺带统一。

**已落地**：`shared/ui/scroll-indicator.ts`、`shared/ui/tooltip-position.ts`；Preset/Extension consumer + Jest；WEB `Tooltip`、`ShortcutsHelpModal` 接入；删除遗留 `FilterBar` / `ClearableSelect`。

Review 来源: `../../specs/ui-cross-module-review.md` (2026-06-18)  
前置: `../done/ui-folder-restructure.md`（Extension 内部目录已重组）

---

## Objective

在 **WEB · Extension · Preset** 三端 UI 之间建立可维护的公共层，减少重复实现；**样式 token 与纯函数优先共享**，各端渲染层（React / WC / Shadow DOM）保持独立，特殊场景允许拆分。

本任务用于**提需求、排期、分阶段交付**；实现按阶段独立 PR，不一次性改三端。

---

## 已确认原则（提需求时勿重新争论）

| 原则                | 说明                                                       |
| ------------------- | ---------------------------------------------------------- |
| 不强行共享组件 DOM  | React 与 Web Components / Shadow DOM 不可互 import         |
| 共享 token + 行为   | 颜色语义、scroll/tooltip 算法、notification variant 命名等 |
| 主题分 dark / light | WEB + Preset 深色；Extension admin 浅色（产品定位）        |
| ScriptEditor 例外   | Monaco / VS Code 色不与 shell token 强行统一               |
| 特殊 UI 可拆分      | permission-modal Shadow DOM、popup bottom toast 等         |

---

## 需求范围（In scope）

### Phase A — `shared/ui/` 基础设施（跨端，低风险）

- [x] **A1** 合并 scroll-indicator：`shared/ui/scroll-indicator.ts`；Preset/Extension re-export + `__tests__/shared/scroll-indicator.spec.ts`
- [ ] **A1b** （**defer**）Extension scripts tab 专用 scrollbar — 已共用 `computeScrollThumbMetrics`；完整 `bindScrollIndicator` 迁移非必须
- [x] **A2** 提升 tooltip 定位：`shared/ui/tooltip-position.ts`；Extension re-export + WEB `components/Tooltip` 接入
- [ ] **A3** （**defer**）设计 token 单一来源 — 改 UI 颜色时再建 `shared/ui/tokens/`

**Phase A 验收**

- [x] `shared/ui/` 存在，Preset + Extension 各至少 1 处 consumer
- [x] scroll-indicator 单测在 shared 模块（`__tests__/shared/scroll-indicator.spec.ts`）
- [ ] dark 主题 token 改一处即 WEB + Preset 同步 — **defer**（依赖 A3，非阻断）

---

### Phase B — Extension 内部去重（**defer** — 新增 admin debug tab 或大规模改 admin 时再考虑）

- [ ] **B1** Debug panel 抽象：`mm-scripts-debug-panel` / `mm-logs-debug-panel` / `mm-permissions-debug-panel` → 共用 base（draggable trigger、四件套 override UI）
- [ ] **B2** Debug state factory：`scripts-debug-state` / `logs-debug-state` / `permissions-debug-state` → `createDebugState<T>()`
- [ ] **B3** Admin toolbar EJS partial：scripts / permissions / logs 共用 `admin-toolbar.ejs`
- [ ] **B4** Admin tab app 样板：`bindAdminTabApp` 或 base class（lifecycle、toast、tooltip、unsubscribe）
- [ ] **B5** `SearchSelectElement` 类型统一到 `mm-form-components` 或共享 types

**Phase B 验收**

- [ ] 新增 admin debug tab 差异代码 ≤ ~100 行（仅领域 override + 测试按钮）
- [ ] 三个 debug panel 行数显著下降（目标减 ~600 行重复）

---

### Phase C — 行为对齐与 WEB 清理（**defer** — 改 notification / 编辑器 shell 时再考虑）

- [ ] **C1** Notification variant 命名与 auto-dismiss 约定对齐（WEB / Extension admin / Preset）；共用 icon 映射常量
- [ ] **C2** Extension admin 可选补齐 loading toast（参考 Preset notification）
- [ ] **C3** WEB `editorUi` Tailwind 类名包（仿 `homeUi`），减少 inline hex 重复
- [x] **C4** 清理 WEB 遗留：`FilterBar.tsx`、`ClearableSelect.tsx` 已删除（无引用）
- [x] **C5** `ShortcutsHelpModal` 改用 shared `computeScrollThumbMetrics`

**Phase C 验收**

- [ ] 三端 notification variant 文档化（glossary 或 spec 一节）
- [ ] WEB 编辑器 shell 按钮样式有单一 `editorUi` 入口

---

### Phase D — 架构决策项（**defer** — D1 已完成）

- [x] **D1** Preset 孤儿模块：`string-tool` / `compiled-code-viewer` / `codemirror-editor` — **已删除**（2026-06；见 `../done/preset-cm-ui-removal.md`）
- [ ] **D2** Modal 行为共享：`shared/ui/modal-behavior.ts`（Escape、backdrop、focus 约定）；CSS 仍按主题分叉
- [ ] **D3** Form control 工厂：`createSwitch` / `createCheckbox` + 共享 CSS 片段（Preset log-viewer 替换内联）
- [ ] **D4** WEB login `Alert` vs `Notification` — 合并或明确边界文档

**Phase D 验收**

- [x] D1 有书面决策（**删除**）及理由 — `../done/preset-cm-ui-removal.md`
- [ ] D2–D4 按决策项关闭或拆子任务

---

## 明确 Out of scope（除非单独立项）

- Extension 全面改 Shadow DOM
- Preset 引入 Tailwind 构建替代 `?raw` + `wrapUiStyles`
- ScriptEditor / Monaco 主题与 MagickMonkey shell 统一
- 三端 notification / modal **组件代码**合并为一套

---

## 提需求检查清单（提交前）

- [ ] 关联 spec：`specs/ui-cross-module-review.md`
- [ ] 确认 Phase 优先级：建议 **A → B → C → D**，每阶段独立 PR
- [ ] 确认资源：是否与其他 backlog 任务（extension-native-loader、runtime Phase D、ui-cross-module-dedup）并行
- [ ] 确认 D1（Preset 孤儿模块）产品意图
- [ ] 确认 Extension 浅色主题在 token 抽象后仍独立维护

---

## 依赖与风险

| 项                       | 说明                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| 与 script-permissions    | 无硬依赖（permissions 已 done）；permissions debug panel 归入 Phase B 时注意勿与权限功能 PR 冲突 |
| 与 ui-folder-restructure | 已完成；本任务在其之上做跨模块与 Extension 内二次抽象                                            |
| 测试                     | Phase A 需迁移/新增 Jest；Extension E2E 若有需回归 admin tab                                     |
| 构建                     | `shared/ui` 需进入 tsconfig paths；Preset Vite / Extension Vite 均能 resolve                     |

---

## 里程碑

| ID  | 条件                                      | Status |
| --- | ----------------------------------------- | ------ |
| M0  | Review 文档 + 本 task 建立                | DONE   |
| M1  | Phase A 合并 + 验收                       | DONE   |
| M2  | Phase B Extension 去重 + 验收             | DEFER  |
| M3  | Phase C 对齐 + WEB 清理                   | DEFER  |
| M4  | Phase D 决策项关闭                        | DEFER  |
| M5  | `ui-cross-module-review.md` Status → DONE | DEFER  |

---

## 参考路径

| 模块                               | 路径                                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Review 全文                        | `specs/ui-cross-module-review.md`                                                                         |
| WEB token                          | `app/components/home/palette.ts`                                                                          |
| Preset token / scroll              | `preset/src/ui/shared/vws-ui-tokens.css`, `scroll-indicator.ts`                                           |
| Extension token / scroll / tooltip | `extension/tailwind.config.ts`, `mm-form-components/scroll-indicator.ts`, `shared/mm-tooltip-position.ts` |
| 跨端共享范例                       | `shared/vws-console-log-styles.ts`                                                                        |
| Extension 重组记录                 | `tasks/done/ui-folder-restructure.md`                                                                     |
