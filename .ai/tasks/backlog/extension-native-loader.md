# Extension 原生 loader — task thread

Status: **TODO**（待排期；E25–E27 本体未实现）

**实施记录（2026-06-27 同步）**：前置能力已就绪（shell、GM_XHR→background、多 scriptKey `page/index.ts`、UPDATE/RESET 清缓存）。**OTA 编排仍在** `extension/src/page/launcher-runtime.ts`（~778 行）；`extension/src/runtime/module-loader.ts` **不存在**。

关联: `extension/TODO.md` E25–E27、`extension/README.md`

---

## Objective

将 OTA **编排**从 page-world 的 `launcher-runtime.ts`（TM launcher 逻辑移植）迁到 **background service worker**；page 只负责执行 preset 文本 + `GM_*` 兼容。

**注意**：Extension 的 `GM_xmlhttpRequest` 已通过 content bridge 在 **background `fetch`**，缓存已在 `chrome.storage`（经 GM bridge）。本任务主要是**编排层**去 TM 化，而非重做网络栈。

---

## 目标架构

```text
background/module-loader.ts   manifest → hash → cache → 通知 content
content-bridge                注入薄 page-host
page-host                     执行 preset + gm-bridge（无自拉 manifest）
```

---

## 任务

| ID  | 内容                                             | 验收                                         |
| --- | ------------------------------------------------ | -------------------------------------------- |
| E25 | `runtime/module-loader.ts` — background OTA 编排 | manifest/preset/remote cache-first 在 SW     |
| E26 | content ↔ background 消息协议                    | page 不再 `startLauncher` 内 fetch           |
| E27 | 退役 `launcher-runtime.ts` TM 移植代码           | `page-launcher.js` 变薄或改名 `page-host.js` |

---

## 不在范围

- Tampermonkey `launcherScript.ts` 路径
- 变更服务端 OTA URL / cache key 契约（`shared/launcher-constants.ts`）

---

## 风险

| 风险                     | 缓解                                       |
| ------------------------ | ------------------------------------------ |
| 多 scriptKey 启动顺序    | 与现 `page/index.ts` 行为对齐，单测 + 手测 |
| CSP user-script 执行路径 | 保留 `preset-executor.ts` resilient 路径   |
