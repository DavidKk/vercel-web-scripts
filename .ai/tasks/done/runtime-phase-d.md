# Runtime Phase D — match-fallback 脚本模块加载 — task thread

Status: **DONE**（2026-06-27）

关联: `../../specs/runtime-modularization.md` §Phase D、`extension-native-loader.md`（同里程碑合并交付）

---

## Objective

从聚合 `tampermonkey-remote.js` 演进到 **match-fallback**：manifest 可开 per-file 模块加载；无匹配或拉取失败时回退整包 aggregate。

---

## 交付

| ID  | 内容                                                                   | 状态 |
| --- | ---------------------------------------------------------------------- | ---- |
| D2  | manifest `scriptModules[]` + `runtime.scriptLoadMode` + 单脚本静态路由 | DONE |
| D3  | preset `script-execution` match-fallback 分支                          | DONE |
| D4  | `dependsOn` 拓扑排序（依赖自动纳入匹配集）                             | DONE |
| D5  | 默认 `scriptLoadMode=aggregate`；SERVER 显式开 `match-fallback` 后生效 | DONE |

**实现要点**：

- `shared/runtime-script-modules.ts`、`shared/url-pattern-match.ts`
- `services/runtime/moduleManifest.ts` — `scriptModules` catalog
- `app/static/[key]/.../scripts/[file]/route.ts`（stable/alpha × hash/非 hash）
- background loader 写入 `RUNTIME_SCRIPT_LOAD_MODE_KEY` + `RUNTIME_SCRIPT_MODULES_KEY`
- `preset/src/services/script-execution.ts` — `tryExecuteMatchFallbackModules()`

---

## TM 与 Extension 差异

| 路径             | 行为                                                   |
| ---------------- | ------------------------------------------------------ |
| **Extension**    | 支持 `scriptLoadMode=match-fallback`（默认 aggregate） |
| **Tampermonkey** | 仍整包 `tampermonkey-remote.js`（等价 aggregate）      |

---

## 验收

- [x] `aggregate` 默认零行为变化
- [x] `match-fallback` + 有匹配：只拉匹配模块 URL
- [x] 无匹配或单模块 fetch 失败：回退整包
- [x] `dependsOn` 拓扑序正确
- [x] TM 路径文档化差异
