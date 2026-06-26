# Extension 原生 loader — task thread

Status: **DONE**（2026-06-27）

关联: `extension/TODO.md` E25–E27、`extension/README.md`、`extension/src/runtime/module-loader.ts`

---

## Objective

将 OTA **编排**从 page-world 的 `launcher-runtime.ts`（TM launcher 逻辑移植）迁到 **background service worker**；page 只负责执行 preset 文本 + `GM_*` 兼容。

---

## 交付

| ID  | 内容                                             | 状态 |
| --- | ------------------------------------------------ | ---- |
| E25 | `runtime/module-loader.ts` — background OTA 编排 | DONE |
| E26 | content ↔ background `RUNTIME_*` 消息协议        | DONE |
| E27 | 退役 `launcher-runtime.ts`                       | DONE |

**实现要点**：

- `extension/src/runtime/module-loader.ts` — manifest/preset 拉取、cache-first、scoped `chrome.storage`
- `extension/src/page/page-host.ts` — 仅 GM + preset 执行（无 manifest fetch）
- `RUNTIME_ENSURE_LOAD` / `RUNTIME_PRESET_READY` / `RUNTIME_LOAD_FAILED`
- 被动 OTA：`PRESET_UPDATE_CHANNEL` 监听迁至 background `storage.onChanged`

---

## 不在范围（仍适用）

- Tampermonkey `launcherScript.ts` 路径
- 变更既有 `shared/launcher-constants.ts` cache key 契约
