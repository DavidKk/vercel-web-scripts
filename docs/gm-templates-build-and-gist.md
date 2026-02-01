# gm-templates 模块化构建与 GIST 集成方案

## 1. 目标

- **gm-templates**：构建时打成一份静态 bundle，发布后不变；采用模块化构建（Vite），不再运行时字符串拼接 + `ts.transpileModule`。
- **GIST 脚本**：请求时按用户/请求动态注入，与 gm-templates **在结构上区分开**，不做占位符替换，保证 bundle 完整性。
- **对外契约**：通过**注册函数**把 gm-templates 提供的 API 挂到全局，外部脚本（GIST）直接使用这些全局即可。

## 2. 方案概述

| 维度         | 说明                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| gm-templates | 预构建为单文件 bundle（如 `lib/gm-core.bundle.js`），内含完整逻辑 + 注册函数，**无** GIST 占位符。                 |
| GIST         | 视为「外部脚本」，仅依赖「注册后的全局 API」；在响应中作为**独立一段**紧接在 bundle 之后**拼接**，不做字符串替换。 |
| 最终响应     | 一个脚本 = `[变量声明]` + `[gm-templates bundle]` + `[GIST 脚本全文]`，仅拼接、不替换。                            |

## 3. gm-templates 侧

### 3.1 构建

- **工具**：Vite（或 Rollup）在**构建时**打包 `templates/gm-templates`。
- **入口**：单一入口（如 `main.ts`），内部通过 `import/export` 引用 helpers、services、UI 等。
- **产物**：单文件，例如 `lib/gm-core.bundle.js`，发布后不变。

### 3.2 运行时变量（**BASE_URL** 等）

- bundle **不**在源码里写死 `__BASE_URL__`、`__RULE_API_URL__` 等。
- 由**请求时**在 bundle 前拼一段变量声明（与现有 `createBanner` 中一段一致），保证执行时这些变量已在作用域内。

### 3.3 对外契约：main.ts 导出 + 注册到全局

- **单一出口**：在 **main.ts**（或由 main 引用的统一出口文件）中 **export** 所有需要给外部脚本使用的 API（函数、类型等）。实现与类型都来自这一处，无需单独维护接口列表。
- **注册到全局**：bundle 末尾通过**注册函数**把上述导出挂到 **globalThis / window** 的**顶层属性**（如 `window.GME_info`、`window.matchRule`），而不是挂到 `window.__GME__` 下。这样外部脚本在全局作用域下可直接写 `GME_info(...)`、`matchRule(...)`，无需写 `window.__GME__.GME_info`。
- 示例（逻辑示意）：

  ```ts
  // main.ts 末尾或注册模块
  import * as publicAPI from './public-exports' // 或直接从各模块 export 后在 main 统一 re-export

  function registerGlobals(globalObj: typeof globalThis) {
    Object.assign(globalObj, publicAPI)
    // 即 globalObj.GME_info = ..., globalObj.matchRule = ...
  }
  registerGlobals(typeof window !== 'undefined' ? window : globalThis)
  ```

- bundle 内**不**包含 GIST 占位符、不拼接用户代码，只负责「跑完逻辑 + 注册全局」。

## 4. GIST 侧（外部脚本）

- GIST 脚本作为**独立一段**出现在最终脚本中，与 gm-templates **仅通过拼接区分**，不做 `replace('__GIST_SCRIPTS_PLACEHOLDER__', ...)`。
- 外部脚本在**全局作用域**下直接写 `GME_info(...)`、`matchRule(...)` 等即可使用，无需 `window.` 前缀；配合下方 7 节生成的 .d.ts，可得到完整 TS 类型与智能提示。

## 5. 最终响应形状

```
[UserScript 元数据头]
[变量声明：__BASE_URL__、__RULE_API_URL__ 等]
[gm-templates 整份 bundle（内含 registerGlobals）]
[空行或分号]
[GIST 脚本全文]
```

- **不再**在 bundle 内写 `__GIST_SCRIPTS_PLACEHOLDER__`，也不在 bundle 中间做替换。
- 请求时逻辑：读取预构建 bundle 字符串 → 拼变量声明 → 拼 bundle → 拼 GIST 内容（已做 clearMeta 等处理）。

## 6. 与现有方案对比

| 项目              | 现有（字符串合并 + 占位符替换）             | 本方案（注册 + 拼接）                                         |
| ----------------- | ------------------------------------------- | ------------------------------------------------------------- |
| gm-templates 产出 | 运行时多文件 ?raw 拼接 + ts.transpileModule | 构建时 Vite 单 bundle，无占位符                               |
| GIST 位置         | 替换进 main 内部占位符                      | 紧接在 bundle 之后，独立一段                                  |
| 对外契约          | 隐式（同一作用域）                          | 显式（注册函数 + 全局对象）                                   |
| 外部脚本用法      | 直接使用全局函数                            | 直接使用全局名（如 `GME_info(...)`），类型由生成的 .d.ts 提供 |

## 7. 外部脚本 TS 类型：main.ts 导出 + 生成全局 .d.ts

### 7.1 目标

- **单一数据源**：对外 API 全部由 **main.ts**（或 main 引用的统一出口）**export** 出来；注册函数只是把这些导出挂到 globalThis，不再单独维护接口列表。
- **外部脚本用法**：在 GIST 里直接写 `GME_info(...)`、`matchRule(...)` 等，**无需** `window.` 或 `window.__GME__`，且能获得完整 TS 类型与智能提示。
- **类型来源**：通过构建时根据 main.ts 的导出**自动生成**一份 .d.ts，用**全局声明**（或对 Window 的扩展）描述这些名字，供外部脚本引用。

### 7.2 为何用「全局声明」而不是只扩展 Window

- 若只在 .d.ts 里写 `declare global { interface Window { GME_info: (...) => void } }`，则 `window.GME_info` 有类型，但**裸写** `GME_info(...)` 在严格模式下不一定被推断为 `Window['GME_info']`，视 tsconfig 而定。
- 在 .d.ts 里写 **`declare function GME_info(...): void`**（全局环境声明）时，任意文件中直接写 `GME_info(...)` 都会获得类型与补全。
- 因此推荐：生成的 .d.ts 以**全局函数/常量声明**为主（`declare function GME_info(...)`、`declare function matchRule(...)` 等），这样外部脚本**直接使用 `GME_info` 即可拿到 TS 类型**；如需与运行时一致，可同时**扩展 Window**（见下）。

### 7.3 方案：main.ts 导出 → 生成「重写 Window + 全局」的 .d.ts

**步骤一：main.ts 统一导出**

- 在 main.ts（或如 `public-exports.ts` 的出口文件）中，**export** 所有需要给外部脚本使用的函数与类型，例如：

  ```ts
  // main.ts 或 public-exports.ts
  export { matchRule, GME_info, GME_ok, GME_warn, GME_fail, GME_sleep, GME_waitFor, ... }
  export type { WaitForOptions, AsyncQuery, ... }
  ```

- 注册函数从同一批导出挂到全局：`Object.assign(globalThis, publicExports)`，保证运行时名字与导出一致。

**步骤二：构建时根据导出生成 .d.ts**

- **输入**：上述导出所在的 .ts 文件（仅含对外 export 的入口，避免把内部模块结构暴露出去）。
- **做法**：对该入口执行 `tsc --declaration --emitDeclarationOnly`，得到带 `export declare function GME_info(...)` 等的 .d.ts；再用一小段脚本做转换：
  - 将 `export declare function X` 改为 **`declare function X`**（全局函数）；
  - 将 `export declare const X` 改为 **`declare const X`**（全局常量）；
  - 需要时保留或生成 **`declare global { interface Window { GME_info: ...; matchRule: ...; ... } }`**，与运行时 `window.GME_info` 等保持一致。
- **输出**：供外部脚本/编辑器使用的 .d.ts（如 `lib/editor-gme.d.ts` 或合并进现有 `editor-typings.d.ts` 的 GME 部分）。

**步骤三：外部脚本引用该 .d.ts**

- 在外部脚本工程中通过 `/// <reference path="..." />` 或 tsconfig 的 `include`/`types` 引用上述生成的 .d.ts。
- 之后在代码里直接写 `GME_info('hello')`、`matchRule('myScript', url)` 等即可获得类型检查与补全。

### 7.4 与现有 editor-typings 的关系

- **保留手写**：Tampermonkey 环境、`GM_*`（如 `GM_xmlhttpRequest`）、`__BASE_URL__` 等与运行环境相关的声明，仍放在现有 `editor-typings.d.ts` 或单独 base 文件中。
- **GME 部分**：由「main.ts 导出 → tsc 声明 → 脚本转成全局声明（+ 可选 Window 扩展）」自动生成，与 main.ts 的 export 保持同步，外部脚本直接使用 `GME_info` 等方式即可获得类型。

### 7.5 小结

| 项目         | 说明                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| 单一数据源   | main.ts（或统一出口）的 **export**，与注册到 globalThis 的内容一致                                                 |
| 生成 .d.ts   | 对导出入口跑 tsc 声明，再把 `export declare function/const` 转成全局 `declare function/const`（可选：扩展 Window） |
| 外部脚本用法 | 直接写 `GME_info(...)` 等即可获得 TS 类型与补全，无需 `window.` 或 `window.__GME__`                                |

## 8. 待补充

（此处留空，供后续补充。）
