'use client'

/**
 * Client-side ECDH helpers extracted from the vercel-2fa project.
 */

export async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
  return await window.crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveKey', 'deriveBits']
  )
}

export async function exportPublicKey(keyPair: CryptoKeyPair): Promise<string> {
  const publicKeyBuffer = await window.crypto.subtle.exportKey('spki', keyPair.publicKey)
  return arrayBufferToBase64(publicKeyBuffer)
}

export async function exportPrivateKey(keyPair: CryptoKeyPair): Promise<string> {
  const privateKeyBuffer = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
  return arrayBufferToBase64(privateKeyBuffer)
}

export async function importPrivateKey(privateKeyBase64: string): Promise<CryptoKey> {
  if (!privateKeyBase64) {
    throw new Error('Client private key is missing. Please restart the login flow.')
  }

  const privateKeyBuffer = base64ToArrayBuffer(privateKeyBase64)
  return await window.crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    false,
    ['deriveKey', 'deriveBits']
  )
}

export async function importPublicKey(publicKeyBase64: string): Promise<CryptoKey> {
  if (!publicKeyBase64) {
    throw new Error('Server public key is missing. Please contact the administrator.')
  }

  const publicKeyBuffer = base64ToArrayBuffer(publicKeyBase64)
  return await window.crypto.subtle.importKey(
    'spki',
    publicKeyBuffer,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    false,
    []
  )
}

export async function deriveSharedKey(privateKey: CryptoKey, serverPublicKeyBase64: string): Promise<CryptoKey> {
  const serverPublicKey = await importPublicKey(serverPublicKeyBase64)
  return await window.crypto.subtle.deriveKey(
    {
      name: 'ECDH',
      public: serverPublicKey,
    },
    privateKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['decrypt']
  )
}

export async function decryptWithSharedKey(encryptedDataBase64: string, sharedKey: CryptoKey): Promise<string> {
  if (!encryptedDataBase64) {
    throw new Error('Encrypted token is missing.')
  }

  const combinedBuffer = base64ToArrayBuffer(encryptedDataBase64)
  const combined = new Uint8Array(combinedBuffer)

  const iv = combined.slice(0, 12)
  const authTag = combined.slice(12, 28)
  const ciphertext = combined.slice(28)

  const ciphertextWithTag = new Uint8Array(ciphertext.length + authTag.length)
  ciphertextWithTag.set(ciphertext, 0)
  ciphertextWithTag.set(authTag, ciphertext.length)

  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
      tagLength: 128,
    },
    sharedKey,
    ciphertextWithTag
  )

  return new TextDecoder().decode(decrypted)
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  if (!base64) {
    throw new Error('Invalid base64 input.')
  }

  let normalized = base64.trim().replace(/\s+/g, '')
  normalized = normalized.replace(/-/g, '+').replace(/_/g, '/')
  while (normalized.length % 4 !== 0) {
    normalized += '='
  }

  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}
