'use client'

import { OAUTH_SERVER_PUBLIC_KEY } from './constants'
import { decryptWithSharedKey, deriveSharedKey, importPrivateKey } from './ecdh'

interface DecryptedPayload {
  token: string
  [key: string]: unknown
}

export async function decryptOAuthPayload(encryptedToken: string, clientPrivateKey: string): Promise<DecryptedPayload> {
  if (!OAUTH_SERVER_PUBLIC_KEY) {
    throw new Error('NEXT_PUBLIC_OAUTH_SERVER_PUBLIC_KEY is required to decrypt the token.')
  }

  const privateKey = await importPrivateKey(clientPrivateKey)
  const sharedKey = await deriveSharedKey(privateKey, OAUTH_SERVER_PUBLIC_KEY)
  const decryptedJson = await decryptWithSharedKey(encryptedToken, sharedKey)

  let payload: unknown
  try {
    payload = JSON.parse(decryptedJson)
  } catch {
    throw new Error('Decrypted payload is not valid JSON.')
  }

  if (!payload || typeof payload !== 'object' || typeof (payload as DecryptedPayload).token !== 'string') {
    throw new Error('Decrypted payload is missing the token field.')
  }

  return payload as DecryptedPayload
}
