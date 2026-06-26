import { gmStorageKey } from '@ext/shared/extension-storage'

/**
 * Read scoped GM value with legacy fallback from chrome.storage.local.
 */
export async function readScopedGmValue(scopedKey: string, legacyKey: string, defaultValue: unknown): Promise<unknown> {
  const keys = [gmStorageKey(scopedKey), gmStorageKey(legacyKey)]
  const result = await chrome.storage.local.get(keys)
  const scoped = result[gmStorageKey(scopedKey)]
  if (scoped !== null && scoped !== undefined && scoped !== '') {
    return scoped
  }
  const legacy = result[gmStorageKey(legacyKey)]
  if (legacy !== null && legacy !== undefined && legacy !== '') {
    return legacy
  }
  return defaultValue
}

/**
 * Write scoped GM value and legacy mirror key.
 */
export async function writeScopedGmValue(scopedKey: string, legacyKey: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({
    [gmStorageKey(scopedKey)]: value,
    [gmStorageKey(legacyKey)]: value,
  })
}

/**
 * Normalize ETag header value.
 */
export function normalizeEtag(etag: string | null | undefined): string {
  if (!etag || typeof etag !== 'string') {
    return ''
  }
  return etag.trim().replace(/^W\//i, '').replace(/^"|"$/g, '')
}

/**
 * Extract response header from GM_XHR-style header block.
 */
export function getResponseHeader(responseHeaders: string | undefined, name: string): string | null {
  const h = responseHeaders ?? ''
  const lines = h.split(/\r?\n/)
  const n = name.toLowerCase()
  for (const line of lines) {
    if (line.toLowerCase().startsWith(`${n}:`)) {
      return line.slice(line.indexOf(':') + 1).trim()
    }
  }
  return null
}
