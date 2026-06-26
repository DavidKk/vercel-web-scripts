# OTA 发布策略（SERVER 权威）— task thread

Status: **DONE**（B4 preset-core alpha 轨道 v1 延后）

Related spec: `../../specs/ota-publish-policy.md`

Related code: `services/scripts/gistScripts.ts`, `services/tampermonkey/remoteScriptBundle.server.ts`, `services/runtime/moduleManifest.ts`, `services/tampermonkey/launcherScript.ts`, `extension/src/page/launcher-runtime.ts`, `extension/src/ui/scripts/mm-scripts-app.ts`

---

## Objective

在单 Gist、无部署环境变量的前提下，由 SERVER 为每个脚本（及平台 runtime）配置 **发布阶段 / 自动升级 / 版本锁定**；客户端像安装/启用一样执行策略，使 ALPHA 调试不影响 stable 用户。

---

## Review summary（2026-06-25）

| 项           | 结论                                                                     |
| ------------ | ------------------------------------------------------------------------ |
| 整体方案     | **通过**，可进入实现                                                     |
| 环境变量通道 | 不采用；策略进 index                                                     |
| 多 Gist      | 不采用；`releases/` 快照                                                 |
| 与 hash OTA  | 叠加策略门控，不替换                                                     |
| 风险点       | 聚合 bundle 需 per-file 缓存（见 spec §7.1）；TM 与 Extension 须双端实现 |

---

## Phase A — SERVER 元数据与构建

- [x] A1. 扩展 `ScriptFileMeta.ota` 与 index 顶层 `runtime`（types + parse/stringify + 默认值）
- [x] A2. `releases/` 快照路径辅助（`shared/script-ota-policy.ts`）；`releases/*` 自然排除于 managed 枚举
- [x] A3. Web Editor：保存为调试 / 发布 stable / 锁定·解锁版本（账户菜单）
- [x] A4. promote：写 `releases/{file}@{version}` 快照（`publishManagedScriptStable`）
- [x] A5. `buildRemoteScriptBundleFromGist(track)`：stable 与 alpha 双产物 + 锁定版本取快照
- [x] A6. 路由 `tampermonkey-remote.alpha.js`（含 hash 路由）
- [x] A7. `buildRuntimeModuleManifest`：`script-bundle-alpha` + `runtime` / `scriptPolicies`
- [x] A8. API `POST /api/v1/scripts/:filename/ota`（publish-stable / lock / unlock）
- [x] A8b. MCP（`scripts_ota_*`）+ OpenAPI `ScriptOtaPolicy` / OTA path
- [x] A9. 历史脚本无 `ota` 时读取默认为 `stable` + `autoUpgrade=true`；新脚本 upsert 默认 alpha

## Phase B — 客户端 OTA 门控

- [x] B1. `shared/ota-apply-policy.ts` 策略决策
- [x] B2. Extension `launcher-runtime.ts`：alpha bundle 选择 + preset `runtime.autoUpgrade` 门控
- [x] B3. Tampermonkey `launcherScript.ts`：preset-core OTA 门控（stable 默认，无 acceptAlpha）
- [ ] B4. preset-core：完整 `runtime.stage` alpha 轨道（v1 defer）
- [x] B5. 聚合 bundle per-file 缓存与合并执行（spec §7.1）
- [x] B6. Popup Update：手动升级绕过 `autoUpgrade`（`OTA_MANUAL_UPDATE_KEY`）
- [x] B7. `shared/semver-compare.ts` prerelease 支持

## Phase C — Extension UI 与存储

- [x] C1. `acceptAlpha` 存储（per scriptKey + file）+ bootstrap 注入
- [x] C2. Scripts 页：展示 SERVER `ota`（只读）+ acceptAlpha 开关
- [x] C3. 脚本列表缓存解析 `ota` 字段（`SCRIPT_LIST_META_SCHEMA=3`）
- [x] C4. Popup / footer 展示 runtime stage（STB / ALP）

## Phase D — 验证与文档

- [x] D1. 单元测试：双 bundle 构建、锁定快照解析、策略决策矩阵
- [x] D2. 集成：alpha 改动 stable hash 不变；acceptAlpha 拉 alpha bundle（单元 + 策略集成测试）
- [x] D3. 更新 `runtime-verification-checklist.md` 相关条目
- [x] D4. 更新 `public/docs/scripts-ai-skill.md`（MCP publish / ota 字段）

---

## 验收（与 spec §14 对齐）

- [x] alpha 修改不触发 stable 客户端 script-bundle 升级（单元测试覆盖）
- [x] `autoUpgrade=false` 阻止自动应用；手动 Update 可用
- [x] `lockedVersion` + releases 快照生效（服务端 + 策略单元测试）
- [x] 发布 stable 全流程（快照 + index + manifest）
- [x] TM + Extension preset-core 行为一致（stable 默认）
- [x] 端到端集成验收（D2：策略 + per-file merge 集成测试；Playwright E2E 仍 backlog）

---

## 依赖与顺序

```text
A1–A2 → A5–A7（构建）→ B1–B5（客户端）→ C*（UI）→ D*
A3–A4 可与 A5 并行（Editor + 快照）
```

**后续 backlog**：B4 preset-core alpha 轨道、Playwright E2E 集成。

---

## 不在本任务范围

- 多 Gist / 独立 alpha 部署域名
- 部署环境变量 `RELEASE_STAGE`
- Gist revision 历史 UI（见 `tasks/backlog/gist-script-rollback.md`）
- Phase D match-based 单脚本模块加载（见 `runtime-modularization.md`）
