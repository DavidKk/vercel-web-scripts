# Preset CM 编辑器 UI 移除

Status: **DONE** (2026-06)

Related: `../../specs/ui-cross-module-review.md` §3.14、`../backlog/ui-cross-module-dedup.md` D1

---

## 背景

`string-tool`、`compiled-code-viewer`、`codemirror-editor` 及 `preset/src/codemirror.ts` 均为孤儿模块（从未 `import` 进 `entry-ui.ts`），且将 CodeMirror 6 打入 preset 会增加 bundle 体积。产品决策：preset 保持轻量；富编辑能力留待独立 `editor-lib` OTA 模块或各 Gist 脚本按需方案。

## 已删除

| 路径                                  | 说明                                           |
| ------------------------------------- | ---------------------------------------------- |
| `preset/src/ui/codemirror-editor/`    | CM6 Web Component (`gme-codemirror-editor`)    |
| `preset/src/ui/string-tool/`          | 字符串工具 overlay（hash/UUID/JSON/Base64 等） |
| `preset/src/ui/compiled-code-viewer/` | 编译脚本只读查看 modal                         |
| `preset/src/codemirror.ts`            | `@codemirror/*` 重导出                         |

## 其他变更

- `package.json`：移除 `@codemirror/lang-javascript`、`lang-json`、`language`、`state`、`theme-one-dark`、`view`
- `preset/src/ui/shared/vws-ui-tokens.css`：移除 `.string-tool`、`.compiled-code-viewer` 选择器

## 运行时影响

**无**。上述模块未接入 `preset-ui.js`，删除前后生产行为一致。

## 功能替代（未在本任务实现）

| 原能力                      | 后续方向                                                   |
| --------------------------- | ---------------------------------------------------------- |
| String tool（hash/JSON 等） | 独立 Gist 脚本或 WEB 工具                                  |
| Compiled code viewer        | command-palette 可另接轻量 `<pre>` 方案，或等 `editor-lib` |
| 页面内代码编辑              | `editor-lib` OTA 模块 — 见 `../done/editor-lib.md`         |

## 验收

- [x] 代码与依赖已删除
- [x] `tsc -p preset/tsconfig.json` 通过
- [x] `preset.js` / `preset-ui.js` 构建通过
- [x] `.ai` 文档与 D1 任务已关闭
