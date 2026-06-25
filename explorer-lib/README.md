# explorer-lib

Optional OTA module: file explorer chrome aligned with WEB `FileListPanelHeader` (title + search icon + expandable search row + tree host).

## Build

```bash
pnpm run build:explorer-lib
```

## Runtime

```ts
const explorer = await GME_ensureExplorerLib()

// Explorer file tree header + search (WEB FileListPanelHeader)
const chrome = explorer?.createChrome(parent, {
  title: 'Files',
  searchPlaceholder: 'Search files...',
  onSearchChange: (query) => filterTree(query),
})

// Editor tab bar (WEB TabBar)
const tabs = explorer?.createTabBar(tabMount, {
  onTabSwitch: (path) => loadFile(path),
  onTabClose: (path) => unloadFile(path),
  isDirty: (path) => isFileDirty(path),
  renderFileIcon: (name) => iconHtmlForFile(name),
})

chrome?.destroy()
tabs?.destroy()
```

## Docs

- UI tokens: `public/docs/scripts-ui-skill.md`
- WEB reference: `components/ScriptEditor/components/FileListPanel/FileListPanelHeader.tsx`
