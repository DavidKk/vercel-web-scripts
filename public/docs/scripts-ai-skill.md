# Vercel Web Scripts — AI / integration skill

Use this when you should **read or change user script files** stored in the project’s GitHub Gist **without opening the web editor**.

## Authentication

- **Browser session**: same cookie as the admin UI after login.
- **Automation / MCP / API clients**: set env `SCRIPTS_API_KEY` on the deployment, then send:
  - `Authorization: Bearer <SCRIPTS_API_KEY>`, or
  - `x-api-key: <SCRIPTS_API_KEY>`

Never commit the API key or paste it into user-visible pages.

## REST (OpenAPI)

- Spec: `GET /api/v1/openapi.json` (authenticated).
- List files: `GET /api/v1/scripts`
- Read file: `GET /api/v1/scripts/{filename}` (URL-encode `filename`)
- Write file: `PUT /api/v1/scripts/{filename}` with JSON `{ "content": "..." }`
- Delete file: `DELETE /api/v1/scripts/{filename}`

Only `.ts` / `.js` files that are **not** the generated entry or rules JSON can be mutated.

## MCP (HTTP)

- Manifest: `GET /api/mcp/scripts/manifest`
- Execute: `POST /api/mcp/scripts/execute` with JSON-RPC 2.0 (`tools/list`, `tools/call`) or legacy `{ "tool": "scripts_list", "params": {} }`.

Tools: `scripts_list`, `scripts_get`, `scripts_upsert`, `scripts_delete`.

## Workflow

1. `scripts_list` (or `GET /api/v1/scripts`) to see names.
2. `scripts_get` / GET to read.
3. `scripts_upsert` / PUT to apply edits; then user can publish from UI or rely on Gist sync as configured.
