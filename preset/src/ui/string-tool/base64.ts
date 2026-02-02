/** Base64 encode string (UTF-8 safe via encodeURIComponent). */
export function base64Encode(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str)))
  } catch {
    return ''
  }
}

/** Base64 decode to string (UTF-8). */
export function base64Decode(str: string): string {
  try {
    return decodeURIComponent(escape(atob(str)))
  } catch {
    return ''
  }
}
