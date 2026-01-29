import { contentEqualsByHash, getHashChunked, hashFile, hashString } from '@/utils/hash'

describe('hash utils', () => {
  describe('hashString', () => {
    it('should return a hex-encoded SHA-256 hash string', async () => {
      const hash = await hashString('hello')
      expect(hash).toBeDefined()
      expect(typeof hash).toBe('string')
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should return the same hash for the same input', async () => {
      const a = await hashString('same content')
      const b = await hashString('same content')
      expect(a).toBe(b)
    })

    it('should return different hashes for different inputs', async () => {
      const a = await hashString('content A')
      const b = await hashString('content B')
      expect(a).not.toBe(b)
    })

    it('should handle empty string', async () => {
      const hash = await hashString('')
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })
  })

  describe('getHashChunked', () => {
    it('should hash a small blob like hashString', async () => {
      const str = 'small content'
      const blob = new Blob([str], { type: 'text/plain' })
      const chunkedHash = await getHashChunked(blob)
      const stringHash = await hashString(str)
      expect(chunkedHash).toBe(stringHash)
    })

    it('should return hex string of 64 chars', async () => {
      const blob = new Blob(['x'.repeat(100)])
      const hash = await getHashChunked(blob)
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })
  })

  describe('hashFile', () => {
    it('should return same as getHashChunked for a Blob', async () => {
      const blob = new Blob(['file content'])
      const fileHash = await hashFile(blob)
      const chunkedHash = await getHashChunked(blob)
      expect(fileHash).toBe(chunkedHash)
    })
  })

  describe('contentEqualsByHash', () => {
    it('should return true when string content equals file content', async () => {
      const content = 'identical content'
      const file = new Blob([content], { type: 'text/plain' })
      const result = await contentEqualsByHash(content, file)
      expect(result).toBe(true)
    })

    it('should return false when string content differs from file content', async () => {
      const result = await contentEqualsByHash('editor content', new Blob(['local content']))
      expect(result).toBe(false)
    })

    it('should return true for empty string and empty blob', async () => {
      const result = await contentEqualsByHash('', new Blob([]))
      expect(result).toBe(true)
    })
  })
})
