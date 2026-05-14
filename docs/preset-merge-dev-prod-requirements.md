# Dev vs prod Tampermonkey launcher — requirements and impact

> Goal: install **one** userscript that picks dev or prod backend from the **current page’s host**, without switching scripts in the extension.

---

## 1. Current state (why there are “two scripts”)

### 1.1 Where the script comes from

- **Launcher**: user installs `/static/[key]/tampermonkey.user.js` (from `createLauncherScript`).
- **Dev / prod** are not two routes; they are the **same code, two deployments**:
  - **Dev**: e.g. local `pnpm dev` or Vercel Preview, `NODE_ENV=development` → launcher body is “dev”.
  - **Prod**: e.g. Vercel Production, `NODE_ENV=production` → launcher body is “prod”.

That yields two install URLs, e.g.:

- Dev: `http://localhost:3000/static/<key>/tampermonkey.user.js` or `https://preview-xxx.vercel.app/...`
- Prod: `https://your-domain.com/static/<key>/tampermonkey.user.js`

Installing both shows two entries in Tampermonkey (e.g. “Web Script (dev)” vs “Web Script”) and users toggle manually.

### 1.2 Dev vs prod differences (server-injected only)

| Field                 | Dev (`NODE_ENV=development`)           | Prod (`NODE_ENV=production`)   |
| --------------------- | -------------------------------------- | ------------------------------ |
| `@name`               | `Web Script (dev)`                     | `Web Script`                   |
| `__BASE_URL__`        | Request origin (e.g. `localhost:3000`) | Request origin (prod domain)   |
| `__IS_DEVELOP_MODE__` | `true`                                 | `false`                        |
| `__HOSTNAME_PORT__`   | Request host (e.g. `localhost:3000`)   | Request host                   |
| Preset behavior       | See below                              | GIST/remote only, no dev tools |

### 1.3 What “develop mode” does inside preset

`isDevelopMode()` = `__IS_DEVELOP_MODE__ && (window.location.host === __HOSTNAME_PORT__)`.

Extra behavior when true:

- **Editor dev mode**: other same-origin / allowlisted pages run editor-built code with hot reload.
- **Local dev mode**: run locally cached dev script.
- **Preset-built SSE**: subscribe to rebuild events on same origin; auto-refresh when preset changes.
- **Branching**: on editor route skip remote; elsewhere load remote and `watchHMRUpdates`, etc.

So **dev or not** is entirely from launcher-injected `__IS_DEVELOP_MODE__` / `__HOSTNAME_PORT__`; preset does not care which install URL was used.

---

## 2. Merge goals

- **Single install URL** (prefer prod URL as the canonical install).
- **Pick backend from current page**:
  - If `window.location.host` is in a **dev host** list (e.g. `localhost:3000`, `*.vercel.app`) → **dev** `baseUrl`, `__IS_DEVELOP_MODE__=true`, `__HOSTNAME_PORT__` = current host.
  - Else → **prod** `baseUrl`, `__IS_DEVELOP_MODE__=false`.
- **No script switching**: one script works on every page.

---

## 3. Design notes (no implementation detail)

### 3.1 Inputs for launcher generation

- **prodBaseUrl**: e.g. `https://your-domain.com`.
- **devBaseUrl**: e.g. `http://localhost:3000` or `https://preview-xxx.vercel.app`.
- **devHosts**: allowlist / patterns for “this page is dev”, e.g. `['localhost:3000', '127.0.0.1:3000']` or match `localhost`, `vercel.app`, etc.
- **key**: from `getTampermonkeyScriptKey()`; same Gist → same key; future split → `devKey` / `prodKey`.

Env examples:

- `NEXT_PUBLIC_PROD_BASE_URL`
- `NEXT_PUBLIC_DEV_BASE_URL`
- `NEXT_PUBLIC_DEV_HOSTS` (JSON array or comma-separated)

If dual-env is **not** configured, keep today’s behavior: one `baseUrl` + `NODE_ENV` for dev flag.

### 3.2 Runtime pseudo-code in launcher

```
pageHost = window.location.host
if (pageHost in devHosts) {
  baseUrl = devBaseUrl
  isDevelopMode = true
  hostnamePort = pageHost
} else {
  baseUrl = prodBaseUrl
  isDevelopMode = false
  hostnamePort = '' or prod host (isDevelopMode() false in preset)
}
presetUrl = baseUrl + '/static/preset.js'
remoteUrl = baseUrl + '/static/' + key + '/tampermonkey-remote.js'
inject ASSIGN_GLOBALS from baseUrl / isDevelopMode / hostnamePort, then loadAndRun()
```

Preset and remote always load from the **selected** `baseUrl`; preset code stays the same.

### 3.3 Cache and `@connect`

- **Preset / ETag in `GM_setValue`**: cache keys must be **per backend** (e.g. include `baseUrl` or `preset_cache_dev` / `preset_cache_prod`) so switching dev→prod tabs does not reuse dev ETag.
- **`@connect`**: declare every host the launcher may call (localhost + prod domain, etc.).

### 3.4 `@name` / `@namespace`

- Prefer single `@name`: `Web Script` (drop `(dev)`).
- `@namespace`: prod base URL or unchanged from today.

---

## 4. What changes vs stays the same

### 4.1 Must change

| Area                                                 | Change                                                                                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`services/tampermonkey/launcherScript.ts`**        | Accept prod/dev base URLs + devHosts; embed runtime host selection; `ASSIGN_GLOBALS` from computed values; preset/remote URLs and cache keys scoped to chosen `baseUrl`. |
| **`app/static/[key]/tampermonkey.user.js/route.ts`** | Pass new args into `createLauncherScript` from env. If dual-env off, pass single `baseUrl` + current `NODE_ENV` behavior.                                                |
| **Env / docs**                                       | Document `NEXT_PUBLIC_PROD_BASE_URL`, `NEXT_PUBLIC_DEV_BASE_URL`, `NEXT_PUBLIC_DEV_HOSTS`; update `.env.example` / README.                                               |

### 4.2 Unchanged

| Area                             | Reason                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| **Preset codebase**              | Still only reads injected globals; launcher chooses backend before inject.            |
| **`createBanner.ts`**            | Optional: still tied to `NODE_ENV` until you align inline banner with dual-env rules. |
| **`getTampermonkeyScriptKey()`** | Still from `GIST_ID`; split Gists later → `devKey`/`prodKey`.                         |
| **API / editor / Gist**          | Served per deployment host; only the **launcher** alternates which origin it calls.   |

### 4.3 Optional follow-ups

- **Inline `createBanner`**: same dual-URL runtime selection if single-file downloads should auto-switch.
- **Split keys**: launcher picks `devKey` vs `prodKey` per selected environment.

---

## 5. Risks and prerequisites

1. **Env visibility**: prod/dev URLs + devHosts must be available at **build or request** time (`NEXT_PUBLIC_*` or server env). Prod must never point at localhost by mistake.
2. **Tampermonkey updates**: bumping launcher content/`@version` + same `updateURL` is enough for users on the old single-env script.
3. **ETag / 304**: verify `loadAndRun` cache keys bind to selected `baseUrl`.
4. **`@connect`**: e.g. `@connect localhost` for local dev if needed.

---

## 6. Summary

- **Merge** = one launcher install that picks dev vs prod **by current host** and injects matching `__BASE_URL__` / `__IS_DEVELOP_MODE__` / `__HOSTNAME_PORT__`.
- **Preset and HTTP APIs** unchanged; work is launcher generation + URL/cache/`@connect`.
- **Prerequisite**: configurable prod URL, dev URL, and dev host rules; otherwise keep single-env + `NODE_ENV`.

If this matches “one script, no switching”, implement accordingly; if you need cookie/query toggles or two installs with one name only, adjust the design first.
