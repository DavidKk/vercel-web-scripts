/**
 * Normalize a user-entered API base URL: trim and strip trailing slashes.
 * @param raw User-entered base URL
 * @returns Normalized URL string, or empty when blank
 */
export function normalizeApiBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

/**
 * Validate that a normalized base URL is http(s) with a host.
 * @param normalized Output of {@link normalizeApiBaseUrl}
 * @returns True when usable as an API root
 */
export function isValidApiBaseUrl(normalized: string): boolean {
  if (!normalized) {
    return false
  }
  try {
    const url = new URL(normalized)
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.host)
  } catch {
    return false
  }
}

/**
 * Resolve an API root from config (official vs custom proxy).
 * When proxy is enabled, baseUrl must be a valid http(s) URL; does not fall back to official.
 * @param config Proxy flags
 * @param officialRoot Official API root for the provider
 * @param providerLabel Human label for error messages
 * @returns API root without trailing slash
 */
export function resolveProviderApiRoot(config: { proxyEnabled: boolean; baseUrl: string }, officialRoot: string, providerLabel: string): string {
  if (!config.proxyEnabled) {
    return officialRoot
  }

  const normalized = normalizeApiBaseUrl(config.baseUrl)
  if (!isValidApiBaseUrl(normalized)) {
    throw new Error(`${providerLabel} API proxy is enabled but Base URL is missing or invalid. Use a full http(s) URL.`)
  }
  return normalized
}
