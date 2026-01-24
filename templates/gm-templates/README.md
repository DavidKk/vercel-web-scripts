# Tampermonkey UserScript Core Template (`gm-template`)

这个目录包含了项目的核心油猴脚本模版。它不是一个标准的 Web 项目模块，而是运行在浏览器油猴插件环境中的核心桥接代码。

## ⚠️ 重要：全局代码规范

**所有文件都是全局的，统一使用 TypeScript 编译，不分模块。**

### 代码规范

1. **禁止使用 `import` 和 `export`**：
   - ❌ **不要使用** `import { ... } from './file'`
   - ❌ **不要使用** `export function ...` 或 `export class ...`
   - ✅ 所有类型、接口、函数、类都是全局的
   - ✅ 直接使用全局函数和类型，无需导入

2. **类型定义**：
   - 所有 `interface` 和 `type` 都是全局的
   - 在任意文件中定义的接口和类型，其他文件可以直接使用
   - 例如：`TabInfo`、`TabMessage`、`MessageHandler` 等

3. **函数和类**：
   - 所有函数和类都是全局的
   - 例如：`getTabCommunication()`、`getScriptUpdate()` 等
   - 直接调用即可，无需导入

4. **文件组织**：
   - `services/` 目录：存放服务类（如 `tab-communication.ts`、`script-update.ts`）
   - `ui/` 目录：存放 UI 组件
   - 根目录：核心逻辑文件（`main.ts`、`helpers.ts` 等）

### 示例

```typescript
// ✅ 正确：直接使用全局函数和类型
const tabComm = getTabCommunication()
tabComm.onMessage('broadcast', (message: TabMessage, sender: TabInfo) => {
  // 直接使用全局类型 TabMessage 和 TabInfo
})

const scriptUpdate = getScriptUpdate()
await scriptUpdate.update()

// ❌ 错误：不要使用 import
import { getTabCommunication } from './services/tab-communication'

// ❌ 错误：不要使用 export（除了导出给外部使用的函数）
export function myFunction() {} // 只有需要被外部调用的函数才 export
```

### 导出规则

- **只有需要被外部调用的函数才使用 `export`**
- 例如：`getTabCommunication()`、`getScriptUpdate()` 等工厂函数
- 内部使用的类型、接口、类等都不需要 `export`

## 背景与初衷

在开发复杂的油猴脚本时，经常面临以下痛点：

1. **更新滞后**：每次修改代码都需要手动在油猴中粘贴更新。
2. **缺乏调试手段**：难以实现类似现代 Web 开发的 HMR（热更新）。
3. **多模块管理**：一个脚本通常由多个逻辑文件组成，难以在油猴单一编辑器中维护。

`gm-template` 正是为了解决这些问题而设计的。它作为一个高度集成的"母脚本"，负责加载、调试和运行具体的业务逻辑脚本。

## 核心作用

1. **环境桥接**：封装了油猴特有的 `GM_*` API，为子脚本提供统一的调用界面。
2. **多模式运行**：
   - **远程模式**：通过 Gist 或指定的 URL 加载生产环境脚本。
   - **本地开发模式 (Local Dev Mode)**：通过浏览器的 `showDirectoryPicker` API 直接读取本地文件系统，实现零延迟开发。
   - **编辑器开发模式 (Editor Dev Mode)**：配合项目内置的 Web 编辑器，实现云端编写、本地即时生效。
3. **规则引擎**：内置 URL 通配符匹配逻辑，根据当前访问的页面决定加载哪些业务脚本。
4. **沙箱隔离**：利用 `Function` 构造函数和 `with` 语句，为每个子脚本创建独立的执行空间，同时注入预定义的全局变量和依赖。

## 主要特性

- **WebSocket HMR**：支持通过 WebSocket 监听服务端变更并自动重载。
- **冲突处理**：集成了 IndexedDB 缓存机制，能够智能处理本地草稿与远程 Gist 的同步冲突。
- **自动化 Meta 管理**：自动处理 UserScript Header（如 `@match`, `@grant` 等）的解析与合并。
- **跨标签通信**：使用 `BroadcastChannel` 和 `GM_setValue` 协调多个标签页之间的开发状态同步。

## 服务模块

### `services/tab-communication.ts`

跨标签页通信服务，提供：

- 广播消息
- 发送/回复（点对点通信）
- URL 模式过滤
- 自动注册/注销标签页
- 心跳机制保持标签页活跃
- 消息通道验证（防止其他 GM_setValue 调用干扰）

**使用方式**：

```typescript
// 获取服务实例（自动初始化）
const tabComm = getTabCommunication()

// 注册消息处理器
tabComm.onMessage('broadcast', (message, sender) => {
  console.log('From:', sender.url, 'Data:', message.data)
})

// 广播消息
await tabComm.broadcast({ action: 'update' })

// 发送消息并等待回复
const reply = await tabComm.send(targetTabId, { type: 'getData' })
```

### `services/script-update.ts`

脚本更新服务，提供：

- HOST 标记机制（使用 GM_setValue 存储 HOST 信息）
- 脚本验证（检查 tampermonkey.user.js 或 tampermonkey.js）
- 跨标签页更新广播
- 自动执行远程脚本

**使用方式**：

```typescript
// 获取服务实例（自动初始化）
const scriptUpdate = getScriptUpdate()

// 更新脚本（HOST 验证并广播，其他标签页自动执行）
await scriptUpdate.update()
```

## 为什么需要这个模块？

这个模块是本项目"油猴集成开发环境"的基石。与常规的 Web 模块不同：

- 它需要处理大量只有在油猴环境下才存在的 API。
- 它必须保持轻量且自包含，因为它会被编译并注入到用户的脚本管理器中。
- 它承载了本项目最核心的"热更新"能力，使得油猴脚本开发体验接近于传统的 React/Vue 开发。
- **所有代码都是全局的**，通过 TypeScript 统一编译，不使用模块系统（ES modules）。

## 文件结构

```
gm-templates/
├── main.ts                    # 主入口文件
├── helpers.ts                 # 辅助函数
├── rules.ts                   # 规则处理
├── scripts.ts                 # 脚本加载
├── services/                  # 服务模块
│   ├── tab-communication.ts  # 跨标签页通信服务
│   ├── script-update.ts       # 脚本更新服务
│   └── cli-service.ts         # CLI 服务
├── ui/                        # UI 组件
│   ├── node-selector/        # 节点选择器
│   ├── notification/         # 通知组件
│   └── corner-widget/        # 角落小部件
└── typings.d.ts              # 类型定义
```
