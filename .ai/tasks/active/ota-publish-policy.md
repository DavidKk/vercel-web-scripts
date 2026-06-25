# OTA 发布策略（SERVER 权威）— task thread

Status: **TODO**（方案已评审；spec 已定稿）

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

- [ ] A1. 扩展 `ScriptFileMeta.ota` 与 index 顶层 `runtime`（types + parse/stringify + 默认值）
- [ ] A2. `shared/managed-script-files.ts`：`RELEASES_PREFIX` / 快照路径辅助；`releases/*` 排除出 managed 枚举
- [ ] A3. Web Editor：保存为调试 / 发布 stable / 锁定版本 / 解除锁定
- [ ] A4. promote：写 `releases/{file}@{version}` 快照
- [ ] A5. `buildRemoteScriptBundleFromGist`：stable 与 alpha 双产物 + 锁定版本取快照
- [ ] A6. 新增路由 `tampermonkey-remote.alpha.js`（或等价静态段）
- [ ] A7. `buildRuntimeModuleManifest`：`script-bundle-alpha` 模块 + `runtime` / `scriptPolicies` sidecar
- [ ] A8. API / MCP / OpenAPI 暴露 `ota` 与 publish 动作
- [ ] A9. 历史脚本迁移：无 `ota` → `stable` + `autoUpgrade=true`

## Phase B — 客户端 OTA 门控

- [ ] B1. 策略决策函数（共享 `shared/ota-policy.ts` 或等价）
- [ ] B2. Extension `launcher-runtime.ts`：manifest 拉取后策略门控
- [ ] B3. Tampermonkey `launcherScript.ts`：同上（仅 stable 默认）
- [ ] B4. preset-core：尊重 `runtime.ota`（autoUpgrade / lockedVersion / stage）
- [ ] B5. 聚合 bundle per-file 缓存与合并执行（spec §7.1）
- [ ] B6. Popup Update：手动升级绕过 `autoUpgrade`；alpha 需 acceptAlpha 或确认
- [ ] B7. 扩展 `shared/semver-compare.ts` 支持 prerelease

## Phase C — Extension UI 与存储

- [ ] C1. `acceptAlpha` 存储（per scriptKey；scope 与 `vws_script_enabled` 对齐）
- [ ] C2. Scripts 页：展示 SERVER `ota`（只读）+ acceptAlpha 开关
- [ ] C3. 脚本列表缓存 / `GET_STATUS` 下发 `ota` 与 contentHash
- [ ] C4. Popup / footer 可选展示 runtime `projectVersion` + stage

## Phase D — 验证与文档

- [ ] D1. 单元测试：双 bundle 构建、锁定快照解析、策略决策矩阵
- [ ] D2. 集成：alpha 改动 stable hash 不变；acceptAlpha 拉 alpha bundle
- [ ] D3. 更新 `runtime-verification-checklist.md` 相关条目
- [ ] D4. 更新 `public/docs/scripts-ai-skill.md`（MCP publish / ota 字段）

---

## 验收（与 spec §14 对齐）

- [ ] alpha 修改不触发 stable 客户端 script-bundle 升级
- [ ] `autoUpgrade=false` 阻止自动应用；手动 Update 可用
- [ ] `lockedVersion` + releases 快照生效
- [ ] 发布 stable 全流程（快照 + index + manifest）
- [ ] TM + Extension 行为一致（stable 默认）

---

## 依赖与顺序

```text
A1–A2 → A5–A7（构建）→ B1–B5（客户端）→ C*（UI）→ D*
A3–A4 可与 A5 并行（Editor + 快照）
```

**建议**：Phase A 完成后再动 Launcher；与 `tasks/active/current.md` Phase C（hash rollback）可并行，但 B5 per-file 缓存与 C2/C3 有交集。

---

## 不在本任务范围

- 多 Gist / 独立 alpha 部署域名
- 部署环境变量 `RELEASE_STAGE`
- Gist revision 历史 UI（见 `tasks/backlog/gist-script-rollback.md`）
- Phase D match-based 单脚本模块加载（见 `runtime-modularization.md`）
