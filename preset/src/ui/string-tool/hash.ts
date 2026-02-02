import { GME_sha1, GME_sha256, GME_sha384, GME_sha512 } from '@/helpers/utils'

import type { HashAlgorithm } from './types'

/** Async hash functions (SHA-1, SHA-256, SHA-384, SHA-512). */
export const ASYNC_HASHERS: Record<Exclude<HashAlgorithm, 'md5'>, (s: string) => Promise<string>> = {
  sha1: GME_sha1,
  sha256: GME_sha256,
  sha384: GME_sha384,
  sha512: GME_sha512,
}
