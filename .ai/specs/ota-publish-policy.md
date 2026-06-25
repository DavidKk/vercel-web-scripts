# OTA 发布策略（SERVER 权威 + 单 Gist）

> 状态：**已评审，待实现**  
> 任务跟踪：`../tasks/active/ota-publish-policy.md`

## 1. 背景与问题

当前 OTA 以 **内容 hash 变化** 为唯一升级信号：服务端一部署或 Gist 一保存，所有客户端会在下次 manifest 轮询时拉取并应用新产物。

v1 需要：

1. **ALPHA 调试**不自动推给普通用户，只能升级到 **stable**。
2. 策略由 **SERVER（云端）** 配置，不靠部署环境变量。
3. 每个脚本可单独设置 **是否自动升级**、**发布阶段**、**锁定版本**（类似现有的安装/启用，但策略源在 SERVER）。
4. **单 Gist**，不拆库；调试中的脚本不影响其他使用者。

## 2. 设计原则

| 原则          | 说明                                                                                  |
| ------------- | ------------------------------------------------------------------------------------- |
| 单 Gist       | 所有脚本与元数据在同一 Gist                                                           |
| 无环境变量    | `RELEASE_STAGE` 等部署变量不用于通道；策略写在 `magickmonkey.scripts.index.json`      |
| SERVER 权威   | `ota.*` 与 `runtime` 由 Web Editor / API 维护；客户端只读展示 + 少量订阅偏好          |
| 双产物        | 同一次部署构建 `stable` / `alpha` 两份 script bundle，避免 stable 用户拉到 alpha 内容 |
| 兼容 hash OTA | 保留 manifest ETag、hash 校验、rollback；在 hash 变化之上增加 **策略门控**            |

## 3. 三层开关模型

```text
执行条件 = installed（客户端）∧ enabled（客户端）∧ OTA 策略允许（SERVER + 客户端 acceptAlpha）
```

| 层级          | 配置位置                                 | 作用                                       |
| ------------- | ---------------------------------------- | ------------------------------------------ |
| `installed`   | Extension `vws_script_installed:*`       | 是否装载脚本（已有）                       |
| `enabled`     | Extension `vws_script_enabled:*`         | 装载后是否执行（已有）                     |
| `ota.*`       | SERVER `magickmonkey.scripts.index.json` | 发布阶段、自动升级、锁定版本               |
| `acceptAlpha` | 客户端（per scriptKey，可选 per-file）   | 是否订阅 ALPHA 脚本/运行时（默认 `false`） |

**与安装/启用的区别**：`installed` / `enabled` 是用户本地偏好；`ota.autoUpgrade` / `ota.lockedVersion` 是管理员发布的 **fleet 策略**，在 Extension Scripts 页 **只读展示**。

## 4. SERVER 元数据契约

### 4.1 脚本级：`ScriptFileMeta.ota`

扩展 `services/scripts/gistScripts.ts` 中的 `ScriptFileMeta`：

```typescript
interface ScriptOtaPolicy {
  /** 发布阶段；省略时按 stable 处理 */
  stage: 'stable' | 'alpha'
  /** 是否允许客户端自动应用新版本；见默认表 */
  autoUpgrade: boolean
  /** fleet 锁定版本（semver x.x.x 或带 prerelease）；stable 构建取对应快照 */
  lockedVersion?: string
}

interface ScriptFileMeta {
  filename: string
  version?: string
  contentHash?: string
  // …现有字段
  ota?: ScriptOtaPolicy
}
```

**默认值（`ota` 省略时）**：

| 场景                         | `stage`  | `autoUpgrade` |
| ---------------------------- | -------- | ------------- |
| 新建脚本首次保存（推荐默认） | `alpha`  | `false`       |
| 显式「发布 stable」后        | `stable` | `true`        |
| 历史脚本迁移（无 `ota`）     | `stable` | `true`        |

### 4.2 平台级：`runtime`（index 顶层）

```json
{
  "version": 1,
  "updatedAt": "2026-06-25T00:00:00.000Z",
  "runtime": {
    "projectVersion": "0.2.0",
    "stage": "stable",
    "autoUpgrade": true,
    "lockedVersion": null
  },
  "scripts": []
}
```

控制 **preset-core**（及可选 UI 模块）的 OTA 行为，语义与脚本 `ota` 一致。

### 4.3 Manifest 附带策略摘要

`buildRuntimeModuleManifest` 在响应中合并轻量 sidecar（便于 Launcher 在不解析整份 index 时决策）：

```typescript
interface RuntimeModuleManifest {
  manifestVersion: 1
  projectVersion: string
  generatedAt: number
  runtime: RuntimeOtaPolicy
  scriptPolicies: Record<string, Pick<ScriptOtaPolicy, 'stage' | 'autoUpgrade' | 'lockedVersion'> & { version?: string }>
  modules: RuntimeModuleDefinition[]
}
```

`scriptPolicies` 的 key 为 Gist 文件名（如 `foo.user.js`）。

## 5. 版本快照（单 Gist，非多库）

锁定版本需要可回指的 **不可变内容**。在同一 Gist 使用 `releases/` 前缀：

```text
foo.user.js                    ← 当前工作稿（可为 alpha）
releases/foo.user.js@1.2.0     ← promote 时写入的快照（不可变约定）
```

**路径规则**：

- 文件名模式：`releases/{originalFilename}@{semver}`
- `isManagedScriptFilename` 已拒绝含 `/` 的路径 → `releases/*` **不会**进入用户脚本枚举或默认编译列表
- 加入 `EXCLUDED_FILES` 或等价常量，参与快照读写但不参与普通 upsert 列表

**操作语义**：

| 操作            | Gist / index 变更                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| **保存为调试**  | 更新 `foo.user.js`；`ota.stage=alpha`，`ota.autoUpgrade=false`；不写 releases                                        |
| **发布 stable** | 复制内容到 `releases/foo.user.js@{@version}`；`ota.stage=stable`，`ota.autoUpgrade=true`；清除或更新 `lockedVersion` |
| **锁定版本**    | 设 `ota.lockedVersion` 为当前 stable `@version`；stable 构建从 releases 快照取内容                                   |
| **解除锁定**    | 清除 `lockedVersion`；stable 构建跟工作稿（须 `stage=stable`）                                                       |

> **与 Gist 历史回滚的关系**：`releases/` 是 **发布快照**（OTA 锁定 / stable 构建）；`tasks/backlog/gist-script-rollback.md` 的 revision 索引是 **编辑历史**。二者互补：promote 写快照；编辑器回滚用 revision API。

## 6. SERVER 构建：双 script bundle

`buildRemoteScriptBundleFromGist` 拆为两条路径（或同一函数加 `track` 参数）：

| 产物   | 路由（示例）                                 | 包含脚本                                                          |
| ------ | -------------------------------------------- | ----------------------------------------------------------------- |
| stable | `/static/{key}/tampermonkey-remote.js`       | `ota.stage === 'stable'`；若设 `lockedVersion` 则取 releases 快照 |
| alpha  | `/static/{key}/tampermonkey-remote.alpha.js` | stable 全集 + `stage === 'alpha'` 的工作稿                        |

Manifest 模块：

```json
{
  "id": "script-bundle",
  "optional": true,
  "url": ".../tampermonkey-remote.js",
  "hash": { "algorithm": "sha1", "value": "..." }
},
{
  "id": "script-bundle-alpha",
  "optional": true,
  "lazy": true,
  "url": ".../tampermonkey-remote.alpha.js",
  "hash": { "algorithm": "sha1", "value": "..." }
}
```

**关键性质**：仅修改 alpha 脚本时，**stable bundle 的 hash 不变** → 普通用户不会触发 script-bundle 升级。

平台 **preset-core**：`runtime.stage === 'alpha'` 时 manifest 标记 `runtime`；客户端对 preset 应用同一套门控（见 §7）。可选后续增加 `preset-core-alpha` 路由；v1 可先仅用 `runtime.autoUpgrade=false` 冻结平台 OTA。

## 7. 客户端 OTA 决策

在 Launcher（`launcherScript.ts` / `extension/src/page/launcher-runtime.ts`）与 preset 拉取逻辑中，**hash 变化仅为必要条件**，还须通过策略：

```text
shouldApplyModule(moduleId, remote, local, policies, clientPrefs):

  policy ← resolvePolicy(moduleId, policies)

  if policy.stage === 'alpha' and not clientPrefs.acceptAlpha:
    return false

  if not policy.autoUpgrade and remote.hash ≠ local.hash:
    return false   // 保留本地缓存；无缓存时允许 bootstrap 首次安装

  if policy.lockedVersion and remote.version ≠ policy.lockedVersion:
    return false   // 等待 SERVER promote 或解除锁定

  return remote.hash ≠ local.hash
```

**手动升级（Popup Update）**：

- 可绕过 `autoUpgrade=false`（管理员/用户主动）
- 不可绕过 `acceptAlpha=false` 去拉 alpha 模块（需二次确认或先开启 acceptAlpha）
- 跨锁定版本升级需确认「解除锁定」或提示联系管理员

**Tampermonkey 启动器**：与 Extension 共用同一 manifest 契约；须同步实现 `script-bundle` / `script-bundle-alpha` 分支（无 Extension 时无 `acceptAlpha`，仅 stable）。

### 7.1 聚合 bundle 下的 per-script 缓存（v1 约束）

stable bundle 仍为 **聚合包**。当 bundle hash 变化但部分脚本被 `lockedVersion` / `autoUpgrade=false` 保护时：

1. 客户端下载新 bundle 后，**按文件名**解析各脚本块；
2. 对策略禁止升级的脚本，**保留上一份已执行内容的 per-file 缓存**（key：`baseUrl + scriptKey + file + contentHash`）；
3. 仅替换允许升级的脚本块后执行。

此行为与 Phase D「按脚本拆包」一致的方向，v1 用 **解析聚合包 + per-file 缓存** 过渡。完整 selective update 见 `runtime-modularization.md` Phase C/D。

## 8. Extension UI

### 8.1 Scripts 页（`mm-scripts-app`）

| 展示/控件                   | 来源                       | 可编辑                             |
| --------------------------- | -------------------------- | ---------------------------------- |
| 安装 / 启用                 | 客户端                     | 是（已有）                         |
| 阶段徽章 `stable` / `alpha` | SERVER `ota.stage`         | 否                                 |
| 自动升级                    | SERVER `ota.autoUpgrade`   | 否                                 |
| 锁定版本                    | SERVER `ota.lockedVersion` | 否（展示 `🔒 1.2.0`）              |
| 接收 ALPHA                  | 客户端 `acceptAlpha`       | 是（per scriptKey；可选 per-file） |

脚本列表 API / 列表缓存需下发 `ota` 字段（来自 index 或 manifest `scriptPolicies`）。

### 8.2 Web Editor

| 操作        | 效果                                                          |
| ----------- | ------------------------------------------------------------- |
| 保存为调试  | `ota.stage=alpha`，`ota.autoUpgrade=false`                    |
| 发布 stable | 写 releases 快照 + `ota.stage=stable`，`ota.autoUpgrade=true` |
| 锁定版本    | 设 `ota.lockedVersion`                                        |
| 解除锁定    | 清除 `ota.lockedVersion`                                      |

## 9. Semver

| 场景        | `@version` 格式                         |
| ----------- | --------------------------------------- |
| stable 发布 | `x.x.x`（沿用 `isStrictSemverVersion`） |
| alpha 调试  | `x.x.x-alpha.N` 或 `x.x.x-dev.N`        |

需扩展 `shared/semver-compare.ts`：

- 识别 prerelease 段；
- stable 轨道：`acceptAlpha=false` 时忽略 prerelease 版本；
- `lockedVersion` 精确匹配。

## 10. API / MCP

| 变更                                   | 说明                                                             |
| -------------------------------------- | ---------------------------------------------------------------- |
| `updateManagedScriptIndexMetadata`     | 支持读写 `ota`                                                   |
| 新 actions                             | `scripts_publish_stable`、`scripts_lock_version`（或 REST 等价） |
| `listScriptFiles` / MCP `scripts_list` | 返回 `ota`                                                       |
| OpenAPI                                | `services/scripts/openapiV1.ts` 扩展 schema                      |

## 11. 调试工作流（不影响他人）

```text
开发者 → Web Editor「保存为调试」(alpha, autoUpgrade=false)
       → 仅 alpha bundle hash 变化
普通用户 → 只订阅 script-bundle (stable) → 无变化
开发者   → Extension 开启 acceptAlpha → 拉 script-bundle-alpha → 验证
开发者   →「发布 stable」→ releases 快照 + stable 元数据
普通用户 → autoUpgrade=true → 下次 OTA 升到新版本
```

本地 **Editor Dev Mode** / **preset-built SSE** 仍用于零云端影响的快速迭代（与现网一致）。

## 12. 与现有规格的关系

| 文档                                    | 关系                                                             |
| --------------------------------------- | ---------------------------------------------------------------- |
| `runtime-modularization.md` Phase C     | per-module hash、rollback；本规格在之上加策略门控                |
| `runtime-modularization.md` Phase D     | 长期改为 per-script 模块；v1 用聚合包 + per-file 缓存过渡        |
| `runtime-compatibility.md`              | 保留 manifest 不可用时的 legacy 回退                             |
| `gist-script-rollback.md`               | 编辑历史 vs `releases/` 发布快照                                 |
| `extension/docs/multi-service-tasks.md` | `acceptAlpha` 为 per scriptKey 客户端偏好；与 `developMode` 正交 |

## 13. 评审结论与待决项

### 13.1 评审通过项

- SERVER 权威 + 客户端 `acceptAlpha` 分层清晰，符合「类似安装但策略在云端」。
- 双 bundle 在同部署完成 stable/alpha 隔离，无需环境变量与第二 Gist。
- `releases/` 快照与 index `lockedVersion` 可表达 fleet 锁定。
- 默认「新脚本 alpha + 不自动升级」保护生产用户。

### 13.2 实现时必须覆盖

- [ ] Tampermonkey launcher 与 Extension launcher **同一套** manifest 策略逻辑
- [ ] 聚合 bundle 的 **per-file 缓存**（§7.1），避免「bundle 升级拖垮锁定脚本」
- [ ] `releases/` 纳入 managed 文件常量与 EXCLUDED 规则
- [ ] 历史脚本无 `ota` 时迁移默认为 `stable` + `autoUpgrade=true`

### 13.3 产品待确认（不阻塞写 spec）

- [ ] `acceptAlpha` 默认粒度：per scriptKey 还是 per-file（建议 v1：per scriptKey）
- [ ] Web Editor「保存为调试」是否为默认保存动作，还是显式按钮
- [ ] 平台 `runtime.stage=alpha` 时是否暴露独立 `preset-core-alpha` 产物（建议 v1：仅 `autoUpgrade` 门控）

## 14. 验收标准

- [ ] alpha 脚本修改后，stable bundle hash **不变**；未开 acceptAlpha 的客户端 **不**更新该脚本
- [ ] `ota.autoUpgrade=false` 时，自动轮询 **不**应用新 hash；手动 Update 可以
- [ ] `lockedVersion` + releases 快照：stable 用户持续运行锁定版本，直至 promote / 解锁
- [ ] 「发布 stable」写入 releases 且 index 元数据正确；MCP/API 可读 `ota`
- [ ] Extension Scripts 页展示 SERVER 策略；acceptAlpha 仅影响 alpha 模块拉取
- [ ] Tampermonkey 安装路径行为与 Extension 一致（仅 stable）
- [ ] semver prerelease 比较与 `@version` 校验一致

## 15. 关联代码（实现入口）

| 区域               | 路径                                                 |
| ------------------ | ---------------------------------------------------- |
| Index / 脚本元数据 | `services/scripts/gistScripts.ts`                    |
| Remote bundle 构建 | `services/tampermonkey/remoteScriptBundle.server.ts` |
| Manifest           | `services/runtime/moduleManifest.ts`                 |
| TM Launcher        | `services/tampermonkey/launcherScript.ts`            |
| Extension Launcher | `extension/src/page/launcher-runtime.ts`             |
| Scripts UI         | `extension/src/ui/scripts/mm-scripts-app.ts`         |
| Semver             | `shared/semver-compare.ts`                           |
| 管理文件常量       | `shared/managed-script-files.ts`                     |
