# Extension injection policy

## Current behavior (implemented)

Page-world launcher injection (`page-launcher.js` + bootstrap template) runs **only when all** of the following hold:

1. Top-level frame (`all_frames: false` in manifest)
2. URL is `http://` or `https://`
3. **`document.contentType` is `text/html`** (from response `Content-Type`)
4. Shell master switch enabled for the tab
5. At least one enabled `scriptKey` / bootstrap config exists

Gate implementation: `extension/src/bridge/injection-gate.ts` (`isHtmlDocumentForInjection`).

Called from: `extension/src/bridge/page-bootstrap.ts` **before** async bootstrap work.

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
