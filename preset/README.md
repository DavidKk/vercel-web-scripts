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

产物：`preset/dist/ipreset.js`（及 sourcemap）。

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
