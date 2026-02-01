// ============================================================================
// Utility Functions
// ============================================================================

export function GME_sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Creates a debounced function that delays invoking the provided function
 * until after the specified wait time has elapsed since the last invocation
 * @param fn The function to debounce
 * @param wait The number of milliseconds to delay
 * @returns A debounced version of the function
 */
export function GME_debounce<T extends (...args: any[]) => any>(fn: T, wait: number): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return function debounced(...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      fn(...args)
      timeoutId = null
    }, wait)
  }
}

/**
 * Creates a throttled function that invokes the provided function at most once
 * per specified wait time period
 * @param fn The function to throttle
 * @param wait The number of milliseconds to wait between invocations
 * @returns A throttled version of the function
 */
export function GME_throttle<T extends (...args: any[]) => any>(fn: T, wait: number): (...args: Parameters<T>) => void {
  let lastCallTime = 0
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return function throttled(...args: Parameters<T>) {
    const now = Date.now()
    const timeSinceLastCall = now - lastCallTime

    if (timeSinceLastCall >= wait) {
      lastCallTime = now
      fn(...args)
    } else {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      timeoutId = setTimeout(() => {
        lastCallTime = Date.now()
        fn(...args)
        timeoutId = null
      }, wait - timeSinceLastCall)
    }
  }
}

// ============================================================================
// Crypto / Hash Functions
// ============================================================================

/** Supported digest algorithms for Web Crypto API */
export type DigestAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'

/**
 * Computes a hash digest (hex string) using Web Crypto API.
 * @param str Input string (UTF-8)
 * @param algorithm Digest algorithm name
 * @returns Promise resolving to hex string
 */
export async function GME_digest(str: string, algorithm: DigestAlgorithm): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest(algorithm, data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * SHA-1 hash (hex string).
 * @param str Input string (UTF-8)
 * @returns Promise resolving to 40-char hex string
 */
export async function GME_sha1(str: string): Promise<string> {
  return GME_digest(str, 'SHA-1')
}

/**
 * SHA-256 hash (hex string).
 * @param str Input string (UTF-8)
 * @returns Promise resolving to 64-char hex string
 */
export async function GME_sha256(str: string): Promise<string> {
  return GME_digest(str, 'SHA-256')
}

/**
 * SHA-384 hash (hex string).
 * @param str Input string (UTF-8)
 * @returns Promise resolving to 96-char hex string
 */
export async function GME_sha384(str: string): Promise<string> {
  return GME_digest(str, 'SHA-384')
}

/**
 * SHA-512 hash (hex string).
 * @param str Input string (UTF-8)
 * @returns Promise resolving to 128-char hex string
 */
export async function GME_sha512(str: string): Promise<string> {
  return GME_digest(str, 'SHA-512')
}

/**
 * MD5 hash (hex string). Synchronous, for non-crypto use (e.g. checksums).
 * @param str Input string (UTF-8)
 * @returns 32-char hex string
 */
export function GME_md5(str: string): string {
  return md5Hex(str)
}

// Minimal MD5 implementation (RFC 1321), hex output only
function md5Hex(s: string): string {
  const bytes = utf8ToBytes(s)
  const blocks = bytesToBlocks(bytes)
  let a = 0x67452301
  let b = 0xefcdab89
  let c = 0x98badcfe
  let d = 0x10325476
  const K = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193,
    0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8, 0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
    0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa,
    0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665, 0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ]
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ]
  for (let i = 0; i < blocks.length; i += 16) {
    const aa = a
    const bb = b
    const cc = c
    const dd = d
    const X = blocks.slice(i, i + 16)
    const F = (x: number, y: number, z: number) => (x & y) | (~x & z)
    const G = (x: number, y: number, z: number) => (x & z) | (y & ~z)
    const H = (x: number, y: number, z: number) => x ^ y ^ z
    const I = (x: number, y: number, z: number) => y ^ (x | ~z)
    const rot = (v: number, n: number) => (v << n) | (v >>> (32 - n))
    for (let j = 0; j < 64; j++) {
      let f: number
      let g: number
      if (j < 16) {
        f = F(b, c, d)
        g = j
      } else if (j < 32) {
        f = G(b, c, d)
        g = (5 * j + 1) % 16
      } else if (j < 48) {
        f = H(b, c, d)
        g = (3 * j + 5) % 16
      } else {
        f = I(b, c, d)
        g = (7 * j) % 16
      }
      const t = (a + f + K[j] + X[g]) >>> 0
      a = d
      d = c
      c = b
      b = (b + rot(t, S[j])) >>> 0
    }
    a = (a + aa) >>> 0
    b = (b + bb) >>> 0
    c = (c + cc) >>> 0
    d = (d + dd) >>> 0
  }
  return [a, b, c, d].map((x) => ('00000000' + (x >>> 0).toString(16)).slice(-8)).join('')
}

function utf8ToBytes(s: string): number[] {
  const out: number[] = []
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i)
    if (c < 128) {
      out.push(c)
    } else if (c < 2048) {
      out.push(192 | (c >> 6), 128 | (c & 63))
    } else if (c < 65536) {
      out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63))
    } else {
      c -= 0x10000
      out.push(240 | (c >> 18), 128 | ((c >> 12) & 63), 128 | ((c >> 6) & 63), 128 | (c & 63))
    }
  }
  return out
}

function bytesToBlocks(bytes: number[]): number[] {
  const len = bytes.length
  const bitLen = len * 8
  const padded: number[] = []
  for (let i = 0; i < len; i++) {
    padded[i >>> 2] = (padded[i >>> 2] || 0) | (bytes[i] << ((i % 4) * 8))
  }
  padded[len >>> 2] = (padded[len >>> 2] || 0) | (0x80 << ((len % 4) * 8))
  const totalWords = Math.ceil((bitLen + 72) / 512) * 16
  for (let i = padded.length; i < totalWords; i++) {
    padded[i] = 0
  }
  padded[totalWords - 2] = bitLen & 0xffffffff
  padded[totalWords - 1] = Math.floor(bitLen / 0x100000000) >>> 0
  return padded
}

export function GME_uuid() {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
