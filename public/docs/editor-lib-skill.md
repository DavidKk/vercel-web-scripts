# editor-lib (Gist 脚本代码编辑器)

可选 OTA 模块，提供 CodeMirror 6 富文本/代码编辑能力。与 `preset-ui` 同级、互不依赖。

## 何时使用

| 场景                          | 推荐                                |
| ----------------------------- | ----------------------------------- |
| 多行代码/JSON 编辑 + 语法高亮 | `GME_ensureEditorLib()` + `profile` |
| 简单单行输入                  | `textarea` / `input`                |
| WEB 主 IDE (`/editor`)        | Monaco（与本模块无关）              |
| Shopline 等第三方后台         | `isolated: true`（iframe 隔离）     |

## 禁止

- 在 Gist 脚本内嵌 cdnjs CodeMirror srcdoc（除非明确 legacy/offline 例外）
- 将 CM6 extension 自行拼装进脚本（v1 仅支持 `profile`）

## 用法

```ts
async function mountEditor(host: HTMLElement, initial: string) {
  const editor = await GME_ensureEditorLib()
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

## Profiles (v1)

`plain`, `json`, `javascript`, `html`, `css`, `markdown`

## 快捷键（内置，对齐 VS Code）

### 查找 / 替换

| 快捷键                          | 功能                                       |
| ------------------------------- | ------------------------------------------ |
| Cmd/Ctrl+F                      | 打开内容搜索                               |
| Cmd/Ctrl+H                      | 打开搜索并展开替换（Windows/Linux）        |
| Cmd/Ctrl+Alt+F / Cmd/Ctrl+Alt+H | 打开搜索并展开替换（macOS）                |
| Cmd/Ctrl+G / F3                 | 下一个匹配（搜索面板打开时）               |
| Cmd/Ctrl+Shift+G / Shift+F3     | 上一个匹配                                 |
| Enter（查找框）                 | 下一个匹配；Shift+Enter 上一个             |
| Enter（替换框）                 | 替换当前匹配                               |
| Cmd/Ctrl+D                      | 将下一个相同词加入选区（多光标）           |
| Cmd/Ctrl+Shift+L                | 选中所有相同词                             |
| Escape                          | 关闭搜索面板                               |
| Cmd/Ctrl+Alt+R/C/W              | 切换正则 / 区分大小写 / 全词（搜索面板内） |

搜索面板为紧凑两行布局，**浮动叠在编辑器右上角**（约 420px 宽，不占文档流高度）：查找框内嵌 Aa / 全词 / 正则 **MDI 图标**切换（`editor-lib/src/search-icons.ts`，与 preset `~icons/mdi/*?raw` 同源）；替换与全部替换为图标按钮。上一个、下一个、全部匹配无面板按钮，请用上述快捷键。Gist 脚本图标规范见 `scripts-ui-skill.md`。

### 编辑

| 快捷键                    | 功能            |
| ------------------------- | --------------- |
| Cmd/Ctrl+L                | 选中当前行      |
| Alt+↑ / Alt+↓             | 上/下移行       |
| Shift+Alt+↑ / Shift+Alt+↓ | 上/下复制行     |
| Shift+Cmd/Ctrl+K          | 删除行          |
| Cmd/Ctrl+[ / ]            | 减少 / 增加缩进 |
| Cmd/Ctrl+/                | 切换行注释      |
| Cmd/Ctrl+Z / Shift+Z      | 撤销 / 重做     |

搜索面板勾选 **「正则」** 后，查询按 JavaScript `RegExp` 解析（支持捕获组 `$1` 等用于替换）。语法非法时不会跳转匹配。

搜索面板与滚动条样式与 VWS 暗色 shell（`vws-ui-tokens`）对齐。

## 本地调试（维护者）

`pnpm dev` 提供 OTA 构建产物。在**当前已注入页面**测试，无需打开额外 dev 页面：

**Cmd/Ctrl+Shift+P** → `ota` → **DEBUG OTA: Test editor-lib**

在当前页挂载浮动面板（profile / direct·iframe / readOnly / Remount），走真实 `GME_ensureEditorLib()` 链路。

注册：`preset/src/ui/command-palette/debug-ota.ts`（仅 develop 模式）。

## 加载机制

1. 读 `module-manifest.json` 中 `editor-lib` 的 URL + hash
2. GM 缓存 + ETag 比对
3. CSP-safe execute，注册到 `__VWS_CORE__` 的 `editor-lib`
4. 加载失败**不阻断** preset-core / script-bundle

## 备选：@require

```js
// @require https://<host>/static/<key>/<hash>/editor-lib.js
```

OTA manifest 路径仍推荐（hash 与 manifest 统一）。

## 相关文档

- 技术方案：`.ai/tasks/done/editor-lib.md`
- Typings：`preset/src/editor-typings.d.ts`（`GME_ensureEditorLib`, `EditorLibApi`）
