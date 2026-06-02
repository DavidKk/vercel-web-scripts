# Extension 多服务（Service-first）任务拆分

> **状态**：需求与 §10 产品决策已对齐；§12 仍有少量待拍板项；可启动 Phase 0/1。
> **关联**：[`extension/TODO.md`](../TODO.md) · [`extension/README.md`](../README.md)

---

## 0. 关键约束：WEB 不变 · Script Key 为能力键

### 0.0 术语：`scriptKey` ≠ Gist ID

Extension / Web API / Connect 里出现的 **`scriptKey`（Options 里 Script key）不是 GitHub Gist ID**。

| 名称            | 谁持有                                                     | 含义                                                                |
| --------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| **`GIST_ID`**   | 服务端环境变量                                             | GitHub Gist 的 UUID；Extension **不可见**                           |
| **`scriptKey`** | Extension、Connect、URL 路径                               | `SHA-256(GIST_ID)` 的 hex，即 `getTampermonkeyScriptKey()` 的返回值 |
| **用途**        | `/static/{scriptKey}/…`、`/api/tampermonkey/{scriptKey}/…` | 路由与缓存 scope 的统一标识                                         |

```ts
// services/tampermonkey/createBanner.ts（仅服务端；Extension 不实现此推导）
export function getTampermonkeyScriptKey() {
  const { gistId } = getGistInfo()
  return createHash('sha256').update(gistId).digest('hex')
}
```

后文 **「能力层 / 脚本包」** 均指 **同一 `scriptKey` 对应的一份托管脚本集合**（由该 MagickMonkey 部署背后的 Gist 提供）。UI 与代码统一用 **Script key** / `scriptKey`，**不要**把 `scriptKey` 称作 Gist ID。

### 0.1 WEB / API 不改

MagickMonkey Web 与现有 HTTP 契约**保持不变**：

- Connect 仍传 `baseUrl + scriptKey`
- 规则 / 脚本 / 版本 / tab-match 等 API 仍以 **`scriptKey`（Tampermonkey 路由 key）** 为路径参数：  
  `GET /api/tampermonkey/{key}/rule`、`…/scripts`、`…/scripts/version` 等

Extension 侧所有改动**仅发生在 chrome.storage 与 UI**，不要求 Web 发版配合。

### 0.2 两层模型：Service（连接） vs Script Key（能力）

| 层         | 实体                     | 标识                                   | 含义                                                                   |
| ---------- | ------------------------ | -------------------------------------- | ---------------------------------------------------------------------- |
| **连接层** | `Service`                | `serviceId`（UUID，仅 Extension 内部） | 一条「如何连上 MagickMonkey」：`baseUrl + scriptKey + label + enabled` |
| **能力层** | `ScriptKeyScope`（逻辑） | **`scriptKey`**                        | 该 Script key 下的脚本集合、RULE、脚本开关；**与 baseUrl 无关**        |

**核心约定**：**同一 `scriptKey` = 同一套能力**（脚本列表、RULE 语义、脚本 enable 状态共享）。  
两个 Service 若 `scriptKey` 相同、仅 `baseUrl` 不同（典型：本地 `localhost` vs 生产域名），视为**同一能力的不同接入点**，不是两套脚本。

```text
Extension
├── Service[]                         ← UI「服务列表」：增删改、enabled、label
│     Service A: localhost + {scriptKey α}
│     Service B: prod.app      + {scriptKey α}   ─┐ 同一 scriptKey
│     Service C: prod.app      + {scriptKey β}   ─┼─► 不同能力，并行合并
│
└── ScriptKeyScope（逻辑聚合，key = scriptKey）  ← Scripts / RULE / 脚本开关 的真实归属
      scriptKey α  → RULE、ScriptList、script_enabled:*
      scriptKey β  → …
```

### 0.3 能否覆盖原需求？——可以

| 原需求                    | Script Key 模型下的覆盖方式                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 多套配置（本地 / 多生产） | 多条 `Service`；同 scriptKey 可挂多个 baseUrl                                                                        |
| 开关某个「服务」          | `Service.enabled`；关闭后该接入点不参与 OTA 拉取与 endpoint 选择                                                     |
| 针对特定脚本的开关        | **`scriptKey + file`**（非 serviceId）；同 scriptKey 下共享一份                                                      |
| 脚本合并、业务无冲突      | 运行时按 **enabled 服务去重后的唯一 `scriptKey` 集合** 合并；每个 scriptKey 一套 RULE + bundle                       |
| 删除服务只清对应数据      | 删 Service → 清该 `baseUrl\|scriptKey` 的 **OTA 缓存**；仅当**无其它 Service 引用同一 scriptKey** 时，再清能力层数据 |
| WEB Connect 不变          | 仍 upsert `(baseUrl, scriptKey)` 的 Service 条目，不碰 Web                                                           |

### 0.4 仍需区分的 scope（仅 OTA 层）

同一 `scriptKey`、不同 `baseUrl` 时，**preset / manifest / bundle** 可能来自不同静态部署（本地构建 vs 生产 CDN）。因此：

| 数据                            | Storage scope            | 说明                                                                                |
| ------------------------------- | ------------------------ | ----------------------------------------------------------------------------------- |
| RULE、脚本列表、脚本 enable     | **`scriptKey`**          | 能力相同，共享一份                                                                  |
| preset / manifest / bundle 缓存 | **`baseUrl\|scriptKey`** | 与现 `scopedKeys` 一致，按接入点隔离                                                |
| GM 页面存储                     | **`{gmScope}_{key}`**    | `gmScope` = 能力包短名（见 §10.2 例 4）；同 scriptKey 多 Service 共用同一 `gmScope` |
| tab-match 缓存                  | **`scriptKey`**          | 规则按 scriptKey；fetch 时选用该 scriptKey 的 endpoint baseUrl                      |

### 0.5 同 scriptKey 多 Service 同时 enabled 时的 OTA 策略

同一 `scriptKey` 只应 **启动一条 OTA 链路**。在 enabled 且 scriptKey 相同的 Service 中，**取 Options 列表里最靠上的一条** 的 baseUrl 拉 OTA（类似 `/etc/hosts` 自上而下匹配）；其余同 scriptKey 行不参与 OTA，可作 Editor / Connect 备用入口。

**已确认（§10）**：列表顺序优先；不用 localhost 判别，不用 `primary` 字段作为默认逻辑（可选 UI「置顶」仅调整顺序）。

---

## 1. 背景与目标

### 1.1 现状问题

Extension 当前为**单服务**模型：Options 仅存一份 `baseUrl + scriptKey`。切换本地 / 生产或多套生产环境时：

- 会触发 `clearExtensionCachesForServiceSwitch`，清空 RULE、脚本列表、模块缓存、脚本开关；
- 体验接近「重新安装」，无法保留多套配置并快速切换或并行使用。

### 1.2 目标（已确认）

| 原则                               | 说明                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------- |
| **WEB 不变**                       | Connect / API 仍用 `baseUrl + scriptKey`；Extension 独自演进                |
| **Script Key 为能力键**            | `scriptKey` 标识脚本/RULE/开关；同 scriptKey 多 Service 共享能力            |
| **Service 为连接入口**             | UI 以 Service 列表管理接入点（label、baseUrl、enabled）                     |
| **服务级开关**                     | `Service.enabled`：关闭后该 endpoint 不参与 OTA 选取与 Editor 默认跳转      |
| **脚本级开关（scriptKey scoped）** | `enabled` 针对 **`scriptKey + file`**，同 scriptKey 下所有 Service 共享     |
| **多 scriptKey 合并运行**          | 多个不同 `scriptKey` 同时 enabled → RULE 并集、每个 scriptKey 一条 OTA 链路 |
| **删除边界清晰**                   | 删 Service → 清 OTA cache；无其它 Service 引用该 scriptKey 时再清能力层     |

### 1.3 非目标（本阶段不做）

- 改 MagickMonkey 服务端 OTA 契约（仍消费现有 manifest / preset / remote API）
- 在 Extension 内编辑脚本源码（仍跳转 Web Editor）
- Tampermonkey 路径改造
- SPA 路由变更时的重复注入（沿用现有「每页 load 一次」模型）

---

## 2. 产品模型

```text
Extension
├── Service[]                         ← Options 主列表（连接 / endpoint）
│     id, label, baseUrl, scriptKey, enabled, developMode?, …
│
└── ScriptKeyScope（逻辑，key = scriptKey）  ← Scripts / RULE / 脚本开关
      RULE[]
      ScriptListCache
      script_enabled:{scriptKey}:{file}
      │
      └── OTA ModuleCache[]            ← 物理上仍 per (baseUrl|scriptKey)，挂在各 Service endpoint
```

### 2.1 多 scriptKey 运行语义

| 对象                          | 规则                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| **参与运行的 scriptKey 集合** | `unique(scriptKey)` from `{ Service \| enabled }`                                                         |
| **RULE 匹配**                 | 每个 enabled scriptKey 的 RULE 并集                                                                       |
| **脚本执行**                  | scriptKey 在 enabled 集合内 **且** `script_enabled:{scriptKey}:{file}` 为 true                            |
| **OTA 拉取**                  | 每个 enabled scriptKey **仅一次** launcher；endpoint 由 §0.5 从同 scriptKey 的 enabled Service 中选       |
| **Badge**                     | **`SCRIPT_TRIGGERED` 执行次数**（现网行为）；多 scriptKey 时按 tab 累加执行数，**不用** tab-match RULE 数 |
| **GM 存储**                   | 物理键 `{gmScope}_{脚本内键名}`（如 `A_A`、`B_A1`）；`gmScope` 标识能力包，同 scriptKey 共享              |

### 2.2 UI 信息架构

| 页面        | 结构                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Options** | **Service 列表**（连接管理）→ 选中 Service → baseUrl / scriptKey / Test / Save / Sync RULE（同步到该 Service 的 **scriptKey** bucket） |
| **Scripts** | **按 scriptKey 分组**展示脚本；同 scriptKey 多 Service 不重复列表；组内 toggle 写 `scriptKey + file`                                   |
| **Popup**   | enabled Service 数、enabled **scriptKey** 数、当前 tab **脚本执行数**（badge 同源）                                                    |

> 若同一 scriptKey 挂了本地 + 生产两个 Service，Scripts 页只显示**一组**脚本；Options 仍显示两条 Service 便于切换 endpoint / 打开对应 Editor。

---

## 3. 数据模型与存储 Key（草案）

### 3.1 类型定义（`extension/src/types.ts`）

```ts
interface ServiceProfile {
  id: string
  label: string
  baseUrl: string
  scriptKey: string
  enabled: boolean
  /** 开发标识：列表中第一个 enabled 且 developMode 的 Service 用于 SSE reload（§10.2 例 3） */
  developMode?: boolean
  createdAt: number
  updatedAt: number
}

/** 每个 scriptKey 一份；同 scriptKey 多 Service 共享 */
interface ScriptKeyMeta {
  scriptKey: string
  /** GM 前缀，全局唯一；默认取该 scriptKey 首条 Service 的 label，可编辑（§10 #8） */
  gmScope: string
}

interface ExtensionServicesState {
  services: ServiceProfile[]
  scriptKeyMeta: ScriptKeyMeta[]
  /** Options UI：当前选中的 serviceId */
  activeServiceId?: string
}

/** 逻辑能力层 API 均接受 scriptKey，非 serviceId */
type ScriptKey = string
```

### 3.2 Storage Key 规划

| Key                                           | Scope                    | 说明                                                                |
| --------------------------------------------- | ------------------------ | ------------------------------------------------------------------- |
| `vws_extension_services`                      | 全局                     | Service 列表                                                        |
| `vws_scriptkey_rules:{scriptKey}`             | **scriptKey**            | RULE                                                                |
| `vws_scriptkey_script_list_cache:{scriptKey}` | **scriptKey**            | 脚本列表缓存                                                        |
| `vws_script_enabled:{scriptKey}:{file}`       | **scriptKey**            | 脚本开关                                                            |
| preset / manifest / bundle                    | **`baseUrl\|scriptKey`** | OTA 模块缓存（沿用现 scopedKeys）                                   |
| GM                                            | **`{gmScope}_{key}`**    | 见 §10.2 例 4；chrome 层如 `vws_gm_{gmScope}_{key}`                 |
| tab-match                                     | **`scriptKey`**          | 规则按 scriptKey；fetch 时选用该 scriptKey 对应 endpoint 的 baseUrl |

### 3.3 辅助 API（storage 层）

| 函数                                      | 说明                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| `getEnabledScriptKeys(services)`          | 从 enabled Service 去重得到 scriptKey 列表                                       |
| `resolveDevelopService(services)`         | 列表自上而下，**第一个 `enabled && developMode`** 的 Service；无则 `null`        |
| `resolveOtaEndpoint(scriptKey, services)` | 同 scriptKey 第一个 enabled（决策 1+2，与 develop 无关）                         |
| `countServiceRefs(scriptKey, services)`   | 删 Service 前判断是否清 ScriptKey 能力层                                         |
| `syncRulesFromServer(service)`            | 请求 `service.baseUrl` + API，**写入** `vws_scriptkey_rules:{service.scriptKey}` |

### 3.4 迁移策略（T0.3）

1. 启动时读 `vws_extension_services`；若不存在则读旧 `vws_extension_config`。
2. 旧 config → 生成一条 `ServiceProfile`（`label` 默认 host），`enabled: true`。
3. 旧 `vws_extension_rules` → `vws_scriptkey_rules:{scriptKey}`。
4. 旧 `vws_script_enabled:{file}` → `vws_script_enabled:{scriptKey}:{file}`。
5. 旧 OTA scoped 缓存（`baseUrl|scriptKey`）**保持不变**，无需改 key。
6. 写 `vws_extension_services`；旧 config key 可保留只读一版。

---

## 4. 任务总览

```text
Phase 0  设计与契约 ──► Phase 1  存储层 + 迁移
                              │
         Phase 2  Options（服务 CRUD）◄──┘
                              │
         Phase 3  按 scriptKey RULE ─┤
         Phase 4  Scripts 页按 scriptKey 分组 ─┤
         Phase 5  Background / Badge 合并 ─┤
                              │
         Phase 6  多服务页面注入 + Launcher ──► Phase 7  Connect / 文档 / E2E
```

| Phase | 名称                                | 优先级 | 预估体量 |
| ----- | ----------------------------------- | ------ | -------- |
| 0     | 设计与契约冻结                      | P0     | S        |
| 1     | 存储层与服务 API                    | P0     | M        |
| 2     | Options 服务管理 UI                 | P0     | M        |
| 3     | 按 scriptKey RULE                   | P1     | M        |
| 4     | Scripts 页按 scriptKey 分组         | P1     | M        |
| 5     | Background / Badge / Tab-match 合并 | P1     | M        |
| 6     | 多服务 Bootstrap + Launcher         | P0     | L        |
| 7     | Connect 流程 + 迁移 + 测试 + 文档   | P1     | M        |

体量：S ≈ 0.5d，M ≈ 1–3d，L ≈ 3–5d（单人粗略估计，不含 review）

---

## 5. 任务明细

状态：`TODO` | `IN_PROGRESS` | `DONE` | `BLOCKED`

### Phase 0 — 设计与契约冻结

| ID   | 任务                                                                                   | 状态       | 产出 / 验收                     |
| ---- | -------------------------------------------------------------------------------------- | ---------- | ------------------------------- |
| T0.1 | 冻结 `ServiceProfile`、ScriptKey 能力层 key 命名（§3.2）                               | TODO       | 更新 `types.ts` 草案            |
| T0.2 | 定义 `getEnabledScriptKeys()` / `resolveOtaEndpoint()` / `countServiceRefs()` 等 API   | TODO       | `extension-storage.ts` 接口清单 |
| T0.3 | 编写迁移 spec（旧 key → scriptKey key；OTA cache 不动）                                | TODO       | 本文 §3.4 + 单测用例            |
| T0.4 | Badge = **`SCRIPT_TRIGGERED` 执行次数**（非 tab-match）；多 scriptKey 累加规则见 T5.10 | **已确认** | §10 #6                          |
| T0.5 | OTA 列表顺序优先（§0.5 / §10.1 #1–2）                                                  | **已确认** | —                               |
| T0.6 | GM：`gmScope`（`ScriptKeyMeta`）+ `{gmScope}_{key}`                                    | TODO       | §10 #4、#8；影响 T6.4           |
| T0.7 | develop **MVP 不做 dev OTA**；仅 SSE reload（§10 #7）                                  | **已确认** | —                               |

---

### Phase 1 — 存储层与服务 API

| ID    | 任务                                                                                                                                      | 状态 | 依赖       | 涉及文件（主要）                                             |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------- | ------------------------------------------------------------ |
| T1.1  | 新增 `ServiceProfile` 与 `SERVICES_STORAGE_KEY`                                                                                           | TODO | T0.1       | `types.ts`                                                   |
| T1.2  | 实现 `loadExtensionServices()` / `saveExtensionServices()`                                                                                | TODO | T1.1       | `extension-storage.ts`                                       |
| T1.3  | Service CRUD + `setServiceEnabled`；**禁止** duplicate `(baseUrl, scriptKey)`                                                             | TODO | T1.2       | `extension-storage.ts`                                       |
| T1.4  | `removeService(serviceId)`：清该 Service 的 OTA cache（`baseUrl\|scriptKey`）；若 `countServiceRefs(scriptKey)===0` 再清 ScriptKey 能力层 | TODO | T1.3, T0.2 | `extension-storage.ts`                                       |
| T1.5  | ScriptKey 能力层 API + **`ScriptKeyMeta.gmScope`** 读写                                                                                   | TODO | T0.1, T0.6 | `extension-storage.ts`                                       |
| T1.6  | `resolveOtaEndpoint(scriptKey)` + **`resolveDevelopService()`**                                                                           | TODO | T0.5, T0.7 | `extension-storage.ts`                                       |
| T1.7  | `migrateLegacyExtensionConfigIfNeeded()`（§3.4；含旧 GM / developMode）                                                                   | TODO | T0.3       | `extension-storage.ts`                                       |
| T1.8  | `@deprecated loadExtensionConfig()`：返回第一个 enabled scriptKey 的 OTA 代表                                                             | TODO | T1.6       | `extension-storage.ts`                                       |
| T1.9  | OTA `scopedKeys` **保持** `baseUrl\|scriptKey`                                                                                            | TODO | —          | `extension-storage.ts`                                       |
| T1.10 | 单元测试：CRUD、scriptKey 引用计数、删 Service、迁移                                                                                      | TODO | T1.3–T1.7  | tests                                                        |
| T1.11 | **`upsertService()`** 替代 `applyExtensionServiceConfig`；**禁止**全局 wipe                                                               | TODO | T1.3       | `extension-storage.ts`, `background.ts`, `mm-options-app.ts` |
| T1.12 | `(baseUrl, scriptKey)` 去重校验；Connect/新增走 upsert                                                                                    | TODO | T1.11      | `extension-storage.ts`, `bridge/content.ts`                  |
| T1.13 | 旧 storage key 退役策略（`vws_extension_config` 等）                                                                                      | TODO | T1.7       | `extension-storage.ts`                                       |

**验收**：本地+生产同 scriptKey 两条 Service 共享脚本开关；删一条不清 ScriptKey 能力层；删最后一条才清。

---

### Phase 2 — Options 服务管理 UI

| ID    | 任务                                                                                    | 状态 | 依赖       | 涉及文件（主要）                               |
| ----- | --------------------------------------------------------------------------------------- | ---- | ---------- | ---------------------------------------------- |
| T2.1  | Options 布局：Service 列表 + 详情（连接管理）                                           | TODO | T1.2       | `options/index.html`, `mm-options-app.ts`      |
| T2.2  | 列表项：label、baseUrl、**scriptKey**、enabled；同 scriptKey 多条可标注「同 scriptKey」 | TODO | T2.1       | `mm-options-app.ts`                            |
| T2.3  | 新增 / 编辑 / 删除 Service；新增时若 scriptKey 已存在提示「共享能力层」                 | TODO | T1.3       | `mm-options-app.ts`                            |
| T2.4  | 详情：Server URL、Script Key、Test、Save                                                | TODO | T2.1       | `mm-options-app.ts`                            |
| T2.5  | Save 仅更新当前 Service；**不改**同 scriptKey 其它 Service 的 ScriptKey 能力层数据      | TODO | T1.3       | `mm-options-app.ts`                            |
| T2.6  | 每条 Service：**developMode** 勾选；Connect 写入该行（非全局）                          | TODO | §10.2 例 3 | `mm-options-app.ts`                            |
| T2.7  | 移除旧全局 developMode 单开关                                                           | TODO | T1.7       | `mm-options-app.ts`, `dev-extension-reload.ts` |
| T2.8  | Service **上移/下移**（顺序 = OTA 优先级）                                              | TODO | T0.5       | `mm-options-app.ts`                            |
| T2.9  | 编辑 **gmScope**（按 scriptKey 分组，唯一性校验）                                       | TODO | T0.6, T1.5 | `mm-options-app.ts`                            |
| T2.10 | scriptKey 格式校验（64 位 hex，可选）                                                   | TODO | T2.4       | `mm-options-app.ts`                            |

**验收**：同 scriptKey 两 Service 改 A 的 URL 不影响共享的脚本开关；B 的 RULE 仍可读。

---

### Phase 3 — 按 scriptKey RULE

| ID   | 任务                                                                     | 状态 | 依赖       | 涉及文件（主要）                             |
| ---- | ------------------------------------------------------------------------ | ---- | ---------- | -------------------------------------------- |
| T3.1 | `loadScriptKeyRules(scriptKey)` / `saveScriptKeyRules(scriptKey, rules)` | TODO | T1.5       | `extension-storage.ts`                       |
| T3.2 | `syncRulesFromServer(service)` → 写入 `service.scriptKey` bucket         | TODO | T3.1       | `extension-storage.ts`                       |
| T3.3 | `loadMergedRules()`：合并 **enabled 唯一 scriptKey** 的 rules            | TODO | T1.6, T3.1 | `extension-storage.ts`                       |
| T3.4 | Options：Sync RULE 用当前 Service 的 baseUrl 请求，存其 scriptKey        | TODO | T2.1, T3.2 | `mm-options-app.ts`                          |
| T3.5 | 删除全局 `RULES_STORAGE_KEY` 读写                                        | TODO | T1.7       | `extension-storage.ts`, `tab-match-cache.ts` |

**验收**：两 Service 同 scriptKey 共享 RULE；两不同 scriptKey 独立，合并匹配。

---

### Phase 4 — Scripts 页按 scriptKey 分组

| ID   | 任务                                                                 | 状态 | 依赖       | 涉及文件（主要）            |
| ---- | -------------------------------------------------------------------- | ---- | ---------- | --------------------------- |
| T4.1 | `setScriptEnabled(scriptKey, file, enabled)`                         | TODO | T1.5       | `extension-storage.ts`      |
| T4.2 | script list sync 用 `resolveOtaEndpoint(scriptKey)` 的 baseUrl       | TODO | T1.6       | `extension-storage.ts`      |
| T4.3 | UI **按 scriptKey 分组**（副标题展示关联 Service labels）            | TODO | T4.1, T4.2 | `mm-scripts-app.ts`         |
| T4.4 | toggle → `vws_script_enabled:{scriptKey}:{file}`                     | TODO | T4.1       | `mm-scripts-app.ts`         |
| T4.5 | Editor 链到该 scriptKey 的 **列表第一个 enabled** Service 的 baseUrl | TODO | T4.3, T1.6 | `mm-scripts-app.ts`         |
| T4.6 | scriptKey 下无 enabled Service 时组灰显                              | TODO | T4.3       | `mm-scripts-app.ts`         |
| T4.7 | DEBUG 面板按 scriptKey mock                                          | TODO | T4.3       | `mm-scripts-debug-panel.ts` |

**验收**：同 scriptKey 两 Service 只显示一组脚本；toggle 一次两边生效。

---

### Phase 5 — Background / Badge / Tab-match 合并

| ID    | 任务                                                                                               | 状态 | 依赖       | 涉及文件（主要）                            |
| ----- | -------------------------------------------------------------------------------------------------- | ---- | ---------- | ------------------------------------------- |
| T5.1  | `buildStatus()`：enabled Service / scriptKey 数 + tab 执行数                                       | TODO | T1.6       | `background.ts`, `messages.ts`              |
| T5.2  | `tab-match-cache` per scriptKey（Popup 可选展示，**非 badge**）                                    | TODO | T3.3       | `tab-match-cache.ts`                        |
| T5.3  | Badge：**保持 `SCRIPT_TRIGGERED` 执行次数**（§10 #6）                                              | TODO | T0.4       | `background.ts`, `tab-trigger-badge.ts`     |
| T5.4  | Sync rules：对每个 enabled scriptKey sync 一次（OTA 代表条 baseUrl）                               | TODO | T3.2       | `background.ts`, popup                      |
| T5.5  | `resetRuntimeState`：默认 **全部 enabled scriptKey**（§10 #9）                                     | TODO | T1.9, T5.9 | `extension-storage.ts`, `background.ts`     |
| T5.6  | `clearRuntimeModuleCache`：Update runtime → **全部 enabled scriptKey** 的 OTA scope                | TODO | T1.9, T5.9 | `background.ts`                             |
| T5.7  | rules / script_enabled / Service.enabled → invalidate tab-match                                    | TODO | T5.2       | `tab-match-cache.ts`, `background.ts`       |
| T5.8  | 扩展 `ShellStatus` + Popup 多服务摘要                                                              | TODO | T5.1       | `messages.ts`, `mm-popup-app.ts`            |
| T5.9  | Popup 壳动作：**Update/Reset → 全部 enabled scriptKey**；**Editor → activeService 或首条 enabled** | TODO | T5.1       | `background.ts`                             |
| T5.10 | 多 scriptKey：`SCRIPT_TRIGGERED` 上报带 `scriptKey`（dedupe `scriptKey\|file\|runAt`）             | TODO | T0.4       | `bridge/content.ts`, `tab-trigger-badge.ts` |

**验收**：badge 仍为执行次数；两 scriptKey 同页执行时计数正确；同 scriptKey 双 Service 不双跑 OTA。

---

### Phase 6 — 多服务 Bootstrap + Launcher（核心执行层）

| ID    | 任务                                                                                                              | 状态 | 依赖       | 涉及文件（主要）                        |
| ----- | ----------------------------------------------------------------------------------------------------------------- | ---- | ---------- | --------------------------------------- |
| T6.1  | `PageBootstrapConfig.scriptKeys: ScriptKeyBootstrapEntry[]`（scriptKey、otaBaseUrl、developMode、enabledScripts） | TODO | T0.1, T4.1 | `types.ts`                              |
| T6.2  | `bootstrap()`：`getEnabledScriptKeys()` + 每个 scriptKey 的 enabledScripts + gmStore 按 scriptKey 切片            | TODO | T6.1, T1.6 | `bridge/content.ts`                     |
| T6.3  | `page/index.ts`：对 **每个 enabled scriptKey 仅一次** `startLauncher`（endpoint=`resolveOtaEndpoint`）            | TODO | T6.2       | `page/index.ts`, `launcher-runtime.ts`  |
| T6.4  | GM 桥接：注入 `gmScope`；读写 `{gmScope}_{key}`                                                                   | TODO | T0.6       | `gm-bridge.ts`, `bridge/content.ts`     |
| T6.5  | module cache 仍用 `baseUrl\|scriptKey`（与 T1.9 一致）                                                            | TODO | T1.9       | `page/config.ts`, `launcher-runtime.ts` |
| T6.6  | launcher 传入 `scriptKey` scoped 的 enabled map                                                                   | TODO | T6.3       | `launcher-runtime.ts`                   |
| T6.7  | 防重复：同一 **scriptKey** 同一 navigation 只启动一次                                                             | TODO | T6.3       | `page/index.ts`                         |
| T6.8  | 多 scriptKey 顺序启动；单 scriptKey 失败不阻塞其它                                                                | TODO | T6.3       | `launcher-runtime.ts`                   |
| T6.9  | （可选）配置变更 → Popup/toast 提示 reload tab                                                                    | TODO | —          | `background.ts`                         |
| T6.10 | MVP：**始终注入** launcher；match 交给 preset（不接 `shouldInjectOnUrl`）                                         | TODO | —          | `bridge/content.ts`                     |
| T6.11 | Phase 6 前 **spike**：双 scriptKey `startLauncher` / GME 重复注册                                                 | TODO | T6.3       | spike 笔记                              |

**验收**：本地+生产同 scriptKey 双 enabled 只拉一次 OTA；两不同 scriptKey 各跑一条 bundle。

**风险**：preset / remote bundle 是否假设单 `__SCRIPT_URL__`；需在 T6.3 验证并文档化。

---

### Phase 7 — Connect、文档、测试

| ID    | 任务                                                                 | 状态 | 依赖           | 涉及文件（主要）                     |
| ----- | -------------------------------------------------------------------- | ---- | -------------- | ------------------------------------ |
| T7.1  | Web Connect：`upsertService(baseUrl, scriptKey)`，不删其它           | DONE | T1.11, T1.12   | `bridge/content.ts`, `background.ts` |
| T7.2  | Connect：`developMode` 写入**该 Service 行**；默认新 Service enabled | DONE | T7.1           | `handleWebConnect`                   |
| T7.3  | Popup 展示多服务摘要                                                 | DONE | T5.8           | `mm-popup-app.ts`                    |
| T7.4  | 更新 `extension/README.md`：多服务配置、迁移、Connect 行为           | DONE | Phase 1–7      | `README.md`                          |
| T7.5  | 更新 `extension/TODO.md` 交叉引用本文                                | DONE | T7.4           | `TODO.md`                            |
| T7.6  | 单测：scriptKey 去重、endpoint 解析、删 Service 引用计数、迁移       | DONE | T1.10, T3.3    | tests                                |
| T7.7  | 手动测试清单（见 §7）                                                | TODO | 全部           | —                                    |
| T7.8  | 移除 `@deprecated loadExtensionConfig`（可选）                       | TODO | 全部调用方迁移 | 全 extension                         |
| T7.9  | PING `connected` = Service 列表存在匹配 `(baseUrl, scriptKey)`       | DONE | T1.2           | `bridge/content.ts`                  |
| T7.10 | （可选）多服务 E2E / Playwright                                      | TODO | Phase 6+       | tests                                |

---

## 6. 文件影响地图

| 文件                              | 改动级别 | 说明                          |
| --------------------------------- | -------- | ----------------------------- |
| `src/types.ts`                    | **重**   | 新服务类型；bootstrap 结构    |
| `src/shared/extension-storage.ts` | **重**   | 核心：CRUD、scoped keys、迁移 |
| `src/shared/tab-match-cache.ts`   | **中**   | 多服务 scope + 合并           |
| `src/shell/background.ts`         | **中**   | status、sync、reset、connect  |
| `src/bridge/content.ts`           | **重**   | 多服务 bootstrap、connect     |
| `src/page/index.ts`               | **重**   | 多 launcher 启动              |
| `src/page/config.ts`              | **中**   | per-service URL / cache scope |
| `src/page/launcher-runtime.ts`    | **中**   | 可服务化、错误隔离            |
| `src/page/gm-bridge.ts`           | **中**   | GM namespace                  |
| `src/ui/mm-options-app.ts`        | **重**   | 服务列表 UI                   |
| `src/ui/mm-scripts-app.ts`        | **重**   | 分组 UI                       |
| `src/ui/mm-popup-app.ts`          | **轻**   | 摘要文案                      |
| `src/shared/messages.ts`          | **轻**   | ShellStatus 扩展              |
| `options/index.html`              | **中**   | 布局                          |
| `pages/scripts/index.html`        | **轻**   | 分组容器                      |

---

## 7. 手动测试清单

- [ ] 全新安装：无旧 config，可添加第一个服务并 Connect
- [ ] 从旧版升级：自动迁移为 1 条默认服务，RULE / 脚本开关保留
- [ ] 添加 Service：本地+生产 **同 scriptKey** → Scripts 只一组，开关共享
- [ ] 添加两 Service **不同 scriptKey** → Scripts 两组，可独立 toggle
- [ ] 删同 scriptKey 的一条 Service → ScriptKey 能力层数据保留；删最后一条 → ScriptKey 能力层清除
- [ ] 同 scriptKey 双 enabled：页面只 **一次** OTA / bundle
- [ ] 两 scriptKey enabled：页面 **两次** launcher，**badge 为执行次数累加**
- [ ] Editor Connect（Web 不变）：upsert `(baseUrl, scriptKey)` Service
- [ ] developMode 关 → 无 SSE；双开 → 有 reload
- [ ] 同 `(baseUrl, scriptKey)` 不可重复添加
- [ ] 改 Service 顺序 → OTA 代表条随之变化
- [ ] 两 scriptKey + GM：`A_A` / `B_A1` 不互相覆盖
- [ ] PING connected：存在匹配 Service 即 true
- [ ] `chrome://` 页无注入；extension 自身页 reload 正常

---

## 8. 建议实施顺序（迭代交付）

### 迭代 1 — 可配置、可切换（尚未多 bundle）

- T0._ → T1._（含 T1.11–T1.13）→ T2.\* → T7.1 / T7.9 → T7.4
- **交付**：多服务 CRUD + 迁移 + upsert；仍只跑一个 enabled scriptKey，验证存储与 UI。

### 迭代 2 — 策略层合并

- T3._ → T4._ → T5.\*
- **交付**：RULE / Scripts / Badge 按 **scriptKey** 合并；页面仍单 bundle（或只跑第一个 enabled scriptKey）。

### 迭代 3 — 执行层多 bundle

- T6._ → T7._
- **交付**：多服务真正并行 OTA；完整 E2E。

---

## 9. Definition of Done（整体）

- [ ] **WEB / API 无改动**；Connect 契约不变
- [ ] Service 管连接；**scriptKey 管能力**（RULE / 脚本开关 / 列表）
- [ ] 同 scriptKey 多 Service 共享能力层；OTA 每个 scriptKey 只跑一条链路
- [ ] 多 scriptKey enabled 时 RULE / badge / 执行合并
- [ ] 删 Service 引用计数正确；OTA cache 按 endpoint 清
- [ ] 旧用户迁移无感

---

## 10. 产品决策（已确认 + 说明）

### 10.1 决策表

| #   | 问题                                                  | **已确认**                                                                                                                                                                                                |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 同 scriptKey 多 endpoint：OTA 用哪条 baseUrl？        | **列表顺序优先**（类似 `/etc/hosts` 自上而下）：在 enabled 且 scriptKey 相同的 Service 里，**取列表中最靠上的一条** 的 baseUrl 拉 OTA；下面的同 scriptKey 条目仅作备用/Editor 入口，不参与 OTA            |
| 2   | Sync RULE 时同 scriptKey 多条 Service、多个 baseUrl？ | **同上，只认最靠上且 enabled 的一条**；Sync 结果写入该 scriptKey 的能力桶；下面几条同 scriptKey 的 Sync **可忽略**（或 UI 禁用 Sync，提示「由上条 Service 代表」）                                        |
| 3   | `developMode`                                         | **Per-Service 标识，须显式开启**：仅当某 Service **`enabled && developMode`** 时参与开发向行为；列表自上而下取**第一个**满足条件的；**未勾选 developMode 或 disabled → 完全不参与**（无 SSE、不 dev OTA） |
| 4   | GM 键隔离                                             | **`{gmScope}_{GM键名}`**（见 §10.2 例 4）；须带能力包前缀，不能只用脚本内键名                                                                                                                             |
| 5   | 新增 Service 时 scriptKey 已存在                      | **允许** = 同一脚本包多接一个 baseUrl（见 §10.2 例 5）；不是两套脚本                                                                                                                                      |
| 6   | Badge 显示什么？                                      | **保持现网**：`SCRIPT_TRIGGERED` **执行次数**；**不用** tab-match RULE 数；多 scriptKey 时累加执行数（T5.10 dedupe）                                                                                      |
| 7   | developMode 是否覆盖 OTA？                            | **MVP 不做 dev OTA**；develop 仅开 Extension watch SSE reload；生产 OTA 仍走 #1+#2                                                                                                                        |
| 8   | `gmScope` 存哪？                                      | **`ScriptKeyMeta.gmScope`**（per scriptKey，全局唯一；默认 label，Options 可编辑）                                                                                                                        |
| 9   | Popup Update/Reset/Editor 作用谁？                    | **Update/Reset → 全部 enabled scriptKey**；**Editor → activeService 或列表首条 enabled**                                                                                                                  |
| 10  | 重复 `(baseUrl, scriptKey)`？                         | **禁止**；Connect / 新增走 `upsertService` 更新同一条                                                                                                                                                     |
| 11  | 配置变更后已开 tab？                                  | MVP **提示 reload**；不自动 reload 全 tab                                                                                                                                                                 |
| 12  | 注入门控？                                            | MVP **始终注入** launcher；match 交给 preset                                                                                                                                                              |

> **列表优先规则（1 + 2 共用）**：Options 里 Service **排在前面的优先**；对同一 scriptKey，只有「代表条」生效，其余同 scriptKey 行视为别名 endpoint。  
> 不再使用「非 localhost 优先」；也不再依赖单独的 `primary` 字段（可从类型里去掉，或仅作 UI 快捷「移到顶部」）。

### 10.2 举例说明（3 / 4 / 5）

#### 例 3：`developMode` — 第一个「已开启且带标识」的 Service

**生效条件（缺一不可）：**

```text
enabled === true  AND  developMode === true
```

- **两个都满足** → 可成为「开发代表条」（列表里第一个满足的生效）。
- **只 enabled、未勾 developMode** → 仅作生产/连接/Editor（走 1+2 OTA 规则），**不用**于开发向行为。
- **disabled** → 整行忽略，即使勾了 developMode 也**不用**。

取消全局 Options 开关；标识只在 **Service 行勾选 developMode**。

**两个解析函数：**

| 函数                            | 规则                                                   | 用途                                           |
| ------------------------------- | ------------------------------------------------------ | ---------------------------------------------- |
| `resolveOtaEndpoint(scriptKey)` | 同 scriptKey、第一个 **enabled**（不看 developMode）   | 常规 OTA / Sync RULE（1+2）                    |
| `resolveDevelopService()`       | 全列表第一个 **`enabled && developMode`**；无则 `null` | **仅**开发向行为；为 `null` 则全部开发能力关闭 |

**开发向行为（仅当 `resolveDevelopService()` 非 null）：**

| 行为                               | 说明                             |
| ---------------------------------- | -------------------------------- |
| Extension watch 自动 reload（SSE） | 监听并 `chrome.runtime.reload()` |

**MVP 不做：** 同 scriptKey 的 dev OTA / preset 覆盖（§10 #7）。未开启 developMode 时：不监听 SSE；**只**走 1+2 生产代表条 OTA。

**例子：**

| 顺序 | label | enabled | developMode | 结果                                  |
| ---- | ----- | ------- | ----------- | ------------------------------------- |
| 1    | 生产  | ✓       | —           | OTA 代表（1+2）                       |
| 2    | 本地  | ✓       | ✓           | **开发代表** → Extension reload 等    |
| 2    | 本地  | ✓       | **关**      | 仅备用连接/Editor，**不**触发开发行为 |
| 2    | 本地  | **关**  | ✓           | 整行无效，**不**触发开发行为          |

**标识放哪：** Service 行 **developMode 勾选**（推荐）；Connect 本地条可默认勾上，用户可关。不在 Gist 脚本里解析标识（MVP）。

---

#### 例 4：「GM 键」是什么？怎么存？

**GM** = 脚本在网页里写的「小数据库」：

```js
GM_setValue('A', { count: 1 }) // 脚本作者起的名字通常很短，如 A、A1、config
GM_getValue('A')
```

Extension 落盘时 **不能只用脚本里的 `'A'`**，还必须带上 **是哪个能力包（哪套 scriptKey）**，否则多包并行时对不上号。

**你的例子（已采纳）：**

| 能力包（业务上的「服务」） | 脚本里写的 GM 名 | **实际存储键** | 含义        |
| -------------------------- | ---------------- | -------------- | ----------- |
| A 包（scriptKey `7f3a…`）  | `A`              | **`A_A`**      | A 服务的 A  |
| B 包（scriptKey `9c2b…`）  | `A1`             | **`B_A1`**     | B 服务的 A1 |

规则：**`{gmScope}_{GM键名}`**

- **`gmScope`**：存于 **`ScriptKeyMeta`**（per scriptKey，非 per Service）；Options 可编辑，Extension 内唯一。
  - 默认：该 scriptKey **首条 Service 的 label**（如 `A`、`B`）。
  - 同一 scriptKey 挂「生产 + 本地」两条 Service → **同一个 `gmScope`**，GM 仍共享。
- **`GM键名`**：脚本里 `GM_setValue` 的第一个参数，原样保留（如 `A`、`A1`）。

**为何不能只用 scriptKey hex 或裸键名？**

- 裸 `'A'`：A 包和 B 包若都写 `GM_setValue('config', …)` 会撞车。
- 仅 `{scriptKey}_A`：能隔离，但调试不直观；**`A_A` / `B_A1`** 一眼知道「哪包 + 哪个键」。
- 实现上 chrome.storage 可为 `vws_gm_A_A`；launcher 注入当前 bundle 的 `gmScope`，`GM_setValue('A', v)` 在桥接层改写为存 `A_A`。

**与决策 1+2 / 5 的关系：**

- **不同 scriptKey**（A 包 vs B 包）→ 不同 `gmScope` → 必须 **`A_*` vs `B_*`**（#4 由「多 scriptKey 并行」决定，不能单靠 1+2 推出）。
- **同一 scriptKey、多条 Service** → 同一 `gmScope` → 仍是一个 `A_A`，与 #5 一致。

---

#### 例 5：「scriptKey 已存在仍允许新增 Service」是什么意思？

**Service** = 一条连接记录：`label + baseUrl + scriptKey + enabled`。

**允许重复 scriptKey** ≠ 允许两套不同脚本；而是 **同一个 scriptKey，挂多个 baseUrl**（多个入口连同一脚本包）。

**例子：**

| 顺序 | label | baseUrl                  | scriptKey            | 含义                                                                   |
| ---- | ----- | ------------------------ | -------------------- | ---------------------------------------------------------------------- |
| 1    | 生产  | `https://app.vercel.app` | `7f3a…`（64 位 hex） | **代表条**：OTA、Sync RULE、Scripts 列表都以这条为准                   |
| 2    | 本地  | `http://localhost:3000`  | `7f3a…` **相同**     | 备用入口：方便 Editor Connect、打开本地 Editor；**不单独**再列一套脚本 |

此时 Scripts 页只有 **一组**（scriptKey `7f3a…`），开关只有一份。  
你在本地 Service 上点 Sync RULE → 可忽略或提示「请用列表上方的生产条 Sync」。

**对比：真正两套能力**

| 顺序 | label       | scriptKey        |
| ---- | ----------- | ---------------- |
| 1    | 客户 A 生产 | `7f3a…`          |
| 2    | 客户 B 生产 | `9c2b…` **不同** |

→ Scripts 页 **两组**，RULE / 开关 / OTA **各跑各的**，合并运行在页面上。

**Connect（Web 不变）：** Editor 点 Connect 仍只传当前页的 `baseUrl + scriptKey` → Extension **追加或更新** 列表里对应行，**不会删掉** 其它 Service。

---

### 10.3 决策之间的推导关系

| #     | 是否由 1+2 推出 | 说明                                                                                           |
| ----- | --------------- | ---------------------------------------------------------------------------------------------- |
| **5** | **基本是**      | 1+2 已假设「同 scriptKey 可有多条 Service，只认最上一条」                                      |
| **4** | **部分**        | 同 scriptKey 共享同一 `gmScope` ← 随 5；**`A_A` / `B_*` 双前缀** ← 多 scriptKey 并行，须单独定 |
| **3** | **否**          | 须 **`enabled && developMode` 双开**；未开启则开发向逻辑完全不跑                               |

### 10.4 对设计文档的连带修改

- `ServiceProfile.primary`：已删除；「置顶」= 调整列表顺序。
- T0.5 / T1.6：`resolveOtaEndpoint()` + **`resolveDevelopService()`**。
- T2.6：每条 Service 可选 **developMode** 勾选（开发标识）。
- T0.6 / T6.4：`ScriptKeyMeta.gmScope` + `{gmScope}_{key}`。
- T2.8 / T2.9：Service 排序 + gmScope 编辑。
- `dev-extension-reload.ts`：读 **`resolveDevelopService()`**；**无 dev OTA**（§10 #7）。

---

## 11. 缺口审查（对照代码库）

> §10 决策已确认；§11.6 任务 **已并入 §5**（T0.7、T1.11–T1.13、T5.8–T5.10、T6.9–T6.11、T7.9–T7.10）。

### 11.2 §10 产品决策

| #                                                        | 状态 |
| -------------------------------------------------------- | ---- |
| 1–2 列表优先（HOSTS 式）                                 | ✅   |
| 3 developMode：`enabled && developMode` 双开，第一个生效 | ✅   |
| 4 GM `{gmScope}_{键名}`                                  | ✅   |
| 5 同 scriptKey 允许多 Service                            | ✅   |
| 6 Badge = 执行次数                                       | ✅   |
| 7 MVP 无 dev OTA                                         | ✅   |
| 8–12 见 §10.1                                            | ✅   |

### 11.3 缺口 → 任务映射（已并入 §5）

| 缺口                                         | 任务 ID           |
| -------------------------------------------- | ----------------- |
| 废除 `applyExtensionServiceConfig` 全局 wipe | T1.11             |
| `(baseUrl, scriptKey)` 去重 + 列表排序       | T1.12, T2.8       |
| `ShellStatus` / Popup 多服务                 | T5.8, T7.3        |
| Popup 壳动作作用域                           | T5.9（§10 #9）    |
| PING `connected`                             | T7.9              |
| Badge 执行次数 + 多 scriptKey                | T0.4, T5.3, T5.10 |
| 配置变更 reload 提示                         | T6.9              |
| 注入门控 MVP 始终注入                        | T6.10             |
| 双 launcher spike                            | T6.11             |
| GM / 旧 key 迁移                             | T0.3, T1.13       |
| scriptKey 校验                               | T2.10             |
| E2E                                          | T7.10             |

### 11.4 与现网行为的对齐说明（避免实施误解）

| 现网                      | 文档                    | 状态      |
| ------------------------- | ----------------------- | --------- |
| Badge = 脚本**执行**次数  | T0.4 / T5.3 / §10 #6    | ✅ 已对齐 |
| tab-match 非 badge 主路径 | T5.2 仅 Popup/调试      | ✅        |
| `ExtensionConfig` 单条    | T1.8 兼容 + T6.1 替换   | 待实施    |
| Connect reload tab        | T7.2 upsert 后仍 reload | 待实施    |

### 11.5 可明确列为非目标（避免 scope creep）

- Web Editor / API 改造（已写 §0.1，保持）
- 服务配置导入导出、chrome.storage.sync
- Options 内 RULE 可视化编辑（仍 sync from server）
- 同页 SPA 路由变更重复注入
- Tampermonkey 路径多服务对齐

### 11.6 ~~建议补全任务~~ → 已并入 §5

见 Phase 0–7 中 T0.7、T1.11–T1.13、T2.8–T2.10、T5.8–T5.10、T6.9–T6.11、T7.9–T7.10。

---

## 12. 文档 REVIEW

### 12.1 已确认、可开 Phase 0/1

- 两层模型：Service（连接）+ scriptKey（能力）
- OTA / Sync RULE：列表第一个 enabled（同 scriptKey）
- developMode：须 `enabled && developMode`；**MVP 仅 SSE，无 dev OTA**
- GM：`ScriptKeyMeta.gmScope` + `{gmScope}_{键名}`
- Badge：**执行次数**（非 tab-match）
- Popup 壳动作：Update/Reset 全 scriptKey；Editor 当前/首条
- 禁止 duplicate `(baseUrl, scriptKey)`；`upsertService` 替代全局 wipe
- WEB / Connect 契约不变；迁移主路径（§3.4）

### 12.2 实施时注意（非阻塞）

| 项                | 说明                                          |
| ----------------- | --------------------------------------------- |
| T6.11 spike       | Phase 6 前验证双 `startLauncher` / GME        |
| T1.13             | 旧 `vws_gm_*` 迁移到首条 scriptKey 的 gmScope |
| T2.9 gmScope 改名 | 改 scope 不迁移旧 GM 键（MVP 可接受）         |
| §7 手动测试       | 见下方补充项                                  |

### 12.3 已消除的矛盾

| 项                 | 说明                    |
| ------------------ | ----------------------- |
| Badge vs tab-match | 已统一为执行次数        |
| dev OTA vs 1+2     | MVP 不做 dev OTA        |
| §11.6 vs §5        | 任务已合并              |
| Popup「匹配数」    | 改为执行数 / badge 同源 |

### 12.4 测试清单补充（§7）

- [ ] developMode 关 → 无 SSE；双开 → 有 reload
- [ ] 同 `(baseUrl, scriptKey)` 不可重复添加
- [ ] 改 Service 顺序 → OTA 代表条随之变化
- [ ] 两 scriptKey + GM：`A_A` / `B_A1` 不互相覆盖
- [ ] PING connected：存在匹配 Service 即 true

---

_文档版本：v2.4 · 三项 REVIEW 已确认，§11.6 已并入 §5_
