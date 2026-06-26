# Runtime modularization — Phase A/B/C — task thread

Status: **DONE** (2026-06-27)

Source: `../../specs/runtime-modularization.md`  
原文件: `tasks/active/current.md`（归档）

---

## Phase A — Contract and docs ✅

全部 DONE（manifest、cache lifecycle、Core Registry、verification checklist）。

---

## Phase B — Runtime split foundation ✅

| 项                         | 状态 | 落地                                                 |
| -------------------------- | ---- | ---------------------------------------------------- |
| B1 显式模块产物            | DONE | preset-core / preset-ui / editor-lib / script-bundle |
| B2 Launcher → Preset Core  | DONE | Extension + TM 默认路径                              |
| B3 可选 UI 懒加载          | DONE | `optional-ui.ts`、`editor-lib.ts`                    |
| B4 可选模块失败不阻断 core | DONE | `ensureOptionalUi` 错误隔离                          |
| B5 模块加载 telemetry      | DONE | `[ModuleLoad][*]` 日志                               |

---

## Phase C — Update hardening ✅

| 项                  | 状态 | 落地                                                                           |
| ------------------- | ---- | ------------------------------------------------------------------------------ |
| C1 按模块 hash 比对 | DONE | manifest etag、`PRESET_ACTIVATED_HASH`、optional-ui `isStaticModuleCacheStale` |
| C2 原子切换指针     | DONE | `PRESET_ACTIVATED_HASH_KEY` + scoped keys                                      |
| C3 回滚             | DONE | `PRESET_PREVIOUS_HASH` + launcher-runtime / launcherScript rollback            |
| C4 损坏/不完整下载  | DONE | `isLikelyPresetUiBundle`、HTTP 错误回滚、invalid bundle toast                  |
| C5 避免重复下载     | DONE | 304 / If-None-Match、hash 未变跳过                                             |

**遗留（非阻断）**：`services/runtime/cacheLifecycle.ts` 通用 `buildRuntimeModuleCacheKeys` 尚未全面替换 legacy key 名；行为已满足 FR-03。

---

## Milestones

| ID  | 条件                  | Status                                     |
| --- | --------------------- | ------------------------------------------ |
| M1  | Phase A docs          | DONE                                       |
| M2  | Phase B split         | DONE                                       |
| M3  | Phase C hash/rollback | DONE                                       |
| M4  | Phase D match-load    | **TODO** → `../backlog/runtime-phase-d.md` |

---

## Phase D

见 `../backlog/runtime-phase-d.md`（未启动）。
