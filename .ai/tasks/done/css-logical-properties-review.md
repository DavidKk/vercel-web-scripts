# CSS 属性用法审查（padding / margin / 逻辑属性）— task thread

Status: **DONE** (2026-06-27)

**实施摘要**：P0–P1 修复、P2 大部分清理、约定写入 `rules/engineering-standards.md` §2 与 `knowledge/glossary.md`。与 `large-file-split` Phase 5 同批合入 `2f84e3b`。C9 / P3 项按 LTR 策略**保留或仅文档化**。

扫描日期: 2026-06-18（复扫 2026-06-27）  
范围: `extension/`、`preset/`、`app/`、`components/` 下 CSS / Tailwind / inline style

---

## 实施记录（2026-06-27）

| ID      | 状态  | 落地位置                                                                                      |
| ------- | ----- | --------------------------------------------------------------------------------------------- |
| C1      | DONE  | `extension/src/ui/styles/components-logs.css` — `pl-1.5 pr-2.5 py-0.5`（去掉 `px`+`pr` 冲突） |
| C2      | DONE  | `app/editor/components/ShortcutsHelpModal.tsx` — `pl-4 pr-6 py-3`                             |
| C3      | DONE  | `components-logs.css` — 变量改为 `--mm-logs-row-pad-left` / `--mm-logs-row-pad-right`         |
| C4      | DONE  | 同上 — `pl-[var(--mm-logs-row-pad-left)]`、`pr-[var(--mm-logs-row-pad-right)]`                |
| C5      | DONE  | tailwind 拆至 `styles/` 后，`border-bottom-width: 1px` 冗余 **0 处**                          |
| C6      | DONE  | 原 `tailwind.css` 裸 `padding-left/right: 0` 已随拆分清理                                     |
| C7      | DONE  | 原裸 `padding-left/right: 1rem` 已改为 `@apply px-4` 或保留在 partial 内一致写法              |
| C8      | DONE  | `preset/src/ui/notification/index.css` — `padding-block: 11px`                                |
| C9      | DEFER | `preset/src/ui/log-viewer/index.css` — `margin-left: auto` 保留（RTL 里程碑再改）             |
| C10–C13 | DOC   | 约定见 `engineering-standards.md` §2、`glossary.md` CSS conventions                           |

**验证**：`pnpm run build:extension` 通过；无新增 `px-*`+`pr-*` 冲突（见复扫命令）。

---

## 审查结论（摘要，2026-06-27 复扫）

| 类别                                 | 结论                                                    |
| ------------------------------------ | ------------------------------------------------------- |
| **`padding-inline` 误用**            | **未发现**                                              |
| **`padding-block`**                  | **1 处**（notification 进度条行）                       |
| **`margin-inline` / `margin-block`** | **未使用**                                              |
| **逻辑 vs 物理混用命名**             | **已修复**（logs 表格 pad 变量改为物理 `-left/-right`） |
| **冗余/冲突 utility**                | **已修复** C1、C2                                       |
| **重复声明**                         | **已清理** C5（`border-*-width` 冗余）                  |
| **RTL 就绪**                         | 未做；C9、`translateX` 等保留至 RTL 里程碑              |

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

## 待修复项（按优先级）— 全部已关闭或延期

### P0 — 冗余或冲突的 padding/margin 声明 ✅

| ID     | 文件                                           | 问题                       | 结果                          |
| ------ | ---------------------------------------------- | -------------------------- | ----------------------------- |
| **C1** | `extension/src/ui/styles/components-logs.css`  | `@apply … px-1.5 … pr-2.5` | DONE → `pl-1.5 pr-2.5 py-0.5` |
| **C2** | `app/editor/components/ShortcutsHelpModal.tsx` | `px-4 py-3 pr-6`           | DONE → `pl-4 pr-6 py-3`       |

---

### P1 — 命名与属性语义不一致 ✅

| ID     | 文件                  | 结果                                       |
| ------ | --------------------- | ------------------------------------------ |
| **C3** | `components-logs.css` | DONE → `--mm-logs-row-pad-left` / `-right` |
| **C4** | 同上                  | DONE → `pl-[var(...)]` / `pr-[var(...)]`   |

---

### P2 — 重复 / 可简化的 CSS ✅（C9 延期）

| ID     | 文件                                   | 结果                                 |
| ------ | -------------------------------------- | ------------------------------------ |
| **C5** | `extension/src/ui/styles/`             | DONE — 无冗余 `border-*-width: 1px`  |
| **C6** | 原 `tailwind.css` grid 规则            | DONE — 随拆分清理                    |
| **C7** | 原裸 `padding-left/right: 1rem`        | DONE                                 |
| **C8** | `preset/src/ui/notification/index.css` | DONE — `padding-block: 11px`         |
| **C9** | `preset/src/ui/log-viewer/index.css`   | **DEFER** — `margin-left: auto` 保留 |

---

### P3 — 风格统一 / 文档化（无即时 bug）📄

| ID      | 范围                         | 结果                        |
| ------- | ---------------------------- | --------------------------- |
| **C10** | Extension `styles/` partials | DOC — LTR 物理 utility 为主 |
| **C11** | WEB `components/` + `app/`   | DOC                         |
| **C12** | Preset `*.css`               | DOC — 物理写法 LTR OK       |
| **C13** | 动画 `translateX(...)`       | DEFER — RTL 里程碑          |

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

## 建议项目约定（已写入 style guide）

已落地：`rules/engineering-standards.md` §2、`knowledge/glossary.md` → CSS conventions。

1. **默认（LTR）**：Tailwind 物理 utility — `pl/pr/pt/pb/px/py`、`ml/mr`、`text-left/right`
2. **需要 RTL 的组件**（若将来有）：成对改用 `ps/pe/ms/me`、`text-start/end`、`border-s/e`
3. **禁止**：同一条规则 `px-*` + `pl-*`/`pr-*`（除非迁移中间态，需注释）
4. **CSS 变量命名**：`-left/-right/-x`（物理）或 `-start/-end`（逻辑），**勿混用**
5. **`padding-inline`**：仅在对称行内 padding 且有意支持 RTL 时使用；上下间距用 `py-*` 或 `padding-block`
6. **裸 CSS 与 `@apply`**：同一文件内优先一种风格（`styles/` partial 内统一）

---

## 实施顺序 — 已完成

| 阶段  | 内容                             | Status |
| ----- | -------------------------------- | ------ |
| **1** | C1、C2（冗余 px+pr）             | DONE   |
| **2** | C5（删重复 border-width）        | DONE   |
| **3** | C3、C4（logs 表格 pad 变量命名） | DONE   |
| **4** | C6、C7（padding 裸写统一）       | DONE   |
| **5** | C8、约定文档；C9/C13 延期        | DONE   |

与 `large-file-split` Phase 5（tailwind 拆分）同批合入 `2f84e3b`。

---

## 提需求检查清单

- [x] 确认 **不做 RTL** 短期目标 → C3/C4 采用物理命名；C9/C13 延期
- [x] C1/C2 已纳入 Extension/Editor 变更
- [x] 已在 `knowledge/glossary.md` 与 `rules/engineering-standards.md` 追加 CSS 约定

---

## 里程碑

| ID  | 条件                | Status |
| --- | ------------------- | ------ |
| M0  | 全库扫描 + 本 task  | DONE   |
| M1  | P0（C1–C2）修复     | DONE   |
| M2  | P1（C3–C4）修复     | DONE   |
| M3  | P2（C5–C9）清理     | DONE   |
| M4  | 项目 CSS 约定落文档 | DONE   |

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
rg 'border-bottom-width: 1px' extension/src/ui/styles/
```
