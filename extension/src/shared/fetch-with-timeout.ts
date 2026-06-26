const DEFAULT_FETCH_TIMEOUT_MS = 3_000

/**
 * fetch with an AbortController timeout so popup/status polls do not hang on dead servers.
 */
export async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}
