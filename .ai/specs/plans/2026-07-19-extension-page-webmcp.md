# 扩展内置 `vws.page.*` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在满足注入门槛的 Tab 上自动注册 `vws.page.*` WebMCP 工具，底层用 `@page-agent/page-controller`，复用现有 Side Panel Agent。

**Architecture:** Background gate → `executeRawMainWorldCodeForTab` 注入 page-tools IIFE → `registerVwsWebMcpTool` ×6 → 现有 LIST/EXECUTE 代理；无 PageAgent UI/LLM。

**Tech Stack:** Chrome MV3 extension, Vite IIFE, `@page-agent/page-controller`, `shared/webmcp`, Jest.

**Spec:** `.ai/specs/extension-page-webmcp.md` · `.ai/tasks/backlog/extension-page-webmcp.md`

## Global Constraints

- No Playwright / CDP / PageAgent UI.
- `enableMask: false`; no Cookie / localStorage / sessionStorage / eval tools.
- Reserved `scriptKey = page`; hook in `webmcp-tab-proxy.ts`.
- Gate: shell on + User Scripts + `getMergedTabMatchCount(url) > 0`.

---

### Task 1: 保留字 + Gate 纯函数

**Files:**

- Modify: `shared/webmcp/constants.ts`
- Modify: `shared/webmcp/register-tool.ts`
- Modify: `shared/webmcp/types.ts`（若需 `invalid_script_key` reason）
- Create: `extension/src/shell/webmcp/page-tools/page-tools-gate.ts`
- Test: `__tests__/shared/webmcp-register.spec.ts`（或新 spec）
- Test: `__tests__/extension/page-tools-gate.spec.ts`

**Interfaces:**

- Produces: `VWS_WEBMCP_PAGE_SCRIPT_KEY = 'page'`
- Produces: `shouldRegisterPageTools(ctx): boolean` / `PageToolsGateContext`

- [ ] Add constant + reject `scriptKey === 'page'` in `registerVwsWebMcpTool`
- [ ] Implement gate combining shell / http / userScripts / matchCount
- [ ] Unit tests pass

---

### Task 2: 依赖 + page-controller adapter（MAIN 逻辑，可单测部分）

**Files:**

- Modify: `package.json` / lockfile — `pnpm add @page-agent/page-controller`
- Create: `extension/src/shell/webmcp/page-tools/page-controller-adapter.ts`
- Create: `extension/src/shell/webmcp/page-tools/page-tools-definitions.ts`
- Test: `__tests__/extension/page-controller-adapter.spec.ts`（jsdom 或 mock document）

**Interfaces:**

- Produces: `createPageControllerAdapter()` with `snapshot` / `outline` / `pageMeta` / `click` / `fill` / `scroll` + truncation constants

- [ ] Install dependency
- [ ] Adapter with truncation + index errors; no storage APIs
- [ ] Tests for truncate + index_out_of_range

---

### Task 3: MAIN IIFE 注册入口 + Vite entry

**Files:**

- Create: `extension/src/shell/webmcp/page-tools/page-tools-main.ts`（IIFE：ensure 注册六工具）
- Modify: `extension/vite.config.ts` — entry `page-tools-main`
- Create: build helper to expose bundle text to background（或 runtime fetch `chrome.runtime.getURL`）

**Interfaces:**

- Produces: idempotent `ensureVwsPageTools()` in MAIN; registry `scriptFile: '__builtin__/page-tools'`

- [ ] Bundle builds as IIFE
- [ ] Prefer `chrome.runtime.getURL('page-tools-main.js')` + userScripts file inject if supported; else embed string at build time
- [ ] Smoke: ensure registers `vws.page.snapshot`

---

### Task 4: 钩入 `webMcpListTools` / `webMcpExecuteTool`

**Files:**

- Modify: `extension/src/shell/webmcp/webmcp-tab-proxy.ts`
- Create: `extension/src/shell/webmcp/page-tools/page-tools-ensure.ts`（background：gate + inject）
- Test: `__tests__/extension/webmcp-tab-proxy.spec.ts`（扩展 mock ensure）

- [ ] LIST 前 ensure；EXECUTE `vws.page.*` 前 ensure
- [ ] Gate false → skip ensure，行为与今日一致
- [ ] Tests updated

---

### Task 5: Agent prompt + NOTICE + 状态收尾

**Files:**

- Modify: Side Panel system prompt builder（定位现有文件）
- Create/Modify: `extension/NOTICE` or README 致谢
- Mark backlog/spec status notes if needed

- [ ] Prompt 指引 snapshot / 业务工具优先 / 无 storage
- [ ] License attribution
- [ ] `pnpm test` 相关套件绿

---

## Self-review

- Spec P0 六工具 → Tasks 2–4
- Gate / 保留字 → Task 1
- 注入 API 名与 spec §3.1 一致
- 无 Playwright scope creep
