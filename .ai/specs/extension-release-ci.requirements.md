# 需求：Chrome 扩展正式发版改由 CI 负责（semver）

> 状态：**实现中**（P0；文档 REVIEW 修订 2026-08-09）  
> 关联技术规格：[`extension-release-ci.md`](./extension-release-ci.md)  
> 关联代码（现状）：`shared/version-bump.ts`、`scripts/bump-version-from-commits*`、`.husky/pre-push`、`GET /api/extension/version`、`pnpm pack:extension`

## 1. 问题与用户

| 角色           | 痛点                                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| 维护者         | 正式插件发版应走 CI；当前靠本地 `pre-push` bump，易绕过、且与「再 push 一次」心智耦合                |
| 扩展终端用户   | 需要可靠的「有新版本」提示 + 可下载的正式 ZIP；版本号须单调、可比较                                  |
| 平台（Vercel） | Web/API 部署与扩展壳发版不应强绑定；不为了改 `package.json` 多打一轮 Production（可接受 GH CI 成本） |

**成功标准：**

1. 正式扩展版本号为 **semver `X.Y.Z`**（与现网一致），由 **GitHub Actions** 在发版流水线中计算并写入产物。
2. 正式 ZIP + 版本元数据以 **CI 发布通道** 为权威来源；本地开发仍可 `pnpm pack:extension`，但不算正式版。
3. Popup / Options 的更新检测：对比「已安装 manifest.version」与「正式通道最新 `X.Y.Z`」；**不依赖**「某次 Vercel 构建里碰巧带了什么 `package.json`」。
4. 去掉（或降级为可选）`main`/`master` 上的 **pre-push 自动 bump**，避免与 CI 双水源冲突。
5. 正式发版的回写 commit **不触发** Vercel Production（零次额外构建）；日常业务 push 的 Vercel 节奏不变。

## 2. 范围

### 2.1 In scope

- 根 `package.json` `version` 与扩展 `manifest.version` 的 **正式发版** 流程（仍共用同一 `X.Y.Z`，构建时注入）。
- Conventional Commits → bump 规则复用现有逻辑（`feat` → minor，否则 patch；`chore(release)` 水位）。
- GitHub Actions：bump（如需要）→ `build:extension` / `pack:extension` → 发布正式产物（推荐 GitHub Release）。
- `/api/extension/version`（及下载 URL）改为读取 **正式发布元数据**，而非「当前部署目录里的 dist/package.json」作为权威。
- 文档：`extension/README.md`、发版说明；迁移：停用 husky pre-push bump。

### 2.2 Out of scope

- Chrome Web Store 上架与 CWS 自动更新（仍可后续接同一 semver / ZIP）。
- Preset / userscript OTA（`ota-publish-policy`）——与扩展壳版本独立。
- 用 CalVer / 时间戳替换 `X.Y.Z`（已否决；保持 semver）。
- 改变 Vercel 上 Next/Preset 的日常部署节奏（仅要求与扩展发版解耦）。

## 3. 版本与通道约定

| 项          | 约定                                                                        |
| ----------- | --------------------------------------------------------------------------- |
| 格式        | 严格 `X.Y.Z`（无 pre-release 进「正式」通道；alpha 若需要另议）             |
| 谁 bump     | **仅** `workflow_dispatch` 触发的 CI 发版 job                               |
| 谁算正式版  | CI 打出的 GitHub Release（tag `vX.Y.Z`）+ ZIP asset                         |
| 开发/本地包 | 可用当前工作区 `package.json` 版本；更新检测可忽略或标为非生产              |
| Vercel 站点 | 可继续托管「便捷下载」镜像，但 **不得** 作为正式 version / downloadUrl 真相 |

## 4. 用户可见行为

1. 维护者在 GitHub Actions 上手动跑发版 workflow；有待发变更时创建 `vX.Y.Z`、ZIP，并回写 `package.json`。
2. 已安装旧版扩展的用户，在配置的 MagickMonkey origin 上检查更新时：`updateAvailable === true`，且 `latestVersion` / `downloadUrl` 指向 **GitHub Release asset**。
3. 仅部署 Web 前端、未发扩展版时：**不应**仅因 Vercel 重建就冒充新扩展版本。

## 5. 非功能需求

| 项     | 要求                                                                          |
| ------ | ----------------------------------------------------------------------------- |
| 幂等   | 同一 tip、无新业务 commit 时，重复跑发版 job 不产生新 tag / 不重复上传        |
| 权限   | Release 使用 `contents: write`（或等价）；密钥不进日志                        |
| 可观测 | Job 日志打印 `range`、bump level、`X.Y.Z`、asset 名                           |
| 回滚   | 不删除历史 Release；紧急时可发更高 patch 指向修复 ZIP，或文档说明「卸装回退」 |

## 6. Requirements audit（摘要）

| 检查项   | 结论                                                                |
| -------- | ------------------------------------------------------------------- |
| 影响谁   | 维护者发版路径；扩展用户更新检测；Vercel 构建次数解耦               |
| 模块影响 | Extension pack、version API、husky、GH Actions；不改 preset OTA     |
| 兼容性   | 客户端仍消费 `{ version, downloadUrl }`；version 仍为 `X.Y.Z`       |
| 缓存     | 现有 API `max-age=60` 可保留；正式元数据源需可缓存                  |
| 失败安全 | CI 失败则不发版；API 拉取正式元数据失败时与现网一致：不提示错误更新 |
| 验证     | 单测 bump；workflow dry-run；手工：发版后 Popup 提示新版本可下      |

## 7. 已锁定决议（2026-08-09）

| #   | 项             | 决议                                                                                                                                                                          |
| --- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 触发方式       | **仅** `workflow_dispatch`（不因 push `main` 自动发版）                                                                                                                       |
| 2   | `package.json` | CI **回写并 push** 到 `main`；**subject 保持** `chore(release): X.Y.Z`（供水位检测）；**`[skip vercel]` 只放 commit body**；另配 Vercel `ignoreCommand` 识别 `chore(release)` |
| 3   | `downloadUrl`  | **GitHub Release asset**（须能匿名下载 → **仓库公开**，或后续改托管；P0 按公开仓）                                                                                            |

## 8. 文档 REVIEW 补强（实现须遵守）

| 项              | 约定                                                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Bump range      | CI 发版 **禁止** 使用 `origin/main..HEAD`（dispatch 时通常为空）。水位 = 最近一次 `chore(release):` commit（无则最近 `vX.Y.Z` tag）..`HEAD`。 |
| Workflow ref    | 仅允许在 **`main`** 上发版；非 `main` 直接 fail。                                                                                             |
| 步骤顺序        | **先** `gh release create`，**再** 回写 push。Release 已是权威；回写失败可重跑（见技术规格恢复策略）。                                        |
| pre-push        | **与 P0 同 PR 移除**，禁止「CI 已上、本地 pre-push 仍 bump」的双水源窗口。                                                                    |
| 失败安全（API） | 正式源失败时：客户端不提示更新（可返回空/旧缓存）；**过渡期 fallback** 若启用，不得把站点 `/downloads` 宣称为正式 `downloadUrl` 持久方案。    |

按技术规格 **P0（含去 pre-push）→ P1 文档完善** 开工。
