# 开发版 / 正式版脚本合并 — 需求与影响分析

> 目标：只安装一个 Tampermonkey 脚本，根据当前访问的页面自动走开发或正式后端，无需在浏览器里切换脚本。

---

## 一、现状（当前如何区分「两个脚本」）

### 1.1 脚本从哪里来

- **Launcher 模式**：用户安装的是 `/static/[key]/tamperkey.user.js`（由 `createLauncherScript` 生成）。
- **开发 / 正式** 不是两个不同的路由，而是 **同一套代码、两套部署**：
  - **开发**：例如本地 `pnpm dev` 或 Vercel Preview，`NODE_ENV=development`，请求 launcher 时返回「开发版」内容。
  - **正式**：例如 Vercel Production，`NODE_ENV=production`，返回「正式版」内容。

因此会出现两个安装 URL，例如：

- 开发：`http://localhost:3000/static/<key>/tampermonkey.user.js` 或 `https://preview-xxx.vercel.app/...`
- 正式：`https://your-domain.com/static/<key>/tampermonkey.user.js`

用户若两个都装，就会在 Tampermonkey 里看到两个脚本（例如「Web Script (dev)」和「Web Script」），需要手动启用/停用或切来切去。

### 1.2 开发版与正式版的差异（仅由服务端注入）

| 项目                  | 开发版 (NODE_ENV=development)          | 正式版 (NODE_ENV=production)    |
| --------------------- | -------------------------------------- | ------------------------------- |
| `@name`               | `Web Script (dev)`                     | `Web Script`                    |
| `__BASE_URL__`        | 当前请求的 origin（如 localhost:3000） | 当前请求的 origin（如正式域名） |
| `__IS_DEVELOP_MODE__` | `true`                                 | `false`                         |
| `__HOSTNAME_PORT__`   | 当前请求的 host（如 `localhost:3000`） | 当前请求的 host                 |
| preset 行为           | 见下                                   | 仅走 GIST/remote，无 dev 特性   |

### 1.3 Preset 里「开发模式」实际做了什么

`isDevelopMode()` = `__IS_DEVELOP_MODE__ && (window.location.host === __HOSTNAME_PORT__)`。

开发模式下会多出：

- **Editor Dev Mode**：编辑器开「开发模式」后，其它同源/指定页拉取编辑器编译结果并执行，支持热更。
- **Local Dev Mode**：执行本地缓存的开发脚本。
- **Preset-built SSE**：同源时订阅构建推送，preset 更新后自动刷新。
- **开发路径分支**：在 editor 页不执行 remote、在非 editor 页执行 remote 并 `watchHMRUpdates` 等。

也就是说：**是否开发模式** 完全由 launcher 注入的 `__IS_DEVELOP_MODE__` 和 `__HOSTNAME_PORT__` 决定，preset 只消费这两个（及 `__BASE_URL__` 等），不关心「安装自哪个 URL」。

---

## 二、合并目标（需求）

- **只保留一个安装**：用户只从「一个」URL 安装（建议以正式环境为准）。
- **按「当前页面」自动选后端**：
  - 当前页面的 host 属于「开发环境」列表（如 `localhost:3000`、`*.vercel.app` 等）→ 使用 **开发后端**（dev baseUrl），并开启开发模式（`__IS_DEVELOP_MODE__=true`，`__HOSTNAME_PORT__` 为当前 host）。
  - 否则 → 使用 **正式后端**（prod baseUrl），`__IS_DEVELOP_MODE__=false`。
- **不切脚本**：同一个脚本在所有页面上都能跑，无需在扩展里切换「开发 / 正式」脚本。

---

## 三、方案要点（不写具体代码，只列设计）

### 3.1 Launcher 生成时需要的信息

- **prodBaseUrl**：正式环境地址，如 `https://your-domain.com`。
- **devBaseUrl**：开发环境地址，如 `http://localhost:3000` 或 `https://preview-xxx.vercel.app`。
- **devHosts**：视为「开发环境」的 host 列表（或匹配规则），用于在运行时判断「当前页面是否在开发环境」。例如：
  - `['localhost:3000', '127.0.0.1:3000']`
  - 或包含 `localhost`、`vercel.app` 等。
- **key**：脚本 key（可与现在一致，来自 `getTampermonkeyScriptKey()`）。若开发/正式用同一 Gist，则共用一个 key；若将来要分 key，可再扩展为 `devKey` / `prodKey`。

以上可从环境变量读取，例如：

- `NEXT_PUBLIC_PROD_BASE_URL`
- `NEXT_PUBLIC_DEV_BASE_URL`
- `NEXT_PUBLIC_DEV_HOSTS`（JSON 数组或逗号分隔字符串）

若未配置「双环境」，则退化为当前行为：仅一个 baseUrl，且用 `NODE_ENV` 决定是否开发模式（兼容现有部署）。

### 3.2 Launcher 运行时逻辑（伪代码）

```
当前页 host = window.location.host
if (当前页 host 在 devHosts 中) {
  baseUrl = devBaseUrl
  isDevelopMode = true
  hostnamePort = 当前页 host
} else {
  baseUrl = prodBaseUrl
  isDevelopMode = false
  hostnamePort = '' 或 prod host（preset 里 isDevelopMode 会为 false）
}
预设 URL = baseUrl + '/static/preset.js'
remote URL = baseUrl + '/static/' + key + '/tampermonkey-remote.js'
用上述 baseUrl / isDevelopMode / hostnamePort 注入 ASSIGN_GLOBALS，再 loadAndRun()
```

这样 **preset 和 remote 都从「当前选中的后端」拉取**，preset 侧无需改逻辑，仍只依赖注入的 `__BASE_URL__` / `__IS_DEVELOP_MODE__` / `__HOSTNAME_PORT__`。

### 3.3 缓存与 @connect

- **Preset / ETag 缓存**：当前 launcher 用 GM_setValue 存一份 preset 与 ETag。合并后存在「同一脚本、两种后端」的切换，需要 **按后端区分缓存**（例如 key 含 baseUrl 或 `preset_cache_dev` / `preset_cache_prod`），否则从 dev 切到 prod 页面可能仍用 dev 的缓存。
- **@connect**：Tampermonkey 要求声明可请求的域名。合并后 launcher 会请求 dev 和 prod 两个 origin，需在注释里声明两个 host（如 `localhost`、正式域名），或按规则列出 dev/prod 的 hostname。

### 3.4 脚本名称与命名空间

- 合并后只保留一个脚本，建议 **@name** 统一为 `Web Script`（不再带 `(dev)`）。
- **@namespace** 可用 prod baseUrl，或保持与现有一致。

---

## 四、影响范围（合并会动到哪些、不动哪些）

### 4.1 需要改动的部分

| 位置                                               | 改动内容                                                                                                                                                                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **services/tampermonkey/launcherScript.ts**        | 入参增加（或从 env 解析）prodBaseUrl、devBaseUrl、devHosts；生成 launcher 时嵌入「运行时根据当前 host 选 baseUrl + isDevelopMode」的逻辑；ASSIGN_GLOBALS 由运行时计算后的变量生成；preset/remote 的 URL 和缓存 key 按所选 baseUrl 区分。 |
| **app/static/[key]/tampermonkey.user.js/route.ts** | 调用 `createLauncherScript` 时传入上述新参数（可从 env 或配置读）。若未配置双环境，则传单 baseUrl + 沿用现有 NODE_ENV 逻辑。                                                                                                             |
| **环境变量 / 配置**                                | 新增或约定：`NEXT_PUBLIC_PROD_BASE_URL`、`NEXT_PUBLIC_DEV_BASE_URL`、`NEXT_PUBLIC_DEV_HOSTS`（或等价配置），并更新 `.env.example` / README。                                                                                             |

### 4.2 不需要改动的部分

| 位置                                  | 说明                                                                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **preset 全量**                       | 仅使用 launcher 注入的 `__BASE_URL__`、`__IS_DEVELOP_MODE__`、`__HOSTNAME_PORT__` 等，不关心「从哪个 URL 安装」；合并后 launcher 按当前页选好后端再注入，preset 行为不变。 |
| **createBanner.ts（内联 GIST 路径）** | 当前也按 NODE_ENV 打 @name 和开发模式变量；若合并只针对「launcher 一条线」，可暂不改 createBanner，仍按部署环境二选一；若要一致再单独做。                                  |
| **getTampermonkeyScriptKey()**        | 仍用 GIST_ID 生成 key；若未来要 dev/prod 用不同 Gist，再考虑 launcher 支持 devKey/prodKey。                                                                                |
| **/api、/editor、Gist、rule 等**      | 均为按请求的 host 服务当前部署；合并后只是「同一个 launcher 有时请求 dev、有时请求 prod」，服务端无逻辑变化。                                                              |

### 4.3 可选 / 后续

- **createBanner / 内联脚本**：若希望「下载的单文件脚本」也具备 dev/prod 自动切换，需要类似地在 createBanner 里支持双 URL + 运行时选择；可与 launcher 共用同一套「选后端」的规则描述（如 devHosts）。
- **key 分离**：若正式与开发使用不同 Gist（不同 key），launcher 需再支持按环境选 key（devKey/prodKey）。

---

## 五、风险与前提确认

1. **环境变量来源**：合并后 launcher 内容依赖「prod/dev baseUrl + devHosts」。这些需在 **构建时或请求时** 可读（如 NEXT*PUBLIC*\* 或服务端 env），并保证正式环境只配 prod、预览/本地可配 dev，避免生产里误指向本地。
2. **Tampermonkey 更新**：若用户已装过旧版「仅单环境」的 launcher，合并后 launcher 的 @version 或内容变更会由 Tampermonkey 按 updateURL 拉新版本；只要 updateURL 仍指向同一路由且服务端返回新 launcher 即可。
3. **缓存与 304**：按 baseUrl 区分缓存后，dev/prod 的 preset 各有一份 ETag/缓存，逻辑清晰；需确认 launcher 里 `loadAndRun` 使用的 cache key / ETag key 与所选 baseUrl 绑定。
4. **@connect**：若 dev 为 localhost，需在注释里写 `@connect localhost`（及端口若需要）；Tampermonkey 对 localhost 的支持需在扩展里可用（本地开发时）。

---

## 六、小结（需求确认用）

- **合并的是**：当前「开发部署」与「正式部署」分别提供的 **两个 launcher 安装**，变成 **一个 launcher**，根据 **当前页面 host** 自动选开发或正式后端并注入对应 `__IS_DEVELOP_MODE__` / `__HOSTNAME_PORT__` / `__BASE_URL__`。
- **Preset 与后端接口**：无需改；只改 launcher 的生成与运行时选 URL/缓存/@connect。
- **前提**：配置上能提供 prod baseUrl、dev baseUrl、devHosts（或等价规则）；若暂不配，则保留「单环境 + NODE_ENV」的现有行为即可。

若以上与你的「合并在一起、不想切来切去」需求一致，再按此方案动代码即可；若有差异（例如希望用 cookie/query 切换、或只合并脚本名但保留两套安装等），可以再调方案再落实现。
