# Preset (gm-templates 模块化构建)

将 `templates/gm-templates` 迁移到 `preset/`，全部改为 ES 模块（import/export），使用 Vite 构建，输出 `preset/dist/ipreset.js`。目标环境：Chrome，ESNext。

## 目录结构

```
preset/
├── src/
│   ├── typings.d.ts    # 全局声明（GM_*、__BASE_URL__ 等）
│   ├── entry.ts        # 构建入口，按依赖顺序 import
│   ├── helpers/        # utils, logger, http, dom
│   ├── services/       # log-store, tab-communication, script-update, ...
│   ├── ui/             # corner-widget, notification, log-viewer, node-selector, command-palette
│   ├── rules.ts
│   ├── scripts.ts
│   └── main.ts
├── dist/
│   └── ipreset.js      # 构建产物（IIFE）
├── vite.config.ts
├── tsconfig.json
└── README.md
```

## UI 模块（HTML + CSS）

每个 UI 模块（如 `ui/corner-widget`）包含：

- `index.ts`：逻辑，需 `import css from './index.css?raw'`、`import html from './index.html?raw'`，并 **export** 出 `css`、`html` 供注入用。
- `index.css`：样式，Vite 以 `?raw` 导入为字符串。
- `index.html`：模板，Vite 以 `?raw` 导入为字符串。

在 `preset/src/typings.d.ts` 中已声明：

```ts
declare module '*.css?raw' {
  const content: string
  export default content
}
declare module '*.html?raw' {
  const content: string
  export default content
}
```

UI 的 `index.ts` 示例：

```ts
import css from './index.css?raw'
import html from './index.html?raw'
// ... 组件逻辑（如注册 custom element）
export { css, html }
```

## 构建

在仓库根目录执行：

```bash
pnpm build:preset
```

产物：`preset/dist/preset.js`（及 sourcemap）。

## 开发流程（推荐）

开发 preset 时不必每次改完都手动刷新浏览器，可按下面方式实现「改代码 → 自动构建 → 所有标签页自动刷新」：

1. **在仓库根目录执行**

   ```bash
   pnpm dev
   ```

   会同时启动 Next 开发服务器和 Vite 的 preset 监听（`build:preset:dev`），preset 源码变更会自动重新构建。

2. **保持至少一个「同源」标签页打开**  
   例如打开本地的编辑器页：`http://localhost:3000/editor`（或任意 `http://localhost:3000/...` 的页面）。  
   该页面会通过 SSE 接收「preset 已重新构建」事件；收到后会自动清除预设缓存并刷新当前页，同时通过 GM 存储通知**所有其他标签页**（包括其他站点上的脚本页）刷新，从而加载最新 preset。

3. **日常操作**
   - 改 `preset/src` 下任意文件并保存。
   - 等待终端里 Vite 输出构建完成。
   - 几秒内所有已安装 launcher 的标签页会自动刷新并加载新 preset，无需手动刷新。

若只跑 `pnpm build:preset` 而不跑 `pnpm dev`，则没有 SSE 推送，需要手动刷新浏览器才能看到最新 preset。

## 迁移状态

- [x] typings.d.ts（含 ?raw 声明）
- [x] helpers/utils.ts
- [x] services/log-store.ts
- [x] helpers/logger.ts（import logStore）
- [ ] helpers/http.ts
- [ ] helpers/dom.ts
- [ ] services/\*（tab-communication, script-update, dev-mode, script-execution, editor-dev-mode, local-dev-mode, menu, cli-service）
- [ ] rules.ts, scripts.ts
- [ ] main.ts
- [ ] ui/\*（各模块 index.ts 使用 ?raw 导入 css/html 并 export）

未迁移的模块可从 `templates/gm-templates` 复制到 `preset/src`，并做以下转换：

1. 将“全局依赖”改为 **import**（如 logger 从 `../services/log-store` 引入 `logStore`）。
2. 在文件末尾 **export** 需要对外暴露的符号。
3. 删除原有的 `const g = globalThis; (g as any).xxx = xxx` 等挂全局的代码。
4. UI 的 `index.ts` 增加 `import css from './index.css?raw'`、`import html from './index.html?raw'` 并 **export { css, html }**。
