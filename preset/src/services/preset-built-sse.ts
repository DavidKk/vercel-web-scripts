/**
 * Preset-built SSE: subscribe only when same-origin (e.g. editor at localhost).
 * Cross-origin pages do not subscribe (no CORS, no polling).
 */

import { PRESET_BUILT_HASH_KEY, PRESET_CACHE_KEY, PRESET_UPDATE_CHANNEL_KEY, PRESET_UPDATED_NOTIFY_KEY } from '@/constants'
import { GME_debug, GME_fail, GME_info } from '@/helpers/logger'
import { GME_sha1 } from '@/helpers/utils'
import { GME_notification } from '@/ui/notification/index'

/**
 * Handle one preset-built SSE event payload (hash, cache clear).
 * @param raw - Event data string (JSON)
 */
async function handlePresetBuiltEvent(raw: string): Promise<void> {
  try {
    let builtAt: string | number | undefined
    try {
      const payload = JSON.parse(raw) as { builtAt?: number }
      builtAt = payload?.builtAt
    } catch (e) {
      GME_debug('[preset-built] parse event data failed:', e instanceof Error ? e.message : String(e))
      builtAt = undefined
    }

    GME_info('[preset-built] SSE event received' + (builtAt != null ? ', builtAt=' + builtAt : ', data=' + raw.slice(0, 80)))

    const hash = await GME_sha1(raw)
    const lastHash = GM_getValue(PRESET_BUILT_HASH_KEY, '')
    if (hash === lastHash) {
      GME_debug('[preset-built] event hash unchanged, skipping')
      return
    }

    GM_setValue(PRESET_BUILT_HASH_KEY, hash)
    GME_debug('[preset-built] event applied hash=' + hash.slice(0, 8) + '...')
    GM_deleteValue(PRESET_CACHE_KEY)

    // Notify all tabs (including cross-origin): launcher listens to PRESET_UPDATE_CHANNEL_KEY and reloads
    GM_setValue(PRESET_UPDATE_CHANNEL_KEY, builtAt != null ? builtAt : Date.now())

    // Same-origin only (dev server); notify user then reload so launcher loads fresh preset (no active-tab check)
    GM_setValue(PRESET_UPDATED_NOTIFY_KEY, 1)
    GME_notification('Script has been updated', 'success', 1000)
    GME_debug('[preset-built] Reloading in 1s')
    setTimeout(() => location.reload(), 1000)
  } catch (e) {
    GME_fail('[preset-built] handlePresetBuiltEvent failed:', e instanceof Error ? e.message : String(e))
  }
}

/**
 * Subscribe to dev server preset-built SSE only when same-origin (e.g. editor at localhost).
 * Cross-origin pages do not subscribe.
 * @param baseUrl - Base URL for the preset (e.g. __BASE_URL__)
 */
export function subscribePresetBuiltSSE(baseUrl: string): void {
  try {
    const baseOrigin = new URL(baseUrl).origin
    if (typeof window === 'undefined' || window.location.origin !== baseOrigin) {
      GME_debug('[preset-built] Cross-origin, skip SSE (current: ' + window?.location?.origin + ', base: ' + baseOrigin + ')')
      return
    }
  } catch (e) {
    GME_fail('[preset-built] subscribePresetBuiltSSE origin check failed:', e instanceof Error ? e.message : String(e))
    return
  }

  const url = `${baseUrl}/api/sse/preset-built`
  try {
    const es = new EventSource(url)
    es.onopen = () => {
      GME_debug('[preset-built] SSE connected: ' + url)
    }
    es.addEventListener('preset-built', (e: MessageEvent) => {
      const raw = typeof e.data === 'string' ? e.data : JSON.stringify(e.data ?? '')
      void handlePresetBuiltEvent(raw)
    })
    es.onerror = () => {
      es.close()
    }
  } catch (e) {
    GME_fail('[preset-built] subscribePresetBuiltSSE EventSource failed:', e instanceof Error ? e.message : String(e))
  }
}

/**
 * If PRESET_UPDATED_NOTIFY_KEY was set (before reload), log "Preset updated and reloaded" and clear the key.
 * Call once at startup after reload.
 */
export function logAndClearPresetUpdatedNotify(): void {
  try {
    if (GM_getValue(PRESET_UPDATED_NOTIFY_KEY)) {
      GM_deleteValue(PRESET_UPDATED_NOTIFY_KEY)
      GME_info('[preset-built] Preset updated and reloaded.')
    }
  } catch (e) {
    GME_fail('[preset-built] logAndClearPresetUpdatedNotify failed:', e instanceof Error ? e.message : String(e))
  }
}
