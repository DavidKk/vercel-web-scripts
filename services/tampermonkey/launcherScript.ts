/**
 * Launcher script generator for Tampermonkey.
 * Produces a minimal .user.js that loads preset from URL, caches it, and runs it
 * with __SCRIPT_URL__ pointing to the remote script. Preset and remote can be
 * updated without reinstalling the launcher.
 */

import { buildPresetGlobalAssignments } from './gmCore'
import { GRANTS } from './grant'

/** GM_setValue key for cached preset script content */
export const PRESET_CACHE_KEY = 'vws_preset_cache'
/** GM_setValue key for preset update push: set to any value to trigger launcher reload (e.g. dev server or helper page) */
export const PRESET_UPDATE_CHANNEL_KEY = 'vws_preset_update'
/** GM_setValue key: set before reload so preset shows "Preset updated" notification after reload (must match preset main.ts) */
export const PRESET_UPDATED_NOTIFY_KEY = 'vws_preset_updated_notify'

export interface CreateLauncherScriptParams {
  /** Base URL (origin + path to app, e.g. https://example.com) */
  baseUrl: string
  /** Script key (same as getTampermonkeyScriptKey()) for remote script URL */
  key: string
  /** Launcher script download URL (for @downloadURL / @updateURL) */
  launcherScriptUrl: string
  /** Project version for @version in launcher header only (e.g. from package.json); preset has its own build-time version. */
  version?: string
}

/**
 * Create the launcher userscript content.
 * Launcher: fetches preset from PRESET_URL, caches with GM_setValue,
 * injects variable declarations (with __SCRIPT_URL__ = remote URL), evals preset.
 * Provides "Update preset" menu and listens for preset update channel (dev push).
 */
export function createLauncherScript(params: CreateLauncherScriptParams): string {
  const { baseUrl, key, launcherScriptUrl, version = '1.0.0' } = params
  const presetUrl = `${baseUrl}/static/preset.js`
  const remoteScriptUrl = `${baseUrl}/static/${key}/tampermonkey-remote.js`

  const uri = new URL(launcherScriptUrl)
  const { protocol, hostname, port } = uri
  const __BASE_URL__ = `${protocol}//${hostname}${port ? ':' + port : ''}`
  const __HMK_URL__ = `${protocol === 'https:' ? 'wss:' : 'ws:'}//${hostname}${port ? ':' + port : ''}/_next/webpack-hmr`
  const __RULE_API_URL__ = `${__BASE_URL__}/api/tampermonkey/${key}/rule`
  const __RULE_MANAGER_URL__ = `${__BASE_URL__}/tampermonkey/rule`
  const __EDITOR_URL__ = `${__BASE_URL__}/editor`
  const isDevelopMode = process.env.NODE_ENV === 'development'
  const hostnamePort = `${hostname}${port ? ':' + port : ''}`

  const globalAssignments = buildPresetGlobalAssignments({
    __BASE_URL__,
    __RULE_API_URL__,
    __RULE_MANAGER_URL__,
    __EDITOR_URL__,
    __HMK_URL__,
    __SCRIPT_URL__: remoteScriptUrl,
    __IS_DEVELOP_MODE__: isDevelopMode,
    __HOSTNAME_PORT__: hostnamePort,
    __GRANTS_STRING__: GRANTS_STRING,
  })

  // Escape for embedding inside a JS string (backticks in template literal)
  const globalAssignmentsEscaped = globalAssignments.trim().replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')

  // Preset expects __BASE_URL__, __IS_DEVELOP_MODE__, etc. as bare identifiers. Run preset in runPreset scope
  // and declare these from g so preset sees them; GM_* come from launcher closure.
  const PRESET_VAR_NAMES = [
    '__BASE_URL__',
    '__RULE_API_URL__',
    '__RULE_MANAGER_URL__',
    '__EDITOR_URL__',
    '__HMK_URL__',
    '__SCRIPT_URL__',
    '__IS_DEVELOP_MODE__',
    '__HOSTNAME_PORT__',
    '__GRANTS_STRING__',
  ]
  // Inject __GLOBAL__ = g so preset and remote script use the same global (launcher's g / sandbox), not a different globalThis
  const presetVarDecls = 'var __GLOBAL__ = g; ' + PRESET_VAR_NAMES.map((n) => `var ${n} = g.${n};`).join(' ')
  const presetVarDeclsEscaped = presetVarDecls.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')

  const grants = GRANTS.filter((g) => g !== 'none')
  const grantLines = grants.map((g) => `// @grant        ${g}`).join('\n')

  return `// ==UserScript==
// @name         Web Script${isDevelopMode ? ' (dev)' : ''}
// @namespace    ${__BASE_URL__}
// @version      ${version}
// @description  Entry script: loads preset and remote script; update without reinstall
// @author       Vercel Web Script
// @match        */*
// @noframes
// @connect      ${uri.hostname}
// @run-at       document-start
${grantLines}
// ==/UserScript==

(function () {
  const PRESET_URL = ${JSON.stringify(presetUrl)};
  const ASSIGN_GLOBALS = \`${globalAssignmentsEscaped}\`;
  const PRESET_VAR_DECLS = \`${presetVarDeclsEscaped}\`;

  function runPreset(presetCode) {
    const g = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {};
    const grantNames = ${JSON.stringify(grants)};
    grantNames.forEach(function (n) { try { var v = eval(n); if (v !== undefined) g[n] = v; } catch (e) {} });
    try {
      eval(ASSIGN_GLOBALS);
      eval(PRESET_VAR_DECLS + '\\n' + presetCode);
    } catch (e) {
      console.error('[Launcher] preset run failed:', e && e.message ? e.message : String(e), e);
    }
  }

  function loadAndRun() {
    let presetCode = typeof GM_getValue === 'function' ? GM_getValue(${JSON.stringify(PRESET_CACHE_KEY)}, '') : '';
    if (presetCode) {
      runPreset(presetCode);
      return;
    }

    var presetUrlWithCacheBust = PRESET_URL + (PRESET_URL.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
    GM_xmlhttpRequest({
      method: 'GET',
      url: presetUrlWithCacheBust,
      onload: function (res) {
        if (res.status === 200 && res.responseText) {
          if (typeof GM_setValue === 'function') {
            GM_setValue(${JSON.stringify(PRESET_CACHE_KEY)}, res.responseText);
          }

          runPreset(res.responseText);
        } else {
          console.error('[Launcher] failed to fetch preset, status:', res.status);
        }
      },
      onerror: function () {
        console.error('[Launcher] failed to fetch preset (network error)');
      },
    });
  }

  GM_registerMenuCommand('Update preset', function () {
    if (typeof GM_deleteValue === 'function') {
      GM_deleteValue(${JSON.stringify(PRESET_CACHE_KEY)});
    } else if (typeof GM_setValue === 'function') {
      GM_setValue(${JSON.stringify(PRESET_CACHE_KEY)}, '');
    }
    console.log('[Launcher] Preset cache cleared. Reloading...');
    setTimeout(function () { location.reload(); }, 500);
  });

  GM_addValueChangeListener(${JSON.stringify(PRESET_UPDATE_CHANNEL_KEY)}, function (name, oldVal, newVal) {
    if (newVal == null) return;
    if (typeof GM_deleteValue === 'function') {
      GM_deleteValue(${JSON.stringify(PRESET_CACHE_KEY)});
    }
    function isTabActive() {
      if (typeof document === 'undefined') {
        return false;
      }

      if (document.hidden !== false) {
        return false;
      }

      if (typeof document.visibilityState !== 'undefined' && document.visibilityState !== 'visible') {
        return false;
      }

      return true;
    }
    if (isTabActive()) {
      if (typeof GM_setValue === 'function') {
        GM_setValue(${JSON.stringify(PRESET_UPDATED_NOTIFY_KEY)}, 1);
      }
      setTimeout(function () {
        if (typeof document !== 'undefined' && !document.hidden && (typeof document.visibilityState === 'undefined' || document.visibilityState === 'visible')) {
          location.reload();
        }
      }, 300);
    }
  });

  loadAndRun();
})();
`
}

const GRANTS_STRING = GRANTS.map((g) => `...(typeof ${g} !== 'undefined' ? { ${g} } : {})`).join(', ')
