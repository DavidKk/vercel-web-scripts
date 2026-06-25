# Editor Lib — 共享代码编辑器 OTA 模块

Status: **DONE** (2026-06)

前置: `../done/preset-cm-ui-removal.md`（已从 preset 移除 CM 相关 UI，为本模块腾位置）  
相关: `../../specs/modules-registry.yaml`、`../../specs/runtime-modularization.md`、`../../specs/ui-cross-module-review.md` §3.14

---

## Objective

提供 **独立于 preset-ui** 的可选 OTA 模块 `editor-lib`，供 Gist 油猴脚本按需加载富文本/代码编辑能力，避免：

- 每个脚本各自嵌入 CDN CodeMirror（重复下载、版本分裂、难维护）
- 将 CodeMirror 打回 `preset-ui.js`（bundle 变重、大部分用户用不到）

**已实现 v1**：OTA 懒加载、direct + iframe 模式、6 个 profile、文档/SKILL/MCP 摘要。

---

## 背景与动机

| 现状                                                                       | 问题                                  |
| -------------------------------------------------------------------------- | ------------------------------------- |
| WEB `/editor` 使用 Monaco                                                  | 体量大，不适合页面注入 / 油猴 overlay |
| preset 已删除 `codemirror-editor` / `string-tool` / `compiled-code-viewer` | preset 保持轻量 ✅                    |
| Gist 脚本如 `shopline-local-render-idb-editor.ts` 自建 iframe + CM5 CDN    | 功能完整但孤岛、难复用                |
| 无统一 `editor-lib`                                                        | 新脚本仍会复制粘贴编辑器逻辑          |

---

## 已确认原则（评审时勿重新争论）

| 原则                 | 说明                                                                     |
| -------------------- | ------------------------------------------------------------------------ |
| preset 不背编辑器    | `preset-ui.js` 不含 CM/Monaco                                            |
| Monaco 保持 WEB 专用 | `components/ScriptEditor`，不与 editor-lib 合并                          |
| 窄 API               | 只暴露 `create` / `destroy` + **profile**，不允许脚本随意拼 CM extension |
| 可选 + 懒加载        | 与 `preset-ui` 同级；默认启动路径不受影响                                |
| 第三方页面隔离       | Shopline 后台等场景支持 `isolated: true`（iframe）                       |
| 能力增量在 lib 内    | 新语言/折叠/主题 → 加 profile 或 lib 版本，不在业务脚本复制              |

---

## 架构定位

```
Launcher（必载）
  └── preset-core（必载）
        ├── preset-ui（可选 lazy）     ← 调试 UI、command-palette 等
        ├── script-bundle（可选 lazy） ← Gist 业务脚本
        └── editor-lib（可选 lazy）   ← 本方案（尚未存在）
```

与现有模块关系：

- **dependsOn**: `preset-core`（使用 `GME_fetch`、runtime core 注册、launcher URL 解析）
- **不 dependsOn** `preset-ui`（脚本可在无 debug UI 时单独用编辑器）
- **不 dependsOn** `script-bundle`

---

## 技术方案

### 1. 仓库布局（拟）

```
editor-lib/
├── src/
│   ├── entry.ts              # IIFE 入口，register('editor-lib', api)
│   ├── api.ts                # 对外 EditorLibApi
│   ├── profiles.ts           # profile → CM6 extensions 映射
│   ├── host-direct.ts        # 同文档内 mount（Shadow DOM 或 plain div）
│   ├── host-iframe.ts        # iframe + postMessage（第三方页隔离）
│   └── styles/               # 主题 CSS（?raw 或内联）
├── vite.config.ts            # 输出 editor-lib.js（IIFE）
├── dist/
│   └── editor-lib.js
├── manifest.json             # SHA-1 hash（构建产物，同 preset-ui）
├── tsconfig.json
└── README.md
```

依赖：`@codemirror/*`（CM6）放在 **editor-lib 包内**，不回到根 `package.json` preset 路径（或根 package 仅 editor-lib build 使用，preset build 不引用）。

### 2. 构建与 OTA 分发

对齐 `preset-ui` 模式：

| 项       | 做法                                                                                |
| -------- | ----------------------------------------------------------------------------------- |
| 构建     | `vite build --config editor-lib/vite.config.ts` → `editor-lib/dist/editor-lib.js`   |
| Hash     | 构建写 `manifest.json`（SHA-1）                                                     |
| 静态路由 | `/static/[key]/[hash]/editor-lib.js`（复用 `servePresetOrUiBySegment` 或扩展 kind） |
| Manifest | `module-manifest.json` 增加 `id: editor-lib`，`optional: true`，`lazy: true`        |
| 缓存     | 与 preset-ui 相同：GM 存储 + hash 比对 + cache-first                                |

需改动的服务端/类型（实现阶段）：

- [ ] `services/runtime/moduleManifest.ts` — `RuntimeModuleKind` 增加 `editor-lib`
- [ ] `services/tampermonkey/gmCore.ts` — `getEditorLibManifest` / `getEditorLibBundle`
- [ ] `app/static/[key]/[hash]/editor-lib.js/route.ts`（或泛化现有 route）
- [ ] `.ai/specs/modules-registry.yaml` — 注册模块
- [ ] `package.json` scripts — `build:editor-lib`、纳入 `build` / `dev` 流程（待定）

### 3. 运行时加载（拟）

在 `preset-core` 或 `shared/` 提供 loader（类似 `ensureOptionalUi`）：

```ts
/** 懒加载 editor-lib；并发调用合并为一次 fetch+exec */
async function ensureEditorLib(): Promise<EditorLibApi | null>
```

流程：

1. 读 `module-manifest.json`，取 `editor-lib` 的 `url` + `hash`
2. 比对本地 GM 缓存（etag/hash）
3. `GME_fetch` → CSP-safe execute（复用 `optional-ui` / `csp-script-executor` 路径）
4. `runtimeCore.get('editor-lib')` 返回 API；`emit('module:editor-lib:loaded')`

**FR**：`editor-lib` 加载失败不得阻断 preset-core / script-bundle 正常执行。

### 4. 对外 API（v1 草案）

注册到 runtime core：`core.register('editor-lib', api, { minApiVersion: 1 })`

```ts
type EditorProfile = 'plain' | 'json' | 'javascript' | 'html' | 'css' | 'markdown'

interface EditorLibCreateOptions {
  /** 挂载容器（direct 模式必填） */
  parent: HTMLElement
  profile?: EditorProfile
  readOnly?: boolean
  value?: string
  /** 内容变更回调 */
  onChange?: (value: string) => void
  /**
   * true：iframe 隔离（推荐用于 Shopline 等第三方后台）
   * false：在 parent 内直接 mount CM6
   */
  isolated?: boolean
}

interface EditorHandle {
  getValue(): string
  setValue(value: string): void
  focus(): void
  destroy(): void
}

interface EditorLibApi {
  version: 1
  ready: true
  create(options: EditorLibCreateOptions): EditorHandle
}
```

**v1 刻意不包含**（避免变重；后续版本按需加 profile 能力）：

- VS Code 式 chord 折叠层级（Cmd+K 0–6）
- 多主题切换 API
- 自定义 extension 注入
- LSP / autocomplete

### 5. Profile 与能力矩阵（v1 目标）

| profile      | 语法高亮 | 行号 | 只读 | 备注                         |
| ------------ | -------- | ---- | ---- | ---------------------------- |
| `plain`      | 无/基础  | ✅   | 可选 | 默认                         |
| `json`       | JSON     | ✅   | 可选 | 替代原 string-tool JSON 场景 |
| `javascript` | JS       | ✅   | 可选 | 替代 compiled-code-viewer    |
| `html`       | HTML     | ✅   | 可选 | IDB 主题文件                 |
| `css`        | CSS      | ✅   | 可选 |                              |
| `markdown`   | MD       | ✅   | 可选 |                              |

折叠（code fold）是否进 v1：**待确认**（IDB 脚本依赖较强，进 v1 会增加体积与 iframe 协议复杂度）。

### 6. 隔离模式（isolated）

**direct 模式**：CM6 `EditorView` mount 到 `parent`；样式用 Shadow DOM 或 scoped CSS，避免被页面 CSS 污染。

**iframe 模式**（参考现有 IDB 脚本，但 lib 内维护一份）：

```
脚本页面
  └── ensureEditorLib()
        └── create({ isolated: true, parent })
              └── <iframe srcdoc="...CM6 bundle...">
                    └── postMessage 协议（set/get/readonly/focus/destroy）
```

协议 message type 前缀建议：`vws-editor-*`（与 IDB 脚本 `lr-cm-*` 解耦，迁移时适配层可过渡）。

### 7. Gist 脚本作者用法（目标态）

```ts
// ==UserScript==
// @grant        none
// （无需 @connect cdnjs；编辑器来自自托管 OTA）
// ==/UserScript==

async function mountEditor(host: HTMLElement, initial: string) {
  const editor = await ensureEditorLib()
  if (!editor) {
    GME_fail('[my-script] editor-lib unavailable')
    return null
  }
  return editor.create({
    parent: host,
    profile: 'javascript',
    value: initial,
    isolated: true,
    onChange: GME_debounce((v) => save(v), 300),
  })
}
```

**备选：纯 Tampermonkey `@require`**（不经过 OTA manifest，适合非 MagickMonkey launcher 环境）：

```js
// @require https://<host>/static/<key>/<hash>/editor-lib.js
```

同一 `@require` URL 在同一页面只执行一次。OTA 路径仍推荐（hash 与 manifest 统一）。

### 8. 文档与 AI 集成（实现后）

| 产出         | 路径                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------- |
| Cursor Skill | `.cursor/skills/editor-lib/SKILL.md`                                                     |
| 静态文档     | `public/docs/editor-lib-skill.md`                                                        |
| MCP 摘要     | `scripts_runtime_summary` 增加 `editor-lib` API                                          |
| Typings      | `preset/src/editor-typings.d.ts` 增加 `ensureEditorLib` / `EditorLibApi`（若暴露在 GME） |

作者规则（写入 SKILL）：

- 需要代码高亮/多行编辑 → `ensureEditorLib()` + profile
- 简单输入 → `textarea` / `pre`
- WEB 主 IDE → Monaco（与本模块无关）
- **禁止**在 Gist 脚本内嵌 cdnjs CodeMirror srcdoc（除非明确 offline/legacy 例外）

---

## 迁移计划（确认立项后）

| 阶段   | 内容                                                                                |
| ------ | ----------------------------------------------------------------------------------- |
| **M0** | 本 TODO 评审通过                                                                    |
| **M1** | `editor-lib` 骨架 + build + 静态分发 + manifest 条目                                |
| **M2** | `ensureEditorLib()` + direct 模式 + `plain`/`json`/`javascript`                     |
| **M3** | iframe 隔离模式 + 文档/SKILL                                                        |
| **M4** | 试点：`shopline-local-render-idb-editor.ts` 去掉内联 CM5，改调 editor-lib ✅ v1.4.0 |
| **M5** | （可选）command-palette 只读编译查看接 `javascript` profile                         |

---

## 待确认问题（评审清单）

- [ ] **是否立项**：editor-lib vs 继续允许各脚本 CDN 自给自足？
- [ ] **v1 是否包含 code fold**：IDB 脚本强依赖；不含则迁移体验降级
- [ ] **iframe vs direct 默认**：第三方页默认 `isolated: true` 是否 OK？
- [ ] **依赖 preset-ui 吗**：建议否；需确认无 hidden 耦合
- [ ] **build 是否进 CI 默认 `pnpm build`**：会增加构建时间与 artifact 体积
- [ ] **Extension 安装路径**：Chrome extension launcher 是否同样加载 editor-lib？
- [ ] **体积预算**：editor-lib.js gzip 目标上限（建议 < 150KB gzip 作讨论基线）

---

## 明确 Out of scope（除非单独立项）

- 将 editor-lib 合并进 preset-ui
- 用 editor-lib 替换 WEB Monaco ScriptEditor
- 在 preset-ui 恢复 string-tool / compiled-code-viewer
- 支持脚本侧自定义 CM6 extension 组合
- 离线 / 无 network 场景的完整编辑器体验（可文档说明降级为 textarea）

---

## 实施 checklist（确认后执行）

### Phase A — 基础设施

- [x] **A1** 创建 `editor-lib/` 目录与 vite IIFE build
- [x] **A2** 静态路由 + `gmCore` manifest/bundle 读取
- [x] **A3** `module-manifest.json` + `modules-registry.yaml` 注册
- [x] **A4** `ensureEditorLib()` loader（cache、hash、CSP execute）
- [x] **A5** runtime core 注册 `editor-lib` + 版本握手

### Phase B — 编辑器能力

- [x] **B1** `profiles.ts` + direct 模式 CM6 mount
- [x] **B2** `EditorHandle` 生命周期（destroy 清理 listener/view）
- [x] **B3** iframe 模式 + postMessage 协议
- [ ] **B4** （可选）fold profile / keymap — 留待 v2

### Phase C — 文档与试点

- [x] **C1** SKILL + `public/docs/editor-lib-skill.md`
- [x] **C2** `editor-typings.d.ts` + `scripts_runtime_summary`
- [x] **C3** IDB 脚本迁移 POC — `shopline-local-render-idb-editor.ts` v1.4.0（`GME_ensureEditorLib` + isolated iframe；fold chord 降级提示）
- [x] **C4** 单测：iframe 协议、search 开关、jsdom 挂载/生命周期、样式注入（`__tests__/editor-lib/`）

### Phase D — 验收

- [x] **D1** preset-core 单独可用；editor-lib 失败不阻断脚本
- [x] **D2** 同一 manifest URL 多脚本共享一次加载（`ensureEditorLibInflight` 合并）
- [x] **D3** hash 变更后 OTA 更新生效（content-addressed URL + GM 缓存）
- [x] **D4** 文档 Status → 移至 `tasks/done/`

---

## 验收标准（完成后）

- [x] `editor-lib.js` 可通过 manifest URL 懒加载，且与 preset-ui 互不依赖
- [x] Gist 脚本仅用 `ensureEditorLib().create(...)` 即可获得 JS/JSON 编辑，无需 cdnjs
- [x] 至少 1 个生产脚本（IDB editor）完成迁移或 POC — `shopline-local-render-idb-editor.ts` v1.4.0
- [x] AI/MCP 文档可发现本模块及使用约束

---

## 参考

| 项               | 路径                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------- |
| preset-ui 懒加载 | `preset/src/services/optional-ui.ts`                                                  |
| module manifest  | `services/runtime/moduleManifest.ts`                                                  |
| 静态分发         | `services/runtime/servePresetOrUiBySegment.ts`                                        |
| CM 移除记录      | `tasks/done/preset-cm-ui-removal.md`                                                  |
| IDB 脚本现状     | Gist `shopline-local-render-idb-editor.ts` v1.4.0（editor-lib OTA；fold chord 待 v2） |
