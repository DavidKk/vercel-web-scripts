/**
 * Launcher script generator for Tampermonkey.
 * Produces a minimal .user.js that loads preset from URL, caches it, and runs it
 * with __SCRIPT_URL__ pointing to the remote script. Preset and remote can be
 * updated without reinstalling the launcher.
 *
 * Boot logging: `bootLog` mirrors important lines to `globalThis.__VWS_BOOT_LOG__` (ring buffer);
 * preset `log-store` flushes them on load so the in-app log viewer stays contiguous with launcher output.
 */

import { PENDING_SEGMENT } from '@/services/runtime/contentAddressedAssets'

import { buildPresetGlobalAssignments, PRESET_VAR_NAMES } from './gmCore'
import { GRANTS } from './grant'

/** GM_setValue key for cached preset script content */
export const PRESET_CACHE_KEY = 'vws_preset_cache'
/** GM_setValue key for preset response ETag (content hash); used for If-None-Match → 304. */
export const PRESET_ETAG_KEY = 'vws_preset_etag'
/** GM_setValue key for preset update push: set to any value to trigger launcher reload (e.g. dev server or helper page) */
export const PRESET_UPDATE_CHANNEL_KEY = 'vws_preset_update'
/** GM_setValue key: set before reload so preset shows "Preset updated" notification after reload (must match preset main.ts) */
export const PRESET_UPDATED_NOTIFY_KEY = 'vws_preset_updated_notify'
/** When not strictly true, launcher skips network for preset (must match preset SHELL_NETWORK_ENABLED_KEY) */
export const SHELL_NETWORK_ENABLED_KEY = 'vws_shell_network_enabled'
/** Legacy key from older "auto-update" toggle; if shell key unset, true here still allows network */
export const LEGACY_AUTO_UPDATE_SCRIPT_KEY = 'vws_auto_update_script'
/** Current activated preset hash for atomic switch lifecycle */
export const PRESET_ACTIVATED_HASH_KEY = 'vws_preset_activated_hash'
/** Previous activated preset hash for rollback lifecycle */
export const PRESET_PREVIOUS_HASH_KEY = 'vws_preset_previous_hash'
/** ETag of last successful module-manifest.json response; enables 304 on manifest before touching preset.js */
export const MODULE_MANIFEST_ETAG_KEY = 'vws_module_manifest_etag'
/** Last known script-bundle URL from manifest (versioned path); used when manifest returns 304 */
export const SCRIPT_BUNDLE_URL_KEY = 'vws_script_bundle_url'

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
 * injects variable declarations (with __SCRIPT_URL__ = remote URL), runs preset via new Function + with(g).
 * Preset provides "Update Script" menu (in-place fetch and execute). Launcher listens for preset update channel (dev push).
 */
export function createLauncherScript(params: CreateLauncherScriptParams): string {
  const { baseUrl, key, launcherScriptUrl, version = '1.0.0' } = params
  const presetUrl = `${baseUrl}/static/${encodeURIComponent(key)}/${PENDING_SEGMENT}/preset.js`
  const moduleManifestUrl = `${baseUrl}/static/${key}/module-manifest.json`
  const remoteScriptUrl = `${baseUrl}/static/${key}/tampermonkey-remote.js`
  const cacheScope = encodeURIComponent(`${baseUrl}|${key}`)
  const scopedPresetCacheKey = `${PRESET_CACHE_KEY}:${cacheScope}`
  const scopedPresetEtagKey = `${PRESET_ETAG_KEY}:${cacheScope}`
  const scopedPresetUpdatedNotifyKey = `${PRESET_UPDATED_NOTIFY_KEY}:${cacheScope}`
  const scopedPresetActivatedHashKey = `${PRESET_ACTIVATED_HASH_KEY}:${cacheScope}`
  const scopedPresetPreviousHashKey = `${PRESET_PREVIOUS_HASH_KEY}:${cacheScope}`
  const scopedModuleManifestEtagKey = `${MODULE_MANIFEST_ETAG_KEY}:${cacheScope}`
  const scopedScriptBundleUrlKey = `${SCRIPT_BUNDLE_URL_KEY}:${cacheScope}`

  const uri = new URL(launcherScriptUrl)
  const { protocol, hostname, port } = uri
  const __BASE_URL__ = `${protocol}//${hostname}${port ? ':' + port : ''}`
  const __HMK_URL__ = `${protocol === 'https:' ? 'wss:' : 'ws:'}//${hostname}${port ? ':' + port : ''}/_next/webpack-hmr`
  const __RULE_API_URL__ = `${__BASE_URL__}/api/tampermonkey/${key}/rule`
  const __EDITOR_URL__ = `${__BASE_URL__}/editor`
  const isDevelopMode = process.env.NODE_ENV === 'development'
  const hostnamePort = `${hostname}${port ? ':' + port : ''}`

  const globalAssignments = buildPresetGlobalAssignments(
    {
      __BASE_URL__,
      __RULE_API_URL__,
      __EDITOR_URL__,
      __HMK_URL__,
      __SCRIPT_URL__: remoteScriptUrl,
      __IS_DEVELOP_MODE__: isDevelopMode,
      __HOSTNAME_PORT__: hostnamePort,
      __GRANTS_STRING__: GRANTS_STRING,
    },
    { scriptUrlExpression: 'runtimeScriptUrl' }
  )

  // Escape for embedding inside a JS string (backticks in template literal)
  const globalAssignmentsEscaped = globalAssignments.trim().replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')

  // Preset expects __BASE_URL__, __IS_DEVELOP_MODE__, etc. as bare identifiers. Run preset in runPreset scope
  // and declare these from g so preset sees them; GM_* come from launcher closure.
  // Inject __GLOBAL__ = g so preset and remote script use the same global (launcher's g / sandbox), not a different globalThis
  const presetVarDecls = 'var __GLOBAL__ = g; ' + PRESET_VAR_NAMES.map((n) => `var ${n} = g.${n};`).join(' ')
  const presetVarDeclsEscaped = presetVarDecls.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')

  const grants = GRANTS.filter((g) => g !== 'none')
  const grantLines = grants.map((g) => `// @grant        ${g}`).join('\n')
  /** `runtimeScriptUrl` must be a `new Function` parameter: ASSIGN_GLOBALS references it but `new Function` has no outer closure. */
  const grantParamList = ['g', 'runtimeScriptUrl', ...grants].map((n) => JSON.stringify(n)).join(', ')
  const grantArgList = ['g', 'runtimeScriptUrl', ...grants.map((n) => `g[${JSON.stringify(n)}]`)].join(', ')

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
  const MODULE_MANIFEST_URL = ${JSON.stringify(moduleManifestUrl)};
  const PRESET_CACHE_KEY_SCOPED = ${JSON.stringify(scopedPresetCacheKey)};
  const PRESET_ETAG_KEY_SCOPED = ${JSON.stringify(scopedPresetEtagKey)};
  const PRESET_UPDATED_NOTIFY_KEY_SCOPED = ${JSON.stringify(scopedPresetUpdatedNotifyKey)};
  const PRESET_ACTIVATED_HASH_KEY_SCOPED = ${JSON.stringify(scopedPresetActivatedHashKey)};
  const PRESET_PREVIOUS_HASH_KEY_SCOPED = ${JSON.stringify(scopedPresetPreviousHashKey)};
  const MODULE_MANIFEST_ETAG_KEY_SCOPED = ${JSON.stringify(scopedModuleManifestEtagKey)};
  const SCRIPT_BUNDLE_URL_KEY_SCOPED = ${JSON.stringify(scopedScriptBundleUrlKey)};
  var DEFAULT_SCRIPT_URL = ${JSON.stringify(remoteScriptUrl)};
  var runtimeScriptUrl = DEFAULT_SCRIPT_URL;
  const MODULE_LOG_PREFIX = '[ModuleLoad][preset-core]';
  const RUNTIME_STATE_KEY_PREFIX = 'vws_';
  /** Ring buffer on globalThis for log-store replay (key must match preset VWS_BOOT_LOG_GLOBAL_KEY). */
  var BOOT_LOG_MAX = 200;
  var BOOT_LOG_KEY = '__VWS_BOOT_LOG__';
  function shortHash(h) {
    if (!h || typeof h !== 'string' || h.length === 0) return '(none)';
    return h.length > 16 ? h.slice(0, 16) + '...' : h;
  }
  function bootLog(level) {
    var parts = Array.prototype.slice.call(arguments, 1);
    var msg = parts
      .map(function (x) {
        return x === undefined || x === null ? '' : String(x);
      })
      .join(' ')
      .trim();
    var line = '[VWS][Launcher] ' + msg;
    if (level === 'fail') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
    try {
      var root = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {};
      if (!root[BOOT_LOG_KEY]) root[BOOT_LOG_KEY] = [];
      var arr = root[BOOT_LOG_KEY];
      if (arr.length >= BOOT_LOG_MAX) arr.shift();
      arr.push({ t: Date.now(), level: level, message: msg });
    } catch (e) {}
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

  function runPreset(presetCode) {
    var bytes = presetCode && typeof presetCode === 'string' ? presetCode.length : 0;
    bootLog('info', MODULE_LOG_PREFIX, 'execute:start bytes=' + bytes);
    const g = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {};
    try {
      var body = ASSIGN_GLOBALS + '\\nwith(g) {\\n' + PRESET_VAR_DECLS + '\\n' + presetCode + '\\n}';
      new Function(${grantParamList}, body)(${grantArgList});
      bootLog('ok', MODULE_LOG_PREFIX, 'execute:success bytes=' + bytes);
    } catch (e) {
      var em = e && e.message ? e.message : String(e);
      bootLog('fail', MODULE_LOG_PREFIX, 'execute:failed', em);
      console.error('[Launcher] preset run failed:', em, e);
    }
  }

  function getResponseHeader(res, name) {
    var h = res.responseHeaders || '';
    var lines = h.split(/\\r?\\n/);
    var n = name.toLowerCase();
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.toLowerCase().indexOf(n + ':') === 0) return line.slice(line.indexOf(':') + 1).trim();
    }
    return null;
  }

  function normalizeEtag(etag) {
    if (!etag || typeof etag !== 'string') return '';
    return etag.trim().replace(/^W\\//i, '').replace(/^"|"$/g, '');
  }

  function readScopedValue(scopedKey, legacyKey, defaultValue) {
    var scoped = GM_getValue(scopedKey, null);
    if (scoped !== null && scoped !== undefined && scoped !== '') {
      return scoped;
    }
    return GM_getValue(legacyKey, defaultValue);
  }

  function writeScopedAndLegacy(scopedKey, legacyKey, value) {
    GM_setValue(scopedKey, value);
    GM_setValue(legacyKey, value);
  }

  function extractPresetCoreModule(data) {
    if (!data || !Array.isArray(data.modules)) {
      return null;
    }
    for (var i = 0; i < data.modules.length; i++) {
      var m = data.modules[i];
      if (m && m.id === 'preset-core') {
        return m;
      }
    }
    return null;
  }

  function hashFromPresetCoreModule(mod) {
    if (!mod || !mod.hash || mod.hash.algorithm !== 'sha1' || typeof mod.hash.value !== 'string') {
      return '';
    }
    return normalizeEtag(mod.hash.value);
  }

  /**
   * Fetch module manifest; supports If-None-Match → 304 (small) so we avoid preset.js when nothing changed.
   * @param ifNoneMatch Stored manifest ETag (normalized) or ''
   * @param skipConditional When true, omit If-None-Match (e.g. forced refresh after 304 + empty cache)
   * @param done (err, result) result: { notModified: true } | { notModified: false, data, etag }
   */
  function fetchModuleManifestWithConditional(ifNoneMatch, skipConditional, done) {
    bootLog(
      'info',
      MODULE_LOG_PREFIX,
      'manifest:fetch:start mode=' + (skipConditional ? 'full' : 'conditional') + ' storedManifestEtag=' + shortHash(ifNoneMatch || '')
    );
    var headers = {};
    if (!skipConditional && ifNoneMatch) {
      headers['If-None-Match'] = ifNoneMatch;
    }
    GM_xmlhttpRequest({
      method: 'GET',
      url: MODULE_MANIFEST_URL,
      headers: headers,
      onload: function (res) {
        if (res.status === 304) {
          bootLog('info', MODULE_LOG_PREFIX, 'manifest:not-modified (304) server says manifest unchanged — will reuse cached module URLs / local preset if any');
          done(null, { notModified: true });
          return;
        }
        if (res.status === 200 && res.responseText) {
          try {
            var data = JSON.parse(res.responseText);
            var etag = normalizeEtag(getResponseHeader(res, 'etag'));
            var pcm = extractPresetCoreModule(data);
            var rh = hashFromPresetCoreModule(pcm);
            var sbm = extractScriptBundleModule(data);
            bootLog(
              'info',
              MODULE_LOG_PREFIX,
              'manifest:fetch:success responseEtag=' + shortHash(etag) + ' preset-core:remoteHash=' + shortHash(rh) + ' script-bundle:url=' + (sbm && sbm.url ? String(sbm.url).slice(0, 80) + (String(sbm.url).length > 80 ? '...' : '') : '(default remote)')
            );
            done(null, { notModified: false, data: data, etag: etag });
          } catch (e) {
            done(e || new Error('Invalid manifest JSON'));
          }
          return;
        }
        done(new Error('manifest HTTP ' + res.status));
      },
      onerror: function () {
        done(new Error('manifest network error'));
      },
    });
  }

  function persistManifestEtag(etag) {
    if (etag) {
      writeScopedAndLegacy(MODULE_MANIFEST_ETAG_KEY_SCOPED, ${JSON.stringify(MODULE_MANIFEST_ETAG_KEY)}, etag);
    }
  }

  function extractScriptBundleModule(data) {
    if (!data || !Array.isArray(data.modules)) {
      return null;
    }
    for (var si = 0; si < data.modules.length; si++) {
      var sm = data.modules[si];
      if (sm && sm.id === 'script-bundle') {
        return sm;
      }
    }
    return null;
  }

  function applyScriptBundleUrlFromManifest(data, manifestNotModified) {
    if (manifestNotModified) {
      var cachedUrl = readScopedValue(SCRIPT_BUNDLE_URL_KEY_SCOPED, ${JSON.stringify(SCRIPT_BUNDLE_URL_KEY)}, '');
      if (cachedUrl && typeof cachedUrl === 'string') {
        runtimeScriptUrl = cachedUrl;
        bootLog('info', MODULE_LOG_PREFIX, 'script-bundle:url:from-cache', cachedUrl.length > 100 ? cachedUrl.slice(0, 100) + '...' : cachedUrl);
      }
      return;
    }
    var sb = extractScriptBundleModule(data);
    if (sb && typeof sb.url === 'string' && sb.url.length > 0) {
      var prevU = runtimeScriptUrl;
      runtimeScriptUrl = sb.url;
      writeScopedAndLegacy(SCRIPT_BUNDLE_URL_KEY_SCOPED, ${JSON.stringify(SCRIPT_BUNDLE_URL_KEY)}, sb.url);
      bootLog('info', MODULE_LOG_PREFIX, 'script-bundle:url:updated', prevU === sb.url ? '(unchanged)' : 'from ' + (prevU && prevU.length > 60 ? prevU.slice(0, 60) + '...' : prevU || '(default)') + ' -> ' + (sb.url.length > 60 ? sb.url.slice(0, 60) + '...' : sb.url));
    }
  }

  (function seedRuntimeScriptUrlFromStorage() {
    var su = readScopedValue(SCRIPT_BUNDLE_URL_KEY_SCOPED, ${JSON.stringify(SCRIPT_BUNDLE_URL_KEY)}, '');
    if (su && typeof su === 'string' && su.length > 0) {
      runtimeScriptUrl = su;
    }
  })();

  // Only persist latest manifest etag after preset apply/execute succeeds.
  var pendingManifestEtag = '';

  function applyPresetWithAtomicSwitch(presetText, normalizedHash) {
    var activeHash = readScopedValue(PRESET_ACTIVATED_HASH_KEY_SCOPED, ${JSON.stringify(PRESET_ACTIVATED_HASH_KEY)}, '');
    var nextH = normalizedHash || '';
    var needUpdate = !nextH || !activeHash || activeHash !== nextH;
    bootLog(
      'info',
      MODULE_LOG_PREFIX,
      'activate:start module=preset-core activatedHash=' + shortHash(activeHash) + ' incomingContentHash=' + shortHash(nextH) + ' needContentUpdate=' + needUpdate
    );
    if (activeHash && normalizedHash && activeHash !== normalizedHash) {
      writeScopedAndLegacy(PRESET_PREVIOUS_HASH_KEY_SCOPED, ${JSON.stringify(PRESET_PREVIOUS_HASH_KEY)}, activeHash);
      bootLog('info', MODULE_LOG_PREFIX, 'activate:rollback-target:stored previous=' + shortHash(activeHash));
    }
    if (normalizedHash) {
      writeScopedAndLegacy(PRESET_ACTIVATED_HASH_KEY_SCOPED, ${JSON.stringify(PRESET_ACTIVATED_HASH_KEY)}, normalizedHash);
      writeScopedAndLegacy(PRESET_ETAG_KEY_SCOPED, ${JSON.stringify(PRESET_ETAG_KEY)}, normalizedHash);
    }
    writeScopedAndLegacy(PRESET_CACHE_KEY_SCOPED, ${JSON.stringify(PRESET_CACHE_KEY)}, presetText);
    if (pendingManifestEtag) {
      persistManifestEtag(pendingManifestEtag);
      pendingManifestEtag = '';
    }
    var displayNewHash = nextH || activeHash;
    bootLog(
      'ok',
      MODULE_LOG_PREFIX,
      'activate:success module=preset-core hash ' + shortHash(activeHash) + ' -> ' + shortHash(displayNewHash) + ' (cache+etag written, then execute)'
    );
    runPreset(presetText);
  }

  function tryRollbackPreset() {
    var cached = readScopedValue(PRESET_CACHE_KEY_SCOPED, ${JSON.stringify(PRESET_CACHE_KEY)}, '');
    if (cached) {
      bootLog('warn', MODULE_LOG_PREFIX, 'rollback:using-cached-preset bytes=' + (cached.length || 0));
      console.warn('[Launcher] Rolling back to cached preset');
      runPreset(cached);
      return true;
    }
    bootLog('fail', MODULE_LOG_PREFIX, 'rollback:failed:no-cache');
    return false;
  }

  function shellNetworkOn() {
    var s = GM_getValue(${JSON.stringify(SHELL_NETWORK_ENABLED_KEY)});
    if (s === true) {
      return true;
    }
    if (s === false) {
      return false;
    }
    return GM_getValue(${JSON.stringify(LEGACY_AUTO_UPDATE_SCRIPT_KEY)}) === true;
  }

  function loadAndRun(skipConditionalRequest) {
    pendingManifestEtag = '';
    var presetCode0 = readScopedValue(PRESET_CACHE_KEY_SCOPED, ${JSON.stringify(PRESET_CACHE_KEY)}, '');
    var localH0 = normalizeEtag(readScopedValue(PRESET_ETAG_KEY_SCOPED, ${JSON.stringify(PRESET_ETAG_KEY)}, ''));
    var manE0 = normalizeEtag(readScopedValue(MODULE_MANIFEST_ETAG_KEY_SCOPED, ${JSON.stringify(MODULE_MANIFEST_ETAG_KEY)}, ''));
    bootLog(
      'info',
      MODULE_LOG_PREFIX,
      'load:start network=' + (shellNetworkOn() ? 'on' : 'off') + ' skipConditional=' + !!skipConditionalRequest + ' localPresetHash=' + shortHash(localH0) + ' storedManifestEtag=' + shortHash(manE0) + ' cachedPresetBytes=' + (presetCode0 && presetCode0.length ? presetCode0.length : 0)
    );
    if (!shellNetworkOn()) {
      bootLog('warn', MODULE_LOG_PREFIX, 'load:skip:network-off using cache only');
      var cachedOnly = readScopedValue(PRESET_CACHE_KEY_SCOPED, ${JSON.stringify(PRESET_CACHE_KEY)}, '');
      if (cachedOnly) {
        bootLog('info', MODULE_LOG_PREFIX, 'load:cache-hit execute cached preset-core hash=' + shortHash(localH0));
        runPreset(cachedOnly);
      } else {
        bootLog('warn', MODULE_LOG_PREFIX, 'load:cache-miss no preset body');
        console.warn('[Launcher] Shell network is off and preset cache is empty. Enable "Shell network" in the script menu while online once.');
      }
      return;
    }

    var presetCode = presetCode0;
    var localPresetHash = localH0;
    var manifestEtagStored = manE0;

    function requestPreset(fetchUrl, expectedHash, forceFullFetch) {
      var url = fetchUrl && typeof fetchUrl === 'string' ? fetchUrl : PRESET_URL;
      var hdrs = {};
      var lastProgressPercent = -1;
      var lastProgressLogAt = 0;
      if (!forceFullFetch && !skipConditionalRequest && localPresetHash) {
        hdrs['If-None-Match'] = localPresetHash;
      }
      bootLog(
        'info',
        MODULE_LOG_PREFIX,
        'preset-core:fetch:start url=' + (url.length > 120 ? url.slice(0, 120) + '...' : url) + ' expectContentHash=' + shortHash(expectedHash || '') + ' ifNoneMatch=' + (hdrs['If-None-Match'] ? shortHash(hdrs['If-None-Match']) : '(none)') + ' forceFull=' + !!forceFullFetch
      );
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        headers: hdrs,
        onprogress: function (evt) {
          var now = Date.now();
          var loaded = evt && typeof evt.loaded === 'number' ? evt.loaded : 0;
          var total = evt && typeof evt.total === 'number' ? evt.total : 0;
          var lengthComputable = !!(evt && evt.lengthComputable && total > 0);

          if (lengthComputable) {
            var percent = Math.floor((loaded / total) * 100);
            var shouldLogByPercent = percent >= lastProgressPercent + 5 || percent === 100;
            var shouldLogByTime = now - lastProgressLogAt >= 1200;
            if (shouldLogByPercent || shouldLogByTime) {
              lastProgressPercent = percent;
              lastProgressLogAt = now;
              bootLog('info', MODULE_LOG_PREFIX, 'preset-core:fetch:progress ' + percent + '% (' + loaded + '/' + total + ' bytes)');
            }
            return;
          }

          // When total is unknown, still emit sparse progress logs with downloaded bytes.
          if (now - lastProgressLogAt >= 1200) {
            lastProgressLogAt = now;
            bootLog('info', MODULE_LOG_PREFIX, 'preset-core:fetch:progress bytes=' + loaded + ' (total unknown)');
          }
        },
        onload: function (res) {
          if (res.status === 304) {
            bootLog('info', MODULE_LOG_PREFIX, 'preset-core:fetch:304 not-modified server agrees localHash=' + shortHash(localPresetHash));
            if (pendingManifestEtag) {
              persistManifestEtag(pendingManifestEtag);
              pendingManifestEtag = '';
            }
            if (presetCode) {
              runPreset(presetCode);
            } else {
              bootLog('warn', MODULE_LOG_PREFIX, 'preset-core:fetch:304 but no local cache — retry full load');
              loadAndRun(true);
            }
            return;
          }
          if (res.status === 404) {
            bootLog('warn', MODULE_LOG_PREFIX, 'preset-core:fetch:404 url may be stale — manifest refresh or rollback');
            pendingManifestEtag = '';
            if (!tryRollbackPreset()) {
              loadAndRun(true);
            }
            return;
          }
          if (res.status === 200 && res.responseText) {
            var normalizedEtag = normalizeEtag(getResponseHeader(res, 'etag'));
            bootLog(
              'info',
              MODULE_LOG_PREFIX,
              'preset-core:fetch:200 bytes=' + res.responseText.length + ' responseEtag=' + shortHash(normalizedEtag)
            );
            if (expectedHash && normalizedEtag && expectedHash !== normalizedEtag) {
              pendingManifestEtag = '';
              bootLog(
                'fail',
                MODULE_LOG_PREFIX,
                'preset-core:validate:hash-mismatch expected=' + shortHash(expectedHash) + ' actual=' + shortHash(normalizedEtag)
              );
              console.error('[Launcher] preset hash mismatch. expected:', expectedHash, 'actual:', normalizedEtag);
              if (!tryRollbackPreset()) {
                bootLog('fail', MODULE_LOG_PREFIX, 'rollback failed: no cached preset');
              }
              return;
            }
            bootLog('ok', MODULE_LOG_PREFIX, 'preset-core:validate:ok applying body etag=' + shortHash(normalizedEtag || expectedHash));
            applyPresetWithAtomicSwitch(res.responseText, normalizedEtag || expectedHash || '');
            return;
          }
          bootLog('fail', MODULE_LOG_PREFIX, 'preset-core:fetch:failed status=' + res.status);
          pendingManifestEtag = '';
          console.error('[Launcher] failed to fetch preset, status:', res.status);
          if (!tryRollbackPreset()) {
            console.error('[Launcher] rollback failed: no cached preset');
          }
        },
        onerror: function () {
          bootLog('fail', MODULE_LOG_PREFIX, 'preset-core:fetch:network-error');
          pendingManifestEtag = '';
          console.error('[Launcher] failed to fetch preset (network error)');
          if (!tryRollbackPreset()) {
            console.error('[Launcher] rollback failed: no cached preset');
          }
        },
      });
    }

    if (skipConditionalRequest) {
      fetchModuleManifestWithConditional('', true, function (err, mres) {
        var expectedHash = '';
        var presetMod = null;
        if (!err && mres && !mres.notModified && mres.data) {
          applyScriptBundleUrlFromManifest(mres.data, false);
          presetMod = extractPresetCoreModule(mres.data);
          expectedHash = hashFromPresetCoreModule(presetMod);
          if (mres.etag) {
            pendingManifestEtag = mres.etag;
          }
        } else {
          applyScriptBundleUrlFromManifest(null, true);
        }
        var presetFetchUrl = presetMod && presetMod.url ? presetMod.url : PRESET_URL;
        bootLog('info', MODULE_LOG_PREFIX, 'flow:skipConditional path=full-manifest then preset expectHash=' + shortHash(expectedHash));
        requestPreset(presetFetchUrl, expectedHash, true);
      });
      return;
    }

    fetchModuleManifestWithConditional(manifestEtagStored, false, function (err, mres) {
      if (err) {
        applyScriptBundleUrlFromManifest(null, true);
        bootLog('warn', MODULE_LOG_PREFIX, 'manifest:fetch:failed fallback=direct-PRESET_URL reason=' + (err && err.message ? err.message : String(err)));
        requestPreset(PRESET_URL, localPresetHash, !localPresetHash);
        return;
      }
      if (mres.notModified) {
        applyScriptBundleUrlFromManifest(null, true);
        pendingManifestEtag = '';
        bootLog(
          'info',
          MODULE_LOG_PREFIX,
          'decision:manifest-304 skip preset-core network fetch localPresetHash=' + shortHash(localPresetHash) + ' (re-execute cache if present)'
        );
        if (presetCode) {
          runPreset(presetCode);
        } else {
          bootLog('warn', MODULE_LOG_PREFIX, 'decision:manifest-304 but no cached preset — full fetch PRESET_URL');
          requestPreset(PRESET_URL, localPresetHash, true);
        }
        return;
      }
      if (mres.etag) {
        pendingManifestEtag = mres.etag;
      }
      applyScriptBundleUrlFromManifest(mres.data, false);
      var presetMod = extractPresetCoreModule(mres.data);
      var presetFetchUrl = presetMod && presetMod.url ? presetMod.url : PRESET_URL;
      var remoteHash = hashFromPresetCoreModule(presetMod);
      if (remoteHash && localPresetHash && remoteHash === localPresetHash && presetCode) {
        if (pendingManifestEtag) {
          persistManifestEtag(pendingManifestEtag);
          pendingManifestEtag = '';
        }
        bootLog(
          'info',
          MODULE_LOG_PREFIX,
          'decision:no-update-needed module=preset-core manifest hash equals local ' + shortHash(remoteHash) + ' — skip fetch, execute cache'
        );
        runPreset(presetCode);
        return;
      }
      bootLog(
        'info',
        MODULE_LOG_PREFIX,
        'decision:fetch-preset-core (manifest changed or missing local) remoteHash=' + shortHash(remoteHash) + ' localHash=' + shortHash(localPresetHash)
      );
      requestPreset(presetFetchUrl, remoteHash || localPresetHash, false);
    });
  }

  function resetRuntimeState() {
    var confirmed = true;
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      confirmed = window.confirm('Reset runtime state? This clears cached preset/script state and reloads this page.');
    }
    if (!confirmed) return;

    try {
      var shellNetwork = GM_getValue(${JSON.stringify(SHELL_NETWORK_ENABLED_KEY)});
      var legacyAutoUpdate = GM_getValue(${JSON.stringify(LEGACY_AUTO_UPDATE_SCRIPT_KEY)});
      var keys = GM_listValues();
      var removed = 0;
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (typeof key === 'string' && key.indexOf(RUNTIME_STATE_KEY_PREFIX) === 0) {
          GM_deleteValue(key);
          removed++;
        }
      }
      // Keep network behavior after reset; if nothing was set before, default to online so runtime can bootstrap.
      GM_setValue(${JSON.stringify(SHELL_NETWORK_ENABLED_KEY)}, shellNetwork === true || shellNetwork === false ? shellNetwork : true);
      if (legacyAutoUpdate === true || legacyAutoUpdate === false) {
        GM_setValue(${JSON.stringify(LEGACY_AUTO_UPDATE_SCRIPT_KEY)}, legacyAutoUpdate);
      }
      console.warn('[Launcher] Runtime state reset complete. Removed keys:', removed);
    } catch (e) {
      console.error('[Launcher] Runtime state reset failed:', e && e.message ? e.message : String(e));
    }

    setTimeout(function () {
      location.reload();
    }, 50);
  }

  GM_addValueChangeListener(${JSON.stringify(PRESET_UPDATE_CHANNEL_KEY)}, function (name, oldVal, newVal) {
    if (newVal == null) {
      return;
    }
    if (!shellNetworkOn()) {
      return;
    }
    GM_deleteValue(PRESET_CACHE_KEY_SCOPED);
    GM_deleteValue(PRESET_ETAG_KEY_SCOPED);
    GM_deleteValue(PRESET_ACTIVATED_HASH_KEY_SCOPED);
    GM_deleteValue(PRESET_PREVIOUS_HASH_KEY_SCOPED);
    GM_deleteValue(MODULE_MANIFEST_ETAG_KEY_SCOPED);
    GM_deleteValue(SCRIPT_BUNDLE_URL_KEY_SCOPED);
    GM_deleteValue(${JSON.stringify(PRESET_CACHE_KEY)});
    GM_deleteValue(${JSON.stringify(PRESET_ETAG_KEY)});
    GM_deleteValue(${JSON.stringify(PRESET_ACTIVATED_HASH_KEY)});
    GM_deleteValue(${JSON.stringify(PRESET_PREVIOUS_HASH_KEY)});
    GM_deleteValue(${JSON.stringify(MODULE_MANIFEST_ETAG_KEY)});
    GM_deleteValue(${JSON.stringify(SCRIPT_BUNDLE_URL_KEY)});
    if (!isTabActive()) {
      return;
    }
    GM_setValue(PRESET_UPDATED_NOTIFY_KEY_SCOPED, 1);
    GM_setValue(${JSON.stringify(PRESET_UPDATED_NOTIFY_KEY)}, 1);
    setTimeout(function () {
      if (isTabActive()) {
        location.reload();
      }
    }, 300);
  });

  GM_registerMenuCommand('Reset Runtime State', resetRuntimeState);

  loadAndRun();
})();
`
}

const GRANTS_STRING = GRANTS.map((g) => `...(typeof ${g} !== 'undefined' ? { ${g} } : {})`).join(', ')
