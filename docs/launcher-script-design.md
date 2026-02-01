# 油猴启动脚本（Launcher）方案

## 一、目标

- **新入口**：增加一个「启动脚本」（Launcher），用户只安装一次。
- **能力**：负责「预设脚本」（preset）和「远程脚本」（remote / GIST 编译结果）的**加载、缓存、更新**。
- **效果**：预设和远程脚本**不再依赖油猴的安装/更新**，通过 Launcher 即可动态更新（无需重新安装脚本）。
- **更新方式**：
  - 预设：手动触发 + Dev Server 推送。
  - 远程：手动触发 + 编辑器推送（沿用现有 editor dev / script-update 思路）。

当前预设和远程是**打在一个包里的**（一个 URL 返回 preset + 内联 GIST）。本方案需要把「谁安装、谁加载、谁更新」拆开，并兼容现有逻辑。

---

## 二、现状简述

1. **单脚本 URL**：`/static/[key]/tampermonkey.js` 返回「变量声明 + preset 包 + 内联 GIST 代码」。
2. **Preset**：`preset/dist/preset.js`，内含 `__GIST_SCRIPTS_PLACEHOLDER__`，在 `createBanner` 时被替换为 GIST 编译结果。
3. **main 流程**：preset 的 `main()` 拉规则、执行 `executeGistScripts()`（即占位符替换后的内联代码）、注册菜单等。
4. **更新**：用户/油猴通过重新请求该 URL 得到新内容，相当于「整包更新」。

---

## 三、目标架构

```
┌─────────────────────────────────────────────────────────────────┐
│  用户只安装：Launcher 脚本（一个 .user.js，固定或少量变体）           │
└─────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
        ┌───────────────────────┐       ┌───────────────────────┐
        │  Preset（预设脚本）     │       │  Remote（远程脚本）     │
        │  - 单一 URL 拉取        │       │  - 按 key 的 URL 拉取   │
        │  - Launcher 缓存       │       │  - Launcher/Preset 缓存 │
        │  - 可被 Dev 推送更新    │       │  - 可被编辑器推送更新    │
        └───────────────────────┘       └───────────────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
                        Preset 提供运行时（GME_*、matchRule 等）
                        Remote 在 Preset 提供的环境中执行
```

- **Launcher**：唯一需要「安装」的油猴脚本；负责拉取并缓存 preset、决定 remote 的 URL、驱动更新。
- **Preset**：独立资源，由 Launcher 拉取并执行；不包含 GIST 源码，只包含运行时 + 拉取并执行 remote 的逻辑。
- **Remote**：按 key 的独立资源（当前 GIST 编译结果），由 Preset 拉取并执行（或由 Launcher 拉取后交给 Preset 执行）。

---

## 四、方案概览

### 4.1 三种「脚本形态」与用途

| 形态         | 谁安装               | 谁加载/执行                 | 更新方式                       |
| ------------ | -------------------- | --------------------------- | ------------------------------ |
| **Launcher** | 用户（油猴安装一次） | 油猴                        | 需改脚本或版本号时用户手动更新 |
| **Preset**   | 无（不安装）         | Launcher 拉取并 eval        | 手动菜单 + Dev Server 推送     |
| **Remote**   | 无（不安装）         | Preset 拉取并 executeScript | 手动菜单 + 编辑器推送          |

### 4.2 构建与部署拆分

1. **Preset 独立包（供 Launcher 使用）**
   - 继续使用现有 `preset/dist/preset.js` 的构建，但**不再把 GIST 内联进去**。
   - 即：preset 包内**不**包含 `__GIST_SCRIPTS_PLACEHOLDER__` 的替换；main 里改为：若无内联 GIST，则从 `__SCRIPT_URL__` 拉取并执行（即走现有 `executeRemoteScript(__SCRIPT_URL__)`）。
   - 产出：**一份** `preset.js`，通过固定 URL 提供（例如 `/static/preset.js` 或 CDN）。

2. **Remote 独立包（仅 GIST 编译结果）**
   - 现有 `createUserScript` 产出的「GIST 编译结果」单独作为一份资源，**不再**和 preset 拼在一个脚本里。
   - 即：新增（或复用）一个接口，只返回「编译后的 GIST 代码」（无 banner、无变量声明、无 preset）。
   - 例如：`/static/[key]/tampermonkey-remote.js` 或继续用 `/static/[key]/tampermonkey.js` 但语义改为「仅 remote 内容」；Launcher 里把该 URL 当作 `__SCRIPT_URL__` 传给 preset。

3. **入口脚本（tampermonkey.user.js）**
   - 用户安装的 URL：`/static/[key]/tampermonkey.user.js`，即启动脚本（Launcher）。只做：
     - 从固定 URL 拉取 preset 内容；
     - 用 GM_setValue 等做「preset 缓存」；
     - 构造并注入 `__SCRIPT_URL__`、`__BASE_URL__` 等变量（与当前 buildPresetVariableDeclarations 一致）；
     - eval 执行 preset；
     - 提供「更新 preset / 更新 remote」的菜单或事件（手动 + 后续接 Dev/编辑器推送）。
   - Launcher 自身需要知道「当前 key」或「remote 脚本 URL」，可通过脚本安装时的 downloadURL 参数、或一个简单配置 URL 取得。

### 4.3 运行时流程（按顺序）

1. 油猴执行 **Launcher**。
2. Launcher 读缓存（如 `GM_getValue('preset_cache')`）：
   - 有且未过期 → 用缓存的 preset 代码；
   - 无或过期 → 请求 preset URL，写入缓存。
3. Launcher 设置全局变量：`__SCRIPT_URL__`（remote 脚本 URL）、`__BASE_URL__`、`__RULE_*`、`__EDITOR_URL__`、`__GRANTS_STRING__` 等（与当前一致）。
4. Launcher 在页面上下文中 eval 执行 preset 代码（并注入 GM\_\* 等 grant）。
5. **Preset** 的 main 执行：
   - 拉规则、注册 matchRule 等（与现有一致）；
   - **不再**执行内联的 `executeGistScripts()`，改为调用 `executeRemoteScript(__SCRIPT_URL__)`，即从 `__SCRIPT_URL__` 拉取 remote 并执行。
6. Remote 在 preset 提供的环境中运行（GME*\*、matchRule、GM*\* 等已挂好）。

### 4.4 更新逻辑

- **更新 Preset**
  - 手动：Launcher 菜单「Update Script」→ 清 preset 缓存，重新拉 preset URL，再 eval（全部强制更新 preset 与远程脚本）。
  - Dev 推送：Vite preset 构建完成时 POST `/api/sse/preset-built`；Dev Server 通过 SSE 向所有订阅的 preset 客户端推送 `preset-built` 事件；preset（dev 模式）订阅 GET `/api/sse/preset-built`（Accept: text/event-stream），收到事件后 `GM_setValue(vws_preset_update, builtAt)`，Launcher 的 `GM_addValueChangeListener` 收到后清缓存并刷新页面。
- **更新 Remote**
  - 手动：Launcher 或 Preset 菜单「更新远程脚本」→ 清 remote 缓存（若有），Preset 重新执行 `executeRemoteScript(__SCRIPT_URL__)`（或刷新页面由 Launcher 再跑一遍）。
  - 编辑器推送：沿用现有「编辑器 → 某 channel / postMessage」机制，Preset 侧收到后重新拉取并执行 remote（或通知 Launcher 刷新）。

---

## 五、代码与构建需要改动的点

### 5.1 Preset 侧（preset 仓库/目录）

- **main.ts**
  - 在「执行 GIST」处做分支：
    - 若存在「内联 GIST」（例如全局 `__INLINE_GIST__ === true` 或占位符被替换为有效代码），则保持当前 `executeGistScripts()`。
    - 否则调用 `executeRemoteScript(__SCRIPT_URL__)`。
  - 这样：
    - **现有打包方式**（createBanner 里替换占位符 + 设 `__INLINE_GIST__`）仍可产出一份「preset + 内联 GIST」的完整脚本（兼容旧安装或直接安装）；
    - **Launcher 用的 preset 包**不设 `__INLINE_GIST__`、不替换占位符，仅从 `__SCRIPT_URL__` 拉 remote。

- **构建**
  - 当前 Vite 构建不变，仍产出一份 `preset.js`。
  - 可选：为 Launcher 再产出一份「仅 preset」的入口（例如不注入 `__INLINE_GIST__`），或通过环境变量/构建参数在 main 里区分「内联模式 / 远程 URL 模式」。

### 5.2 服务端与路由

- **Preset 的 URL**
  - 新增或复用路由，例如 `GET /static/preset.js`，直接返回 `preset/dist/preset.js` 的内容（或带少量注入，如 `__INLINE_GIST__ = false`）。
  - 若部署在 Vercel，可用 Next 的 route 或静态文件服务。

- **Remote 的 URL**
  - 保持 `/static/[key]/tampermonkey.js`（或新路径如 `tampermonkey-remote.js`），但**返回内容改为「仅 GIST 编译结果」**（无 banner、无变量声明、无 preset）。
  - 即：从 `createUserScript` 中拆出「只编译 GIST 并返回字符串」的接口，该路由只返回这份字符串；Launcher 把此 URL 赋给 `__SCRIPT_URL__`。

### 5.3 Tampermonkey 相关（gmCore / createBanner / createUserScript）

- **createBanner / createUserScript**
  - **兼容现有「整包」安装**：保留当前逻辑——生成「banner + 变量声明 + preset（占位符已替换）+ sourceMap」，供 `/static/[key]/tampermonkey.js` 使用（用户仍可直接安装这份完整脚本）。
  - **为 Launcher 服务**：
    - 新增或复用「仅编译 GIST」的接口，供 `/static/[key]/tampermonkey-remote.js`（或同名但语义不同的 tampermonkey.js）使用。
    - Launcher 的 .user.js 由**新模板**生成，不包含 preset 与 GIST，只包含「拉 preset、缓存、设变量、eval preset」的少量逻辑。

- **Launcher 脚本模板（新）**
  - 新文件，例如 `services/tampermonkey/launcherScript.ts` 或内联在 createBanner 旁。
  - 内容要点：
    - @name、@namespace、@match、@grant、@connect 等与当前一致或略简；
    - @downloadURL / @updateURL 指向入口脚本地址（例如 `/static/[key]/tampermonkey.user.js`）；
    - 脚本体：读取/写入 preset 缓存、请求 preset URL、构建 variableDeclarations、eval(preset)，并注册「更新预设」「更新远程」等菜单（或调用 preset 暴露的更新方法）。

### 5.4 缓存与更新通道

- **Preset 缓存**
  - 建议 key：如 `vws_preset_v1`，value：preset 源码字符串；可选带时间戳或版本号，用于「过期」判断。

- **Remote 缓存**
  - 可选：由 Preset 在内存或 GM_setValue 中缓存当前拉取的 remote 内容，避免每次刷新都请求；更新时由「更新远程」或编辑器推送清缓存。

- **Dev 推送 preset 更新**
  - 例如：Dev 构建 preset 后，向某 GM_setValue key 写时间戳或版本；Launcher 用 GM_addValueChangeListener 监听，收到后清 preset 缓存并重新拉取、执行。

- **编辑器推送 remote 更新**
  - 沿用现有 editor dev / script-update 的 channel 或 postMessage；Preset 收到后清 remote 缓存并重新执行 `executeRemoteScript(__SCRIPT_URL__)` 或通知 Launcher 重跑。

---

## 六、实施顺序建议

1. **Preset main 分支**：在 main 里根据 `__INLINE_GIST__`（或等价条件）在「executeGistScripts」与「executeRemoteScript(**SCRIPT_URL**)」之间二选一；保证现有「整包」构建行为不变。
2. **Remote 独立接口**：从 createUserScript 拆出「仅返回 GIST 编译结果」的 API，并新增路由（如 `/static/[key]/tampermonkey-remote.js`）返回该结果。
3. **Preset 静态/路由**：新增 `GET /static/preset.js` 返回 preset 包（或带 `__INLINE_GIST__ = false` 的版本）。
4. **Launcher 模板与生成**：实现 Launcher 的 .user.js 模板，生成「拉 preset、缓存、注入变量、eval、更新菜单」的逻辑；并配置其 @downloadURL/@updateURL。
5. **更新通道**：实现「更新预设」「更新远程」的菜单与缓存失效；再接 Dev 推送（preset）与编辑器推送（remote）。

按上述顺序，可以在不破坏「当前预设 + 远程打在一起」的现有安装的前提下，引入 Launcher，并逐步切换到「预设与远程分离、动态更新」的模式。

---

## 七、小结与当前实现

| 项目       | 说明                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **入口**   | **tampermonkey.user.js**：`GET /static/[key]/tampermonkey.user.js` 返回启动脚本，用户只安装此 URL；负责加载/缓存 preset 与 remote。 |
| **Preset** | `GET /static/preset.js`：由入口脚本拉取并执行；main 在「无内联 GIST」时执行 `executeRemoteScript(__SCRIPT_URL__)`。                 |
| **Remote** | `GET /static/[key]/tampermonkey-remote.js`：仅返回 GIST 编译结果；由 Preset 拉取并执行。                                            |
| **更新**   | Preset：菜单「Update Script」+ channel 推送；Remote：手动 + 编辑器推送。                                                            |

以 **tampermonkey.user.js** 为唯一入口，实现「加载预设脚本与远程脚本」的启动脚本，并支持动态更新而无需用户重新安装。原「整包」路由 `/static/[key]/tampermonkey.js` 已移除。

---

## 八、预设与远程是否打在一起？如何查看 remote 生成代码？

### 8.1 预设与远程是分离的（未打在一起）

| 资源       | URL                                        | 内容                                                       |
| ---------- | ------------------------------------------ | ---------------------------------------------------------- |
| **Preset** | `GET /static/preset.js`                    | 独立 bundle（preset 运行时），不含 GIST。                  |
| **Remote** | `GET /static/[key]/tampermonkey-remote.js` | **仅** GIST 编译结果（无 banner、无 preset、无变量声明）。 |

Launcher 模式下：用户只安装 **tampermonkey.user.js**；Launcher 先拉取并 eval **preset.js**，preset 再拉取并执行 **tampermonkey-remote.js**。预设和远程是**两个独立请求、两段独立代码**，没有打在一个文件里。原「整包」`/static/[key]/tampermonkey.js` 已移除。

### 8.2 tampermonkey-remote.js 生成的代码结构

`/static/[key]/tampermonkey-remote.js` 返回的内容由 `getRemoteScriptContent(files)` 生成，即对 GIST 中每个脚本文件做 TS 编译后，用 `getExecutionWrapper` 包一层。每个文件大致生成如下结构（`matchRule`、`matchUrl`、`createGMELogger` 等由 **Preset 注入的全局 g** 提供，remote 在 `with(g){ ... }` 下执行）：

```js
// 文件名.ts
;(function() {
  const { GME_ok, GME_info, GME_fail, GME_warn } = createGMELogger("模块名")
  try {
    if ([...match].some((m) => matchUrl(m)) || matchRule("文件名.ts")) {
      GME_ok('Executing script `文件名.ts`');
      // 编译后的 GIST 代码
    }
  } catch (error) {
    const message = ...
    GME_fail('Executing script `文件名.ts` failed:', message)
  }
})()
```

因此 **remote 脚本依赖**：`matchRule`、`matchUrl`、`createGMELogger`、`GME_ok` / `GME_info` / `GME_fail` / `GME_warn` 必须在执行时的全局对象 `g` 上（Preset 的 `registerGlobals()` 与 `main()` 会挂到 `__GLOBAL__` / g）。

### 8.3 如何查看实际生成的 remote 代码

1. 启动开发服务：`pnpm dev`。
2. 在浏览器打开：`http://localhost:3000/static/<key>/tampermonkey-remote.js`，其中 `<key>` 需与当前项目的 `getTampermonkeyScriptKey()` 一致（例如 `701d358ddd5420fb9d99a1e7a439b3e6082cf21c61d3dd69b8afd1d15bb63b0c`）。
3. 若 key 不匹配会返回 404；匹配则返回纯 GIST 编译结果（无油猴 banner），即可看到上述结构及对 `matchRule` / `matchUrl` / `createGMELogger` 的引用。
