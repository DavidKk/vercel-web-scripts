---
name: scripts-api-mcp
description: Use when integrating AI or automation with MagickMonkey (Gist script CRUD via REST v1, MCP, or chat function calling). Read for auth headers, routes, and tool names.
---

# Scripts API / MCP / function calling

Project: **MagickMonkey**. Scripts live in a private **GitHub Gist**; integration APIs mirror editor-safe files only (`.ts`/`.js`, excluding generated entry and rules).

## Auth

- **Session**: admin login cookie (same as `/editor`).
- **API key**: env `SCRIPTS_API_KEY` on the server. Send `Authorization: Bearer …` or `x-api-key: …`. Do not put the key in skills, commits, or client-only bundles.

## REST

- OpenAPI: `/api/v1/openapi.json`
- CRUD base: `/api/v1/scripts` and `/api/v1/scripts/{filename}` (encode filename).

## MCP (HTTP)

- `/api/mcp` — **GET** manifest; **POST** JSON-RPC `initialize` / `tools/list` / `tools/call`, or legacy `{ tool, params }` (same shape as `/api/mcp` on the OpenAPI deployment).

## Human-readable skill copy

See `public/docs/scripts-ai-skill.md` in the repo (also served as static `/docs/scripts-ai-skill.md`).

## Chat “function” definitions

See `public/docs/scripts-function-tools.json` — map names to your HTTP client or host that calls the REST API with the same auth.
