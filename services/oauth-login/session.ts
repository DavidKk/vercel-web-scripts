'use client'

import { OAUTH_STORAGE_KEYS } from './constants'

export interface OAuthSessionData {
  state: string
  clientPublicKey: string
  clientPrivateKey: string
}

export function persistOAuthSession(data: OAuthSessionData) {
  sessionStorage.setItem(OAUTH_STORAGE_KEYS.state, data.state)
  sessionStorage.setItem(OAUTH_STORAGE_KEYS.clientPublicKey, data.clientPublicKey)
  sessionStorage.setItem(OAUTH_STORAGE_KEYS.clientPrivateKey, data.clientPrivateKey)
}

export function readOAuthSession(): OAuthSessionData | null {
  const state = sessionStorage.getItem(OAUTH_STORAGE_KEYS.state)
  const clientPublicKey = sessionStorage.getItem(OAUTH_STORAGE_KEYS.clientPublicKey)
  const clientPrivateKey = sessionStorage.getItem(OAUTH_STORAGE_KEYS.clientPrivateKey)

  if (!state || !clientPublicKey || !clientPrivateKey) {
    return null
  }

  return { state, clientPublicKey, clientPrivateKey }
}

export function clearOAuthSession() {
  sessionStorage.removeItem(OAUTH_STORAGE_KEYS.state)
  sessionStorage.removeItem(OAUTH_STORAGE_KEYS.clientPublicKey)
  sessionStorage.removeItem(OAUTH_STORAGE_KEYS.clientPrivateKey)
}
