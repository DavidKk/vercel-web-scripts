/** Per content-script-instance secret; page launcher receives it once via bootstrap payload. */
const bridgeToken = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `vws-${Date.now()}-${Math.random().toString(36).slice(2)}`

/** Bridge token for validating page-world GM bridge postMessages. */
export function getBridgeToken(): string {
  return bridgeToken
}

/** @param token Token from bridge postMessage */
export function isValidBridgeToken(token: unknown): boolean {
  return typeof token === 'string' && token.length > 0 && token === bridgeToken
}
