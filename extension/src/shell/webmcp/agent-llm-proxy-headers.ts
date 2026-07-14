/**
 * Normalize a headers map to string key/value pairs (trim keys; drop empties).
 * @param raw Candidate headers object
 * @returns Clean Record
 */
export function normalizeProxyHeaders(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }

  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.trim()
    if (!name) {
      continue
    }
    if (value === undefined || value === null) {
      continue
    }
    out[name] = String(value)
  }
  return out
}

/**
 * Parse proxy headers from a JSON object string.
 * @param text User-entered JSON (empty → {})
 * @returns Normalized headers
 */
export function parseProxyHeadersJson(text: string): Record<string, string> {
  const trimmed = text.trim()
  if (!trimmed) {
    return {}
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed) as unknown
  } catch {
    throw new Error('Custom headers must be a JSON object, e.g. {"Authorization":"Bearer …"}.')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Custom headers must be a JSON object, e.g. {"Authorization":"Bearer …"}.')
  }

  return normalizeProxyHeaders(parsed)
}

/**
 * Pretty-print headers for the settings textarea.
 * @param headers Stored headers
 * @returns JSON string (empty object → "{}")
 */
export function formatProxyHeadersJson(headers: Record<string, string>): string {
  const normalized = normalizeProxyHeaders(headers)
  return JSON.stringify(normalized, null, 2)
}

/**
 * Build fetch headers for Agent LLM requests.
 * Auth headers apply always; custom proxy headers apply only when proxy is enabled (and may override).
 * @param input Content-Type + auth + proxy flag + custom headers
 * @returns Headers record for fetch
 */
export function buildAgentLlmFetchHeaders(input: {
  proxyEnabled: boolean
  proxyHeaders: Record<string, string>
  contentType?: string
  authHeaders?: Record<string, string>
}): Record<string, string> {
  const headers: Record<string, string> = {
    ...normalizeProxyHeaders(input.authHeaders ?? {}),
  }
  if (input.contentType) {
    headers['Content-Type'] = input.contentType
  }
  if (input.proxyEnabled) {
    Object.assign(headers, normalizeProxyHeaders(input.proxyHeaders))
  }
  return headers
}
