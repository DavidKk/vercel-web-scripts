# 日志查看器 (Log Viewer) - TODO 列表

## 需求概述

- 除控制台外，提供 UI 查看日志
- 入口：插件下拉框（角标 corner-widget）中增加一个菜单项
- 弹框形式展示日志
- 支持按类型过滤：INFO / WARN / FAIL / OK / DEBUG
- 支持按关键字搜索
- 日志服务需优化：不仅 console 输出，还要持久化存储，可设置最大值，超出时保留后面部分，支持 IndexedDB 存储与删除

---

## TODO 列表

### 一、日志服务 (Log Store Service)

| 序号 | 任务                   | 说明                                                                                                                                                        |
| ---- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | **定义日志条目结构**   | `{ id, level, message, timestamp, rawArgs? }`，level 为 `'info' \| 'warn' \| 'fail' \| 'ok' \| 'debug'`                                                     |
| 1.2  | **内存环形缓冲区**     | 设置 `MAX_LOG_ENTRIES`（如 1000），超出时丢弃最旧的，只保留最新 N 条                                                                                        |
| 1.3  | **IndexedDB 持久化**   | 新建 store `logEntries`，keyPath 可为自增 id 或 `[timestamp, id]`；写入策略：每次 push 时同步写入（或批量 debounce 写入），读取时从 IndexedDB 加载最近 N 条 |
| 1.4  | **可选：日志上限配置** | 最大条数可配置（如 500/1000/2000），存 GM_setValue 或 localStorage                                                                                          |
| 1.5  | **清空日志 API**       | 提供 `clearLogs()`：清空内存 + 清空 IndexedDB 中当前脚本的日志                                                                                              |
| 1.6  | **导出日志 API**       | 可选：导出为 JSON/文本，便于分享或排查                                                                                                                      |

### 二、Logger 改造 (helpers/logger.ts)

| 序号 | 任务                 | 说明                                                                                                                                                                         |
| ---- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1  | **桥接到 Log Store** | 在 `GME_ok` / `GME_info` / `GME_warn` / `GME_fail` / `GME_debug` 以及 `createGMELogger` 各方法内，在调用 `console.log` 之前/之后，将「格式化后的单条日志」push 到 Log Store  |
| 2.2  | **格式化存储内容**   | 将 `...contents` 转为可存储的字符串（如 `contents.map(c => typeof c === 'object' ? JSON.stringify(c) : String(c)).join(' ')`），避免存复杂对象；如需支持 %c 可只存纯文本部分 |
| 2.3  | **LogGroup 支持**    | 若需要，`LogGroup` 内每条 log 也写入 Log Store（同上格式）                                                                                                                   |

### 三、Log Viewer UI 组件

| 序号 | 任务             | 说明                                                                                                                                                           |
| ---- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1  | **新建 UI 模块** | 在 `templates/gm-templates/ui/log-viewer/` 下新建 `index.ts`、`index.html`、`index.css`，风格与 corner-widget/notification 一致（Shadow DOM + 内联样式）       |
| 3.2  | **弹框形式**     | 以 Modal/Overlay 形式展示：半透明遮罩 + 居中或偏右白/暗色面板，带标题栏「日志查看器」和关闭按钮                                                                |
| 3.3  | **列表展示**     | 主体区域为可滚动的日志列表，每条显示：图标(类型) + 时间 + 文本；不同类型用不同颜色（info/ok/warn/fail/debug）                                                  |
| 3.4  | **类型过滤**     | 顶部或侧边提供筛选：INFO / WARN / FAIL / OK / DEBUG 多选（复选框或 Tag 切换），默认全选                                                                        |
| 3.5  | **关键字搜索**   | 输入框，实时过滤 message 包含关键字的条目（可区分大小写选项，可选）                                                                                            |
| 3.6  | **清空按钮**     | 提供「清空日志」按钮，调用 Log Store 的 `clearLogs()` 并刷新列表                                                                                               |
| 3.7  | **自动滚动**     | 可选：新日志时自动滚动到底部；提供「暂停自动滚动」开关                                                                                                         |
| 3.8  | **注册到模板**   | 在根目录 `templates/index.ts` 的 `getUIModules()` 中注册 log-viewer 模块，并在编译/注入逻辑中确保该 UI 会被注入到页面（若采用与 corner-widget 相同的注入方式） |

### 四、入口：角标下拉菜单

| 序号 | 任务                | 说明                                                                                                                                                                                                                |
| ---- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1  | **角标菜单项**      | 在 `services/menu.ts` 的 `registerBasicMenus` 中**不**使用 Tampermonkey 的 `GM_registerMenuCommand`，而是改为在**注入 corner-widget 的脚本**里调用 `GME_registerMenuCommand` 增加一项：「查看日志」或「Log Viewer」 |
| 4.2  | **菜单位置**        | 若 corner-widget 的菜单目前来自 PRE_MENU 或后续动态添加，则在合适位置（如 main 或 menu 初始化处）调用 `GME_registerMenuCommand({ id: 'log-viewer', text: '查看日志', icon: '📋', action: () => { ... } })`          |
| 4.3  | **打开 Log Viewer** | `action` 中：创建或获取 log-viewer 组件实例，打开弹框（如 `document.querySelector('vercel-web-script-log-viewer')?.open()` 或挂载到 body 并 show）                                                                  |

### 五、工程与类型

| 序号 | 任务                    | 说明                                                                                                                                                              |
| ---- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1  | **editor-typings.d.ts** | 若有新全局方法（如 `GME_getLogStore()`、`GME_openLogViewer()`），在 editor-typings 中声明                                                                         |
| 5.2  | **编译与注入**          | 确认 createUserScript 或相关构建会把 log-viewer 的 html/css/ts 打进脚本，并在合适时机将 `<vercel-web-script-log-viewer>` 插入到 body（或与 corner-widget 同容器） |
| 5.3  | **IndexedDB 命名**      | 库名建议：`vercel_web_script_logs` 或与现有脚本共用一个 DB 加单独 store；store 名：`logEntries`；需考虑多脚本/多域名隔离（key 可带 scriptId 或 host）             |

### 六、测试与收尾

| 序号 | 任务         | 说明                                                                                                             |
| ---- | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| 6.1  | **手动测试** | 在本地/编辑器环境触发 GME_info/GME_ok/GME_fail 等，确认控制台有输出且 Log Viewer 中能看见、过滤、搜索、清空正常  |
| 6.2  | **边界**     | 日志条数达到上限时，旧记录被丢弃且 IndexedDB 同步删除或覆盖；无 IndexedDB 环境（如隐私模式）降级为仅内存，不报错 |

---

## 建议实现顺序

1. **Log Store Service**（1.1～1.5）→ 独立模块，可先写单测或控制台测。
2. **Logger 改造**（2.1～2.2）→ 让现有 GME\_\* 写入 Log Store。
3. **Log Viewer UI**（3.1～3.7）→ 只读内存/Store 数据，先不接菜单。
4. **角标菜单入口**（4.1～4.3）→ 点击菜单打开 Log Viewer。
5. **注册与编译**（3.8、5.x）→ 确保脚本里包含 log-viewer 并注入 DOM。
6. **测试与边界**（6.x）。

---

## 待确认点

- [x] 日志最大条数默认值：**1000**
- [x] IndexedDB：**新建** `vercel_web_script_logs`（store: logEntries）
- [x] 入口：**Tampermonkey 原生菜单**（`GM_registerMenuCommand('查看日志', ...)`）
- [x] DEBUG：**默认不展示**（过滤里 DEBUG 复选框默认不勾选）

已按上述实现。
