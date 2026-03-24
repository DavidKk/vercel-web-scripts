/**
 * GM storage keys for launcher bootstrap (must match `launcherScript.ts` scoped + legacy layout).
 * Preset must delete the same keys as the launcher's `PRESET_UPDATE_CHANNEL` listener when clearing cache.
 */

import { MODULE_MANIFEST_ETAG_KEY, PRESET_ACTIVATED_HASH_KEY, PRESET_CACHE_KEY, PRESET_ETAG_KEY, PRESET_PREVIOUS_HASH_KEY, SCRIPT_BUNDLE_URL_KEY } from '@/constants'

/**
 * Parse Tampermonkey static route key from remote or launcher URL (`/static/{key}/...`).
 * @param scriptUrl `__SCRIPT_URL__` or similar
 * @returns Key segment or null
 */
function parseStaticKeyFromScriptUrl(scriptUrl: string): string | null {
  const remote = scriptUrl.match(/\/static\/([^/]+)\/(?:[a-f0-9]{40}\/)?tampermonkey-remote\.js(?:$|[?#])/i)
  if (remote?.[1]) {
    return remote[1]
  }
  const launcher = scriptUrl.match(/\/static\/([^/]+)\/tampermonkey\.user\.js(?:$|[?#])/i)
  return launcher?.[1] ?? null
}

/**
 * Build the scoped-storage suffix the launcher uses (`encodeURIComponent(baseUrl + '|' + scriptKey)`).
 * @returns Encoded scope string, or null when `__BASE_URL__` / `__SCRIPT_URL__` cannot be parsed
 */
export function getLauncherBootstrapCacheScope(): string | null {
  const base = String(typeof __BASE_URL__ !== 'undefined' ? __BASE_URL__ : '')
  const scriptUrl = String(typeof __SCRIPT_URL__ !== 'undefined' ? __SCRIPT_URL__ : '')
  const key = parseStaticKeyFromScriptUrl(scriptUrl)
  if (!base || !key) {
    return null
  }
  return encodeURIComponent(`${base}|${key}`)
}

/**
 * Delete preset bootstrap keys (scoped + legacy) to match the launcher `PRESET_UPDATE_CHANNEL` listener’s delete step.
 * Does not set notify keys, reload, or touch `PRESET_UPDATE_CHANNEL_KEY` / shell-network keys.
 */
export function deleteLauncherBootstrapStorage(): void {
  const scope = getLauncherBootstrapCacheScope()
  if (scope) {
    GM_deleteValue(`${PRESET_CACHE_KEY}:${scope}`)
    GM_deleteValue(`${PRESET_ETAG_KEY}:${scope}`)
    GM_deleteValue(`${PRESET_ACTIVATED_HASH_KEY}:${scope}`)
    GM_deleteValue(`${PRESET_PREVIOUS_HASH_KEY}:${scope}`)
    GM_deleteValue(`${MODULE_MANIFEST_ETAG_KEY}:${scope}`)
    GM_deleteValue(`${SCRIPT_BUNDLE_URL_KEY}:${scope}`)
  }
  GM_deleteValue(PRESET_CACHE_KEY)
  GM_deleteValue(PRESET_ETAG_KEY)
  GM_deleteValue(PRESET_ACTIVATED_HASH_KEY)
  GM_deleteValue(PRESET_PREVIOUS_HASH_KEY)
  GM_deleteValue(MODULE_MANIFEST_ETAG_KEY)
  GM_deleteValue(SCRIPT_BUNDLE_URL_KEY)
}
