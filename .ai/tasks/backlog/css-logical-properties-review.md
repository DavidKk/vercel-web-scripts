# CSS 属性用法审查（padding / margin / 逻辑属性）— task thread

Status: **TODO**（审查完成；修复待排期；**不改代码**）

扫描日期: 2026-06-18  
范围: `extension/`、`preset/`、`app/`、`components/` 下 CSS / Tailwind / inline style

---

## 审查结论（摘要）

| 类别                                                   | 结论                                            |
| ------------------------------------------------------ | ----------------------------------------------- |
| **`padding-inline` 误用**                              | **未发现**。全库仅 **1 处**使用，且用法正确     |
| **`padding-block` / `margin-inline` / `margin-block`** | **未使用**                                      |
| **逻辑 vs 物理混用命名**                               | 有：`--mm-logs-row-pad-end` + 物理 `pr-`        |
| **冗余/冲突 utility**                                  | 有：`px-*` 与 `pr-*` / `pl-*` 同条规则并存      |
| **重复声明**                                           | 有：`border-b` + `border-bottom-width: 1px` ×13 |
| **RTL 就绪**                                           | 未做；当前 LTR 为主，物理属性占绝对多数         |

**项目定位**：Extension Admin / Preset 注入 UI / WEB 编辑器均为 **LTR 中文/英文界面**。短期以 **物理属性 + Tailwind `pl/pr/px/py`** 为主即可；若未来要 RTL，再系统性迁移到 `ps/pe/ms/me` 与 `padding-inline-*`。

---

## 概念速查（审查依据）

| 属性                             | 含义                                                               |
| -------------------------------- | ------------------------------------------------------------------ |
| `padding` / `padding-top` 等     | **物理**四向内边距                                                 |
| `padding-inline`                 | **逻辑**：行内方向（LTR 下≈左右；RTL 下左右对调）                  |
| `padding-block`                  | **逻辑**：块方向（LTR 下≈上下）                                    |
| `margin-inline` / `margin-block` | 同上，作用于 margin                                                |
| Tailwind `px-*`                  | 物理 `padding-left` + `padding-right`（**不是** `padding-inline`） |
| Tailwind `ps-*` / `pe-*`         | 逻辑 `padding-inline-start` / `padding-inline-end`                 |

常见误用（本库**未发现**第 1、2 类）：

1. 需要上下间距却写了 `padding-inline` → 应 `padding-block` 或 `py-*`
2. 需要左右不对称却写了 `padding-inline: 1rem` → 应 `ps-*`/`pe-*` 或 `pl-*`/`pr-*`
3. 已写 `px-*` 再写 `pr-*` → `px` 设置的右内边距被覆盖，**意图不清**

---

## 已确认正确

### `padding-inline`（唯一一处，已随模块删除）

原 `preset/src/ui/string-tool/index.css` 中 CodeMirror gutter 的 `padding-inline` 用法已确认正确；该模块已于 2026-06 删除（见 `tasks/done/preset-cm-ui-removal.md`）。当前 Preset 无 CM 编辑器 UI，同类审查待未来 `editor-lib` 落地时再覆盖。

### `inset: 0` 全屏层

modal / backdrop / overlay 使用 `inset: 0` 或 Tailwind `inset-0` — ✅ 正确（四向定位 shorthand，非 padding/margin 逻辑属性混用）。

---

## 待修复项（按优先级）

### P0 — 冗余或冲突的 padding/margin 声明

| ID     | 文件                                               | 问题                                                        | 建议改法                                     |
| ------ | -------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------- |
| **C1** | `extension/src/ui/tailwind.css` ~726               | `@apply … px-1.5 … pr-2.5` — `px` 已设左右，`pr` 再覆盖右侧 | 改为 `pl-1.5 pr-2.5 py-0.5`（去掉 `px-1.5`） |
| **C2** | `app/editor/components/ShortcutsHelpModal.tsx` ~78 | `px-4 py-3 pr-6` — 右侧需留滚动条空间                       | 改为 `pl-4 pr-6 py-3`（去掉 `px-4`）         |

**验收**：DevTools 计算后左右 padding 与改前一致；无样式视觉回归。

---

### P1 — 命名与属性语义不一致（逻辑名 + 物理属性）

| ID     | 文件                                               | 问题                                                                                           | 建议                                                                                                                                       |
| ------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **C3** | `extension/src/ui/tailwind.css` ~397–398, 704, 797 | CSS 变量 `--mm-logs-row-pad-x` / `--mm-logs-row-pad-end`；后者配 `pr-[var(...)]`（物理 right） | **二选一**：① 变量改名为 `--mm-logs-row-pad-right`；或 ② 改用 `pe-[var(--mm-logs-row-pad-end)]`（Tailwind `pe-*`）并在注释标明 logical end |
| **C4** | 同上 ~704                                          | `pl-[var(--mm-logs-row-pad-x)]` — 变量名 `-x` 实为 start 侧                                    | 改名为 `--mm-logs-row-pad-start` + `ps-*`，或与 C3 统一为 `-left`/`-right` 物理命名                                                        |

**原则**：变量名与 Tailwind utility 类型一致 — **logical 名配 `ps/pe/ms/me`，物理名配 `pl/pr/ml/mr`**。

---

### P2 — 重复 / 可简化的 CSS（非逻辑属性误用，但应清理）

| ID     | 文件                                                  | 问题                                                               | 建议                                                             |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| **C5** | `extension/src/ui/tailwind.css`                       | `@apply border-b …` 后又写 `border-bottom-width: 1px`（**13 处**） | 删除冗余 `border-*-width: 1px`（`border-b`/`border-t` 已是 1px） |
| **C6** | `extension/src/ui/tailwind.css` ~258–259, 281–282     | `padding-left: 0; padding-right: 0` 裸写                           | 合并为 `@apply px-0` 或 `padding-inline: 0`（与 grid 规则同块）  |
| **C7** | `extension/src/ui/tailwind.css` ~2125–2126, 2286–2287 | `padding-left/right: 1rem` 裸写                                    | 与周围一致改为 `@apply px-4` 或 `padding-inline: 1rem`           |
| **C8** | `preset/src/ui/notification/index.css` ~72–73         | 仅 `padding-top` + `padding-bottom`                                | 可合并为 `padding-block: 11px`（可选，低优先级）                 |
| **C9** | `preset/src/ui/log-viewer/index.css` ~146             | `margin-left: auto` 推挤 actions                                   | LTR 正确；RTL 就绪时改 `margin-inline-start: auto`               |

---

### P3 — 风格统一 / 文档化（无即时 bug）

| ID      | 范围                              | 说明                                                                                                             |
| ------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **C10** | Extension `tailwind.css`          | 大量 `@apply pl-*` / `pr-*` / `text-left` — LTR 合理；**不要**在无 RTL 需求时半套改成 logical                    |
| **C11** | WEB `components/` + `app/`        | 同上，物理 Tailwind 为主                                                                                         |
| **C12** | Preset `*.css`                    | `padding-left`（node-selector corner-widget）— 物理写法，LTR OK                                                  |
| **C13** | 动画 `transform: translateX(...)` | notification / toast 滑入（preset、extension popup）— RTL 下方向可能反；**未来 RTL 里程碑**再改 `translate` 逻辑 |

---

## 不需要改 / 排除项

| 项                                                          | 原因                                     |
| ----------------------------------------------------------- | ---------------------------------------- |
| `-ms-overflow-style`                                        | IE/旧 Edge 滚动条，**不是** CSS 逻辑属性 |
| `data-action="start-add-rule"` 等                           | DOM 属性名，与 CSS 无关                  |
| `inset: 0 auto auto var(--cw-dock-offset)`（corner-widget） | 定位 shorthand 四值写法，正确            |
| `padding: A B` 两值 shorthand（corner-widget）              | 先 block 后 inline，符合规范             |
| 生成文件、Monaco/CodeMirror 第三方样式                      | 不纳入本任务                             |

---

## 建议项目约定（写入 style guide 时）

1. **默认（LTR）**：Tailwind 物理 utility — `pl/pr/pt/pb/px/py`、`ml/mr`、`text-left/right`
2. **需要 RTL 的组件**（若将来有）：成对改用 `ps/pe/ms/me`、`text-start/end`、`border-s/e`
3. **禁止**：同一条规则 `px-*` + `pl-*`/`pr-*`（除非迁移中间态，需注释）
4. **CSS 变量命名**：`-left/-right/-x`（物理）或 `-start/-end`（逻辑），**勿混用**
5. **`padding-inline`**：仅在对称行内 padding 且有意支持 RTL 时使用；上下间距用 `py-*` 或 `padding-block`
6. **裸 CSS 与 `@apply`**：同一文件内优先一种风格（tailwind.css 大文件清理时可统一）

---

## 实施顺序

| 阶段  | 内容                             | 风险                         |
| ----- | -------------------------------- | ---------------------------- |
| **1** | C1、C2（冗余 px+pr）             | 低                           |
| **2** | C5（删重复 border-width）        | 低                           |
| **3** | C3、C4（logs 表格 pad 变量命名） | 低（仅命名/utility，值不变） |
| **4** | C6、C7（padding 裸写统一）       | 低                           |
| **5** | C8–C13、约定文档                 | 可选                         |

每阶段独立 PR；与 `large-file-split` Phase 5（tailwind 拆分）可合并规划。

---

## 提需求检查清单

- [ ] 确认 **不做 RTL** 短期目标 → P3 仅文档化，C3/C4 选物理命名方案即可
- [ ] 确认 C1/C2 是否纳入近期 Extension/Editor 小 PR
- [ ] 确认是否在 `.ai/knowledge/glossary.md` 或 `.cursor/skills` 追加 CSS 约定一节

---

## 里程碑

| ID  | 条件                | Status |
| --- | ------------------- | ------ |
| M0  | 全库扫描 + 本 task  | DONE   |
| M1  | P0（C1–C2）修复     | TODO   |
| M2  | P1（C3–C4）修复     | TODO   |
| M3  | P2（C5–C9）清理     | TODO   |
| M4  | 项目 CSS 约定落文档 | TODO   |

---

## 扫描命令（复扫）

```bash
# 逻辑属性
rg 'padding-inline|padding-block|margin-inline|margin-block|inset-inline|border-inline' \
  --glob '*.{css,tsx,ts,ejs,html}' --glob '!node_modules'

# 冗余 px + pr/pl（需人工看上下文）
rg 'px-[^\s"\']+.*\bpr-|px-[^\s"\']+.*\bpl-' \
  --glob '*.{css,tsx,ts,ejs}'

# 重复 border-width
rg 'border-bottom-width: 1px' extension/src/ui/tailwind.css
```
