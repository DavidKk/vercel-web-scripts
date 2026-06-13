/**
 * GM storage keys for launcher bootstrap (must match `launcherScript.ts` scoped + legacy layout).
 * Preset must delete the same keys as the launcher's `PRESET_UPDATE_CHANNEL` listener when clearing cache.
 */

import { MODULE_MANIFEST_ETAG_KEY, PRESET_ACTIVATED_HASH_KEY, PRESET_CACHE_KEY, PRESET_ETAG_KEY, PRESET_PREVIOUS_HASH_KEY, SCRIPT_BUNDLE_URL_KEY } from '@/constants'
import { getLauncherBootstrapCacheScope } from '@/helpers/launcher-script-url'

export { getLauncherBootstrapCacheScope } from '@/helpers/launcher-script-url'

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
