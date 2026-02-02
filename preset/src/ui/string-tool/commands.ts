import type { StringToolCommand } from './types'

/** Command palette entries for all string tool operations. */
export const STRING_COMMANDS: StringToolCommand[] = [
  { id: 'md5', title: 'MD5', keywords: ['md5', 'hash', 'checksum'], hint: 'Paste content, get MD5 hash' },
  { id: 'sha1', title: 'SHA1', keywords: ['sha1', 'hash', 'checksum'], hint: 'Paste content, get SHA1 hash' },
  {
    id: 'sha256',
    title: 'SHA-256',
    keywords: ['sha256', 'sha-256', 'hash', 'checksum'],
    hint: 'Paste content, get SHA-256 hash',
  },
  {
    id: 'sha384',
    title: 'SHA-384',
    keywords: ['sha384', 'sha-384', 'hash', 'checksum'],
    hint: 'Paste content, get SHA-384 hash',
  },
  {
    id: 'sha512',
    title: 'SHA-512',
    keywords: ['sha512', 'sha-512', 'hash', 'checksum'],
    hint: 'Paste content, get SHA-512 hash',
  },
  { id: 'uuid', title: 'UUID Generator', keywords: ['uuid', 'guid', 'generate'], hint: 'Generate UUID(s)' },
  { id: 'json-format', title: 'JSON Format', keywords: ['json', 'format', 'pretty'], hint: 'Pretty-print JSON' },
  { id: 'json-minify', title: 'JSON Minify', keywords: ['json', 'minify', 'compress'], hint: 'Minify JSON' },
  {
    id: 'base64-encode',
    title: 'Base64 Encode',
    keywords: ['base64', 'encode'],
    hint: 'Encode text to Base64',
  },
  {
    id: 'base64-decode',
    title: 'Base64 Decode',
    keywords: ['base64', 'decode'],
    hint: 'Decode Base64 to text',
  },
  { id: 'url-encode', title: 'URL Encode', keywords: ['url', 'encode', 'percent'], hint: 'URL-encode string' },
  { id: 'url-decode', title: 'URL Decode', keywords: ['url', 'decode'], hint: 'URL-decode string' },
  { id: 'html-escape', title: 'HTML Escape', keywords: ['html', 'escape'], hint: 'Escape HTML entities' },
  { id: 'html-unescape', title: 'HTML Unescape', keywords: ['html', 'unescape'], hint: 'Unescape HTML entities' },
]
