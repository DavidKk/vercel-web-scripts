# Current focus

## Objective

**开放** — 上一批 extension shell、OTA 策略、脚本权限、runtime Phase A–C 已归档。在此记录下一产品/技术需求。

## Active execution list

- `../tasks/active/current.md` — **空**（新需求从此开始）

## Recently landed (2026-06-27)

- **Extension native loader (E25–E27)** + **Runtime Phase D match-fallback** — `tasks/done/extension-native-loader.md`, `tasks/done/runtime-phase-d.md`
- **Runtime Phase A–C**: hash OTA、rollback、懒加载 optional 模块 — `tasks/done/runtime-modularization-phase-a-b-c.md`
- **Script permissions**: gate + Admin Permissions — `tasks/done/script-permissions.md`
- **OTA publish policy**: SERVER alpha/stable/lock — `tasks/done/ota-publish-policy.md`
- **Large file split** + **CSS logical properties** — `tasks/done/large-file-split.md`, `css-logical-properties-review.md`
- **preset-ui lazy load** fix — stale cache + runtime core host resolution
- **UI cross-module Phase A** — `shared/ui` scroll + tooltip；B/C/D defer 至触 UI 改动时

## Backlog (next candidates)

| 优先级 | 任务          | 文档                                     | 说明                   |
| ------ | ------------- | ---------------------------------------- | ---------------------- |
| 低     | UI 跨模块去重 | `tasks/backlog/ui-cross-module-dedup.md` | Phase A ✅；其余 defer |

## Confirmed decisions

- Launcher inject **only on `text/html`** documents
- Extension `GM_xmlhttpRequest` → background `fetch`；OTA 编排在 `extension/src/runtime/module-loader.ts`（page `page-host.ts` 仅执行）
- Multi-service: Service = connection; scriptKey = capability scope
- Extension 壳更新：计划 **Chrome Web Store** 上架；不做 ZIP File System 自更新（见 `tasks/done/extension-fs-update.md`）

## Notes

Update this file when a new requirement starts. Stable facts: `summary.md`, `specs/`.
