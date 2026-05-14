import { getSignetSdkModuleUrl } from '@/lib/signet-sdk-url'

/**
 * Shape of the hosted `signet-client.mjs` module (keep aligned with `vercel-2fa/public/sdk/signet-client.mjs`).
 */
export type SignetClientModule = {
  normalizeAuthCenterOrigin: (origin: string) => string
  getVerifyApiUrl: (authCenterOrigin: string) => string
  getOAuthPublicKeyUrl: (authCenterOrigin: string) => string
  buildLoginUrl: (options: { authCenterOrigin: string; redirectUrl: string; state?: string }) => string
  buildOAuthLoginUrl: (options: { authCenterOrigin: string; redirectUrl: string; state: string; clientPublicKey: string; callbackOrigin?: string }) => string
  parseLoginCallbackParams: (input: URLSearchParams | string) => { token: string | null; state: string | null }
  getLoginCallbackFromWindow: () => { token: string | null; state: string | null }
  stripLoginCallbackFromUrl: (href: string) => string
  isLoginCallbackTokenInHash: (href: string) => boolean
  verifyTokenAtAuthCenter: (options: {
    authCenterOrigin: string
    token: string
    audience?: string
    scope?: string
    fetch?: typeof fetch
  }) => Promise<{ ok: boolean; status: number; response: Record<string, unknown> | null; error?: string }>
}

let signetLoadPromise: Promise<SignetClientModule> | null = null

function isRemoteModuleUrl(moduleUrl: string): boolean {
  try {
    const u = new URL(moduleUrl)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Base64-encode UTF-8 source for a `data:` ESM URL (Node `import()` only allows `file` + `data`, not `https`).
 */
function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

/**
 * Load the hosted `.mjs`: browser may `import(https:…)`; Node must fetch and `import(data:…)`.
 */
async function importSignetModule(moduleUrl: string): Promise<SignetClientModule> {
  const onServer = typeof window === 'undefined'
  if (!onServer || !isRemoteModuleUrl(moduleUrl)) {
    return import(/* webpackIgnore: true */ moduleUrl) as Promise<SignetClientModule>
  }

  const res = await fetch(moduleUrl)
  if (!res.ok) {
    throw new Error(`Signet SDK fetch failed (${res.status} ${res.statusText}): ${moduleUrl}`)
  }
  const source = await res.text()
  const dataUrl = `data:text/javascript;base64,${utf8ToBase64(source)}`
  return import(/* webpackIgnore: true */ dataUrl) as Promise<SignetClientModule>
}

/**
 * Cached runtime `import()` of the hosted Signet SDK (browser + Node route handlers).
 * Uses `webpackIgnore` so the bundler does not try to resolve the remote URL at build time.
 */
export function loadSignetSdk(): Promise<SignetClientModule> {
  if (!signetLoadPromise) {
    const url = getSignetSdkModuleUrl()
    signetLoadPromise = importSignetModule(url).catch((err: unknown) => {
      signetLoadPromise = null
      throw err
    })
  }
  return signetLoadPromise
}
