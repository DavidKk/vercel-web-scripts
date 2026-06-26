# 大文件拆分 — task thread

Status: **DONE** (2026-06-27)

**实施摘要**：Phase 1–2、4–5 已完成并合入 `main`（commit `2f84e3b`）。Phase 3 NodeSelector 856 行（<1000 阈值）跳过。Phase 6 观察名单未启动。

规则（来自需求）：

- **≤800 行**：可接受，不必强行拆
- **>1000 行**：尽量避免单文件；除非确为**单一 class 且难以再拆逻辑**
- 拆分后文件放在**同一功能文件夹**内，保持 import 路径稳定（barrel 或主文件 re-export）

关联: `../../specs/ui-cross-module-review.md`（token 外置与 `shared/ui/` 去重仍见 `tasks/backlog/ui-cross-module-dedup.md`）

---

## 实施记录（2026-06-27）

| Phase          | 结果 | 主文件行数（后）              | 产出                                                                       |
| -------------- | ---- | ----------------------------- | -------------------------------------------------------------------------- |
| 1 Servers      | DONE | `mm-options-app.ts` **404**   | `mm-options-types/list-render/drag-reorder/detail-form/connection-test.ts` |
| 2 Scripts      | DONE | `mm-scripts-app.ts` **610**   | `mm-scripts-types/row-render/list-data/scroll.ts`                          |
| 3 NodeSelector | SKIP | `NodeSelector.ts` **856**     | 未超 1000 行阈值                                                           |
| 4 Background   | DONE | `background.ts` **98**        | `background-message-handlers/bridge/debug-permission/status/tab-utils.ts`  |
| 5 tailwind     | DONE | `tailwind.css` **13**（入口） | `extension/src/ui/styles/components-*.css` ×9（最大 partial 654 行）       |
| 6 观察名单     | TODO | —                             | 见下文 Phase 6                                                             |

**验证**：`pnpm run build:extension` 通过；`pnpm run typecheck:extension` 通过；extension 相关 spec 未回归。

---

## 扫描结果（2026-06-18）

排除：`node_modules`、生成文件、测试 spec（测试文件大通常可接受）

### 必须处理（>1000 行，非生成）

| 行数 | 文件                                          | 类型                    | 拆分建议                                                                                     |
| ---- | --------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------- |
| 3181 | `extension/src/ui/tailwind.css`               | CSS 单体                | 按域拆为 `tailwind/` 多文件 + `@import` 入口；或 Phase A token 外置后按 tab 拆 components 层 |
| 1586 | `extension/src/ui/servers/mm-options-app.ts`  | 单 class `MmOptionsApp` | 拆为同目录 4–5 模块（见下）                                                                  |
| 1327 | `preset/src/ui/node-selector/NodeSelector.ts` | 单 class                | 已有 `Marker*` 子模块；主 class 按 **marks / hover-select / storage** 拆 delegate            |
| 1079 | `extension/src/ui/scripts/mm-scripts-app.ts`  | 单 class `MmScriptsApp` | 拆 render / reload / scroll / types（见下）                                                  |
| 1011 | `extension/src/shell/background.ts`           | 顶层函数 + 巨型 switch  | 拆 message handler、badge、bridge、debug-permission helpers                                  |

### 生成 / 类型声明（不拆）

| 行数 | 文件                                           | 说明         |
| ---- | ---------------------------------------------- | ------------ |
| 1024 | `lib/tampermonkey-editor-typings.generated.ts` | 生成物       |
| 1018 | `preset/src/editor-typings.d.ts`               | 全局声明聚合 |

### 观察名单（800–1000 行，可下一批）

| 行数 | 文件                                       | 说明                               |
| ---- | ------------------------------------------ | ---------------------------------- |
| 996  | `services/scripts/gistScripts.ts`          | 服务端；可按 API / transform 拆    |
| 867  | `preset/src/ui/corner-widget/index.ts`     | 单 CE；可拆 menu / drag / commands |
| 833  | `preset/src/services/tab-communication.ts` | 服务层                             |
| 807  | `services/tampermonkey/launcherScript.ts`  | 构建脚本生成                       |

### 当前可接受（<800，暂不拆）

`permission-manager.ts` (722)、`mm-logs-app.ts` (666)、`mm-popup-app.ts` (654)、`mm-permissions-app.ts` (526)、`gm-bridge.ts` (542)、`launcher-runtime.ts` (650) 等。

---

## Phase 1 — Extension Servers（最高优先级）

**目标文件**: `extension/src/ui/servers/mm-options-app.ts` (1586 → 主 class **<600**)

建议同目录结构：

```
servers/
  mm-options-app.ts              # CE 壳：lifecycle、bindEvents、reload、编排
  mm-options-types.ts            # DetailMode、DetailFormBaseline、常量
  mm-options-list-render.ts      # renderServiceList、列表行 DOM
  mm-options-drag-reorder.ts     # drag placeholder、getDragAfterRow、setRowDragImage
  mm-options-detail-form.ts      # readFormInput、validate、field errors、baseline/dirty
  mm-options-connection-test.ts  # pingEndpoint、service/detail test 状态机、batch test
```

| 子模块          | 大致行号来源 | 职责                                                       |
| --------------- | ------------ | ---------------------------------------------------------- |
| types           | L29–56       | 类型与 `DETAIL_TEST_TOOLTIPS` 等常量                       |
| list-render     | L239–401     | 服务列表渲染                                               |
| drag-reorder    | L403–611     | 拖拽排序（可接受 `bindListDragReorder(app, listEl)` 注入） |
| detail-form     | L612–1015    | 详情表单读写、校验、scriptKey 显隐                         |
| connection-test | L1040–1471   | 连接测试 UI + `pingEndpoint`                               |
| 主文件          | 余下         | save/delete/reload、storage 监听                           |

**验收**

- [x] `mm-options-app.ts` ≤ 600 行（实际 **404**）
- [x] 无行为变更；Servers tab 手测：列表、拖拽、详情保存、连接测试、批量测试
- [x] 现有 extension 相关 spec 仍通过

---

## Phase 2 — Extension Scripts

**目标文件**: `extension/src/ui/scripts/mm-scripts-app.ts` (1079 → **<700**)

```
scripts/
  mm-scripts-app.ts           # CE 壳、bindEvents、filters 编排
  mm-scripts-types.ts         # ScriptRow、ScriptKeyGroupView
  mm-scripts-row-render.ts    # renderRow、各 cell、install 按钮、master switch 挂载
  mm-scripts-list-data.ts     # reloadList、applyScriptGroups、enabledMap 构建
  mm-scripts-scroll.ts        # bindScrollIndicator、updateScrollIndicator（后续可换 shared/ui）
```

| 子模块     | 职责                             |
| ---------- | -------------------------------- |
| row-render | L175–563 渲染与 tooltip          |
| list-data  | L739–878 加载与分组              |
| scroll     | L626–660、L1053+                 |
| 主文件     | filter、hash focus、storage 监听 |

**验收**

- [x] `mm-scripts-app.ts` ≤ 700 行（实际 **610**）
- [x] Scripts tab：列表、过滤、安装开关、hash 深链聚焦、footer 统计

---

## Phase 3 — Preset NodeSelector

**Status: SKIP**（2026-06-27 — `NodeSelector.ts` 已降至 **856** 行，低于 1000 阈值，本轮不拆）

**目标文件**: `preset/src/ui/node-selector/NodeSelector.ts` (1327 → 856)

已有拆分：`MarkerHighlightBox.ts`、`MarkerLabel.ts`、`MarkerXPathPanel.ts`、`index.ts` (720)。

建议再从 `NodeSelector` 抽出：

```
node-selector/
  NodeSelector.ts              # CE 壳、enable/disable、public API
  node-selector-hover.ts       # 鼠标悬停、tooltip、高亮框定位
  node-selector-marks.ts       # mark/unmark/restore、storage 读写
  node-selector-selection.ts   # 点击选择、clearSelection
```

**验收**

- [ ] `NodeSelector.ts` ≤ 500 行 — **未做**（当前 856，可列入 Phase 6 或下次超 1000 再拆）
- [x] `__tests__/preset/` 中 node-selector 相关用例通过（未改行为）

---

## Phase 4 — Extension Background

**目标文件**: `extension/src/shell/background.ts` (1011)

```
shell/
  background.ts                      # 监听器注册、onMessage 入口（薄）
  background-message-handlers.ts     # switch cases 按域分组
  background-bridge.ts               # handleBridgeXhr、handleWebConnect、normalizeWebConnectConfig
  background-status.ts               # updateBadgeForTab、refreshAllBadges、buildStatus
  background-debug-permission.ts     # resolveDebugPermission*、DEBUG_* case 逻辑
  background-tab-utils.ts            # getActiveTab、reloadTab、isReloadableTabUrl
```

**验收**

- [x] `background.ts` ≤ 200 行（实际 **98**）
- [x] `__tests__/extension/` shell / permission 相关 spec 通过

---

## Phase 5 — tailwind.css（与 UI 公共层协同）

**Status: DONE**（2026-06-27）

**目标文件**: `extension/src/ui/tailwind.css` (3181 → **13** 行入口)

实际结构（`@import` 在 `@tailwind` 之前）：

```
extension/src/ui/
  tailwind.css                         # @import partials + @tailwind
  styles/
    base-preflight.css                 # 65
    components-shell-admin.css         # 149
    components-permissions.css         # 154
    components-logs.css                  # 523
    components-servers-rules.css       # 369
    components-servers-options.css     # 608
    components-scripts-toolbar.css     # 654
    components-scripts-rows.css        # 579
    components-widgets.css             # 281
```

**验收**

- [x] 构建产物 admin/popup CSS 无视觉回归（`pnpm run build:extension`）
- [x] 单 partial 原则上 < 500 行（`components-scripts-toolbar.css` **654** 略超，可后续再切）

---

## Phase 6 — 观察名单（可选，未启动）

| 文件                             | 行数（2026-06-27） | 拆分方向                                         |
| -------------------------------- | ------------------ | ------------------------------------------------ |
| `gistScripts.ts`                 | ~996               | API client / normalizer / cache                  |
| `corner-widget/index.ts`         | ~867               | `corner-widget-menu.ts`、`corner-widget-drag.ts` |
| `tab-communication.ts`           | ~833               | channel types / postMessage router               |
| `NodeSelector.ts`                | 856                | hover / marks / selection delegates              |
| `components-scripts-toolbar.css` | 654                | toolbar vs filter 子 partial                     |

---

## 原则（实施时）

1. **先抽纯函数**，再抽需要 `this` 的模块（传入 context 接口）
2. **单 class 过大**：按**领域**拆文件，class 保留编排；不拆成多个 CE
3. **不改变对外 API**：`customElements.define` 名、export class 名不变
4. **每 Phase 独立 PR**，便于 review 与回滚
5. **测试文件**不因「行数」拆分，除非逻辑可复用被抽到 shared

---

## 提需求检查清单

- [x] 确认 Phase 顺序：**1 → 2 → 4 → 3(skip) → 5**（已按此执行）
- [x] `ui-cross-module-dedup` Phase A 未合并 — tailwind 先按域拆 partial，token 外置仍 backlog
- [x] tailwind 拆分与 Phase 2/4 同里程碑合入 `2f84e3b`

---

## 里程碑

| ID  | 条件                        | Status |
| --- | --------------------------- | ------ |
| M0  | 扫描 + 本 task              | DONE   |
| M1  | Phase 1 mm-options-app 拆分 | DONE   |
| M2  | Phase 2 mm-scripts-app 拆分 | DONE   |
| M3  | Phase 4 background 拆分     | DONE   |
| M4  | Phase 3 NodeSelector 拆分   | SKIP   |
| M5  | Phase 5 tailwind 拆分       | DONE   |
| M6  | Phase 6 观察名单            | TODO   |

---

## 参考命令（复扫）

```bash
find . -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) \
  ! -path '*/node_modules/*' ! -path '*/.next/*' ! -path '*/dist/*' \
  -exec wc -l {} + | sort -rn | head -40
```
