# Extension injection policy

## Current behavior (implemented)

Page-world launcher injection (`page-launcher.js` + bootstrap template) runs **only when all** of the following hold:

1. Top-level frame (`all_frames: false` in manifest)
2. URL is `http://` or `https://`
3. **`document.contentType` is `text/html`** (from response `Content-Type`)
4. Shell master switch enabled for the tab (not in session “This tab only” disable list)
5. At least one enabled `scriptKey` / bootstrap config exists

Gate implementation: `extension/src/bridge/injection-gate.ts` (`isHtmlDocumentForInjection`).

Called from: `extension/src/bridge/page-bootstrap.ts` **before** async bootstrap work.

## Cloudflare `__cf_chl_rt_tk` (same as “This tab only”)

When the page URL carries `__cf_chl_rt_tk`, MagickMonkey calls `disableShellForTab` — the **same session disable list** as popup power → “This tab only”.

**Timing (critical):** session write alone during content-script bootstrap is too late (async race). Disabled tabs that work via the popup were already in the disable list **before** the document loaded. Therefore:

1. `webNavigation.onBeforeNavigate` — write disable as early as possible (before content script)
2. `content.ts` — **synchronous** `location.href` check at entry; if CF token present, exit immediately (no bridge / PRESET / CSP path); only fire-and-forget sync for badge state
3. `page-bootstrap` / `TAB_PAGE_LOAD` / `onCommitted` — backup sync + clear auto-disable when the param is gone

When the challenge param disappears, only **auto**-disabled tabs are removed from that list (manual “This tab only” stays).

## Non-HTML documents (no launcher inject)

Includes but not limited to:

- `application/json`
- `image/*` (PNG, JPEG, GIF, WebP, **SVG** as `image/svg+xml`)
- `video/*`, `audio/*`
- `application/javascript`, `text/javascript`
- `text/plain`, `application/pdf`, `application/xml`

Preset `main()` also skips non-HTML via `shouldSkipNonHtmlDocument()` in `preset/src/helpers/dom.ts`; the extension gate prevents DOM/script injection earlier.

## What still runs on non-HTML http(s) pages

- `content-bridge.js` loads (manifest `<all_urls>`)
- Passive bridge listeners (no page-world GM unless injected)
- `TAB_PAGE_LOAD` notification to background (badge lifecycle)

## Future: static asset module (not implemented)

A **separate module** may handle static resource rewrite / inject / transform (JSON, SVG, media, etc.).

Do **not** use the HTML launcher path for that work. Document new module in `extension-shell.yaml` when added.

## Related docs

- `extension-shell.yaml` — shell module map
- `extension/README.md` — admin Logs tab, debug panels
- `extension/docs/multi-service-tasks.md` — T6.10 MVP inject-all-HTML; match rules handled in preset
