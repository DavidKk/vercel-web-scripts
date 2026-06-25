# editor-lib

Optional OTA module providing CodeMirror 6 editors for Gist userscripts.

## Build

```bash
pnpm run build:editor-lib
```

Output: `editor-lib/dist/editor-lib.js` + `editor-lib/dist/manifest.json` (SHA-1 hash).

## Local manual testing (maintainers)

`pnpm dev` builds/serves OTA artifacts. On **any injected page** (no extra dev UI route):

1. **Cmd/Ctrl+Shift+P** → search `ota` or `editor-lib`
2. Run **DEBUG OTA: Test editor-lib**

A panel mounts on the current page via `GME_ensureEditorLib()` — switch profile, direct/iframe, readOnly, Remount. Toggle the same command again to close.

Registered in `preset/src/ui/command-palette/debug-ota.ts` (`__IS_DEVELOP_MODE__` only).

## Unit tests

```bash
pnpm test -- __tests__/editor-lib __tests__/preset/command-palette-debug-ota
```

## Runtime

Loaded lazily via `ensureEditorLib()` in preset-core. Registered on `__VWS_CORE__` as `editor-lib`.

```ts
const editor = await ensureEditorLib()
const handle = editor?.create({
  parent: hostElement,
  profile: 'javascript',
  value: '...',
  isolated: true,
  onChange: (v) => save(v),
})
```

## Profiles (v1)

`plain`, `json`, `javascript`, `html`, `css`, `markdown`

## Built-in shortcuts (VS Code style)

### 查找 / 替换

| Shortcut                        | Action                                     |
| ------------------------------- | ------------------------------------------ |
| Cmd/Ctrl+F                      | 打开搜索                                   |
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

搜索面板为紧凑两行布局，**浮动叠在编辑器右上角**（约 420px 宽，不占文档流高度）：查找框内嵌 Aa / 全词 / 正则 **MDI 图标**切换（`unplugin-icons` + `@iconify-json/mdi`，与 preset 一致）；替换与全部替换为图标按钮。上一个、下一个、全部匹配无面板按钮，请用上述快捷键。

### 编辑

| Shortcut                  | Action          |
| ------------------------- | --------------- |
| Cmd/Ctrl+L                | 选中当前行      |
| Alt+↑ / Alt+↓             | 上/下移行       |
| Shift+Alt+↑ / Shift+Alt+↓ | 上/下复制行     |
| Shift+Cmd/Ctrl+K          | 删除行          |
| Cmd/Ctrl+[ / ]            | 减少 / 增加缩进 |
| Cmd/Ctrl+/                | 切换行注释      |
| Cmd/Ctrl+Z / Shift+Z      | 撤销 / 重做     |

## Docs

- Author skill: `public/docs/editor-lib-skill.md`
- Cursor skill: `.cursor/skills/editor-lib/SKILL.md`
