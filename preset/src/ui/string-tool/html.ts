/** Escape HTML entities. */
export function htmlEscape(str: string): string {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

/** Unescape HTML entities. */
export function htmlUnescape(str: string): string {
  const div = document.createElement('div')
  div.innerHTML = str
  return div.textContent ?? ''
}
