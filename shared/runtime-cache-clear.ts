import { LEGACY_AUTO_UPDATE_SCRIPT_KEY, RUNTIME_STATE_KEY_PREFIX, SHELL_LOG_PERSIST_ENABLED_KEY, SHELL_NETWORK_ENABLED_KEY } from './launcher-constants'
import { SHELL_INCOGNITO_LOG_COLLECTION_KEY, SHELL_LOG_OUTPUT_MODE_KEY } from './shell-log-output'

/** Tampermonkey rules JSON cache (legacy key; not under `vws_`). */
export const RULE_CACHE_KEY = '#RuleCache@WebScripts'

/** Prefix for legacy rules-related GM keys. */
export const RULE_CACHE_KEY_PREFIX = '#Rule'

/** GM key: script-update HOST tab lock (not under `vws_`). */
export const SCRIPT_UPDATE_HOST_KEY = 'script-update@host'

/** GM keys kept across runtime reset / update runtime (user prefs, not OTA cache). */
export const RUNTIME_CACHE_PRESERVE_KEYS: readonly string[] = [
  SHELL_NETWORK_ENABLED_KEY,
  LEGACY_AUTO_UPDATE_SCRIPT_KEY,
  SHELL_LOG_OUTPUT_MODE_KEY,
  SHELL_LOG_PERSIST_ENABLED_KEY,
  SHELL_INCOGNITO_LOG_COLLECTION_KEY,
]

/** Minimal GM storage surface for cache clearing (page launcher + preset). */
export interface RuntimeGmStorage {
  listValues(): string[]
  getValue(key: string): unknown
  deleteValue(key: string): void
  setValue(key: string, value: unknown): void
}

/**
 * Whether a GM key should be removed on runtime reset / update runtime clear.
 * @param key GM storage key
 */
export function isRuntimeCacheGmKey(key: string): boolean {
  if (!key || typeof key !== 'string') {
    return false
  }
  if ((RUNTIME_CACHE_PRESERVE_KEYS as readonly string[]).includes(key)) {
    return false
  }
  if (key.startsWith(RUNTIME_STATE_KEY_PREFIX)) {
    return true
  }
  if (key.startsWith(RULE_CACHE_KEY_PREFIX)) {
    return true
  }
  if (key === SCRIPT_UPDATE_HOST_KEY) {
    return true
  }
  return false
}

/**
 * Filter GM_listValues() keys to delete on full runtime cache clear.
 * @param allKeys All GM keys from listValues()
 */
export function listRuntimeCacheGmKeys(allKeys: string[]): string[] {
  return allKeys.filter((key): key is string => typeof key === 'string' && isRuntimeCacheGmKey(key))
}

/**
 * Clear OTA/runtime GM caches; preserve shell network + log preference keys.
 * @param gm GM storage adapter
 * @returns Number of keys removed
 */
export function clearAllRuntimeGmCaches(gm: RuntimeGmStorage): number {
  const shellNetwork = gm.getValue(SHELL_NETWORK_ENABLED_KEY)
  const legacyAutoUpdate = gm.getValue(LEGACY_AUTO_UPDATE_SCRIPT_KEY)
  const logOutputMode = gm.getValue(SHELL_LOG_OUTPUT_MODE_KEY)
  const logPersist = gm.getValue(SHELL_LOG_PERSIST_ENABLED_KEY)
  const incognitoLogCollection = gm.getValue(SHELL_INCOGNITO_LOG_COLLECTION_KEY)

  let removed = 0
  for (const key of listRuntimeCacheGmKeys(gm.listValues())) {
    gm.deleteValue(key)
    removed++
  }

  gm.setValue(SHELL_NETWORK_ENABLED_KEY, shellNetwork === true || shellNetwork === false ? shellNetwork : true)
  if (legacyAutoUpdate === true || legacyAutoUpdate === false) {
    gm.setValue(LEGACY_AUTO_UPDATE_SCRIPT_KEY, legacyAutoUpdate)
  }
  if (logOutputMode === 'console' || logOutputMode === 'logviewer' || logOutputMode === 'none') {
    gm.setValue(SHELL_LOG_OUTPUT_MODE_KEY, logOutputMode)
  }
  if (logPersist === true || logPersist === false) {
    gm.setValue(SHELL_LOG_PERSIST_ENABLED_KEY, logPersist)
  }
  if (incognitoLogCollection === true || incognitoLogCollection === false) {
    gm.setValue(SHELL_INCOGNITO_LOG_COLLECTION_KEY, incognitoLogCollection)
  }

  return removed
}
