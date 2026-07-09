---
name: scripts-api-mcp
description: Use when integrating AI or automation with MagickMonkey (Gist script CRUD via REST v1, MCP, or chat function calling). Read for auth headers, routes, and tool names.
---

# Scripts API / MCP / function calling

Project: **MagickMonkey**. Scripts live in a private **GitHub Gist**; integration APIs mirror editor-safe files only (`.ts`/`.js`, excluding generated entry and rules).

## Auth

- **Session**: admin login cookie (same as `/editor`).
- **API key**: configure env `SCRIPTS_MCP_HEADERS` (JSON string) on the server, and send `x-api-key: …`. Do not put keys in skills, commits, or client-only bundles.

## REST

- OpenAPI: `/api/v1/openapi.json`
- CRUD base: `/api/v1/scripts` and `/api/v1/scripts/{filename}` (encode filename).

## MCP (HTTP)

- `/api/mcp` — **GET** manifest; **POST** JSON-RPC `initialize` / `tools/list` / `tools/call`, or legacy `{ tool, params }` (same shape as `/api/mcp` on the OpenAPI deployment).
- Tools: `scripts_runtime_summary`, `scripts_list`, `scripts_get`, `scripts_upsert`, `scripts_rename`, `scripts_delete`, `scripts_find`, `scripts_search`, `scripts_snippet`, `scripts_replace`, `scripts_patch`, `scripts_batch_patch`, `scripts_validate`, `scripts_index_rebuild`, `scripts_index_update_metadata`, `scripts_ota_publish_stable`, `scripts_ota_lock_version`, `scripts_ota_unlock_version`.
- Recommended generation flow: call `scripts_runtime_summary` first, then `scripts_find` / `scripts_list` / `scripts_get`, prefer `scripts_search` / `scripts_snippet` / `scripts_patch` for token-efficient edits, and use `scripts_upsert` only for large rewrites.
- MCP **resources** (markdown skills): `skill://magickmonkey/scripts-routing.md`, `scripts-ai-skill.md`, `scripts-ui-skill.md`, **`gme-webmcp-skill.md`** (page WebMCP authoring — see below).

## Three integration paths (do not confuse)

| Path                                     | Where it runs         | Use for                                              |
| ---------------------------------------- | --------------------- | ---------------------------------------------------- |
| **HTTP MCP** `/api/mcp`                  | Server (Cursor, etc.) | Gist CRUD via `scripts_*` tools                      |
| **Page WebMCP** `GME_registerWebMcpTool` | Browser tab (preset)  | Register page actions as `vws.{scriptKey}.{name}`    |
| **Extension WebMCP Agent** (backlog)     | Chrome side panel     | Natural language → call tools on the **current tab** |

HTTP MCP **cannot** control the user's open browser tab (e.g. toggle danmaku, fullscreen). That requires page WebMCP tools registered by Gist scripts (`GME_registerWebMcpTool`) and (when shipped) the MagickMonkey extension Agent as caller.

## Page WebMCP (`GME_registerWebMcpTool`)

- **Implemented** in preset (`shared/webmcp/`, `preset/src/helpers/webmcp.ts`).
- Authors register tools in Gist userscripts; canonical name `vws.{scriptKey}.{localName}`; provider `magickmonkey`.
- Registry contract: `globalThis.__VWS_WEBMCP_TOOL_REGISTRY__`.
- Requires Chrome WebMCP flag (`chrome://flags/#enable-webmcp-testing`) and extension shell with `__VWS_SCRIPT_KEY__` for full behavior.
- **Not** an HTTP MCP tool — do not add `scripts_*` calls for tab control.

Author docs: `public/docs/gme-webmcp-skill.md` (static `/docs/gme-webmcp-skill.md`, MCP resource `skill://magickmonkey/gme-webmcp-skill.md`). Spec: `.ai/specs/preset-gme-webmcp.md`. Downstream consumer: `.ai/tasks/backlog/extension-webmcp-agent.md`.

## Maintenance note

If the preset adds/modifies any `GM_*` / `GME_*` interfaces, you must keep docs and the runtime summary tool in sync:

- Update `public/docs/scripts-ai-skill.md` capability summary table (and WebMCP section when `GME_registerWebMcpTool` changes).
- Update `services/scripts/scriptMcpTools.ts` output of `scripts_runtime_summary`.
- When adding overlay UI in Gist scripts, sync with `public/docs/scripts-ui-skill.md` and MCP resource `skill://magickmonkey/scripts-ui-skill.md`.
- When changing page WebMCP authoring, sync `public/docs/gme-webmcp-skill.md`, MCP resource `skill://magickmonkey/gme-webmcp-skill.md`, and `.ai/specs/preset-gme-webmcp.md`.

## Human-readable skill copy

See `public/docs/scripts-ai-skill.md` in the repo (also served as static `/docs/scripts-ai-skill.md`). That file includes **Runtime (preset) vs Gist** and a **capability summary** (`GM_*` / `GME_*`); use it when generating or editing scripts so you do not need the full typings in context. For exact signatures, read `preset/src/editor-typings.d.ts` in the repo.

**Overlay UI** (Gist modals/panels): read `public/docs/scripts-ui-skill.md` or MCP `resources/read` → `skill://magickmonkey/scripts-ui-skill.md`. Align with **preset** `vws-ui-tokens.css` (command palette, notification, log viewer) — not light VS Code or WEB-only hex.

**Page WebMCP** (tab tools for extension Agent): read `public/docs/gme-webmcp-skill.md` or MCP `resources/read` → `skill://magickmonkey/gme-webmcp-skill.md`. Not HTTP MCP — authors use `GME_registerWebMcpTool` in Gist scripts.

## Chat “function” definitions

See `public/docs/scripts-function-tools.json` — map names to your HTTP client or host that calls the REST API with the same auth.
