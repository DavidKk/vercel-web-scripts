# Extension Agent LLM Proxy Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional Gemini API Base URL proxy (off by default; settings expand when enabled).

**Architecture:** Extend `AgentLlmConfig` with `proxyEnabled` + `baseUrl`. Pure URL helpers resolve the Gemini root; background `agent-llm.ts` uses them for generate/list. Side panel toggle reveals Base URL field.

**Tech Stack:** Chrome MV3 extension, TypeScript, Jest.

**Spec:** `.ai/specs/extension-agent-llm-proxy.md`

---

## File map

| File                                                    | Role                                                |
| ------------------------------------------------------- | --------------------------------------------------- |
| `extension/src/shell/webmcp/agent-llm-gemini-url.ts`    | Create: normalize + resolve Gemini API root / paths |
| `extension/src/shell/webmcp/agent-types.ts`             | Add `proxyEnabled`, `baseUrl` defaults              |
| `extension/src/shell/webmcp/agent-llm.ts`               | Use URL helpers; listModels overrides for proxy     |
| `extension/src/shared/messages.ts`                      | `AGENT_LLM_LIST_MODELS` optional overrides          |
| `extension/src/shell/webmcp/webmcp-message-handlers.ts` | Pass overrides                                      |
| `extension/src/html/pages/sidepanel.ejs`                | Toggle + Base URL fields                            |
| `extension/src/ui/sidepanel/mm-sidepanel-app.ts`        | Wire toggle, save/validate, list models             |
| `__tests__/extension/agent-llm-gemini-url.spec.ts`      | Unit tests for URL helpers                          |

---

### Task 1: URL helpers + tests (TDD)

**Files:**

- Create: `extension/src/shell/webmcp/agent-llm-gemini-url.ts`
- Create: `__tests__/extension/agent-llm-gemini-url.spec.ts`

- [x] **Step 1:** Write failing tests for:
  - official root when `proxyEnabled: false` (even if baseUrl set)
  - custom root when enabled + valid https URL; trailing slash stripped
  - throw when enabled + empty/invalid URL
  - generate / list URL path builders with `?key=`

- [x] **Step 2:** Implement helpers to pass tests.

---

### Task 2: Config types + agent-llm wiring

**Files:**

- Modify: `agent-types.ts`, `agent-llm.ts`, `messages.ts`, `webmcp-message-handlers.ts`

- [x] Extend `AgentLlmConfig` + defaults.
- [x] `generateAgentLlmResponse` / `listAgentGeminiModels` use `resolveGeminiApiRoot`.
- [x] `listAgentGeminiModels(overrides?: { apiKey?; proxyEnabled?; baseUrl? })`.
- [x] Message + handler pass form overrides.

---

### Task 3: Side panel settings UI

**Files:**

- Modify: `sidepanel.ejs`, `mm-sidepanel-app.ts`

- [x] Checkbox “Use API proxy” (default unchecked); fields for Base URL in `hidden` container when off.
- [x] Toggle shows/hides fields; save validates when proxy on; load restores state.
- [x] List models sends current form proxy fields.

---

### Task 4: Verify

- [x] Run: `npx jest __tests__/extension/agent-llm-gemini-url.spec.ts --no-cache`
- [x] Update spec status to IMPLEMENTED in `extension-agent-llm-proxy.md`
