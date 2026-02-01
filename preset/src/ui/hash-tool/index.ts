/**
 * Hash Tool UI - Overlay to compute MD5, SHA-1, SHA-256, SHA-384, SHA-512 from pasted content.
 * Registers hash commands with Spotlight; opened via Spotlight (Cmd+Shift+P).
 */

import { GME_debounce, GME_md5, GME_sha1, GME_sha256, GME_sha384, GME_sha512 } from '@/helpers/utils'
import { GME_registerSpotlightCommand } from '@/ui/spotlight/index'

import hashToolCss from './index.css?raw'
import hashToolHtml from './index.html?raw'

/** Hash algorithm IDs supported by the hash tool */
export type HashToolAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512'

const ASYNC_HASHERS: Record<Exclude<HashToolAlgorithm, 'md5'>, (s: string) => Promise<string>> = {
  sha1: GME_sha1,
  sha256: GME_sha256,
  sha384: GME_sha384,
  sha512: GME_sha512,
}

/**
 * Opens the hash tool overlay: paste content in textarea, result shows hash below.
 * @param type - Hash algorithm: md5, sha1, sha256, sha384, or sha512
 */
function openHashTool(type: HashToolAlgorithm): void {
  const root = document.createElement('div')
  root.innerHTML = `<style>${hashToolCss}</style>${hashToolHtml}`
  const titleEl = root.querySelector('.hash-tool__title') as HTMLElement
  const titleMap: Record<HashToolAlgorithm, string> = {
    md5: 'MD5',
    sha1: 'SHA1',
    sha256: 'SHA-256',
    sha384: 'SHA-384',
    sha512: 'SHA-512',
  }
  if (titleEl) titleEl.textContent = titleMap[type]
  const textarea = root.querySelector('.hash-tool__textarea') as HTMLTextAreaElement
  const resultEl = root.querySelector('.hash-tool__result') as HTMLElement
  const backdrop = root.querySelector('.hash-tool__backdrop')
  const closeBtn = root.querySelector('.hash-tool__close')

  function close(): void {
    root.remove()
    document.removeEventListener('keydown', onEscape)
  }

  function onEscape(e: KeyboardEvent): void {
    if (e.key === 'Escape') close()
  }

  const updateResult = GME_debounce(() => {
    const text = textarea.value
    if (!text) {
      resultEl.textContent = '—'
      resultEl.classList.add('hash-tool__result--empty')
      return
    }
    resultEl.classList.remove('hash-tool__result--empty')
    if (type === 'md5') {
      resultEl.textContent = GME_md5(text)
    } else {
      resultEl.textContent = '…'
      ASYNC_HASHERS[type](text).then((hash) => {
        resultEl.textContent = hash
      })
    }
  }, 150)

  textarea.addEventListener('input', updateResult)
  textarea.addEventListener('paste', () => setTimeout(updateResult, 0))
  backdrop?.addEventListener('click', close)
  closeBtn?.addEventListener('click', close)
  document.addEventListener('keydown', onEscape)

  document.body.appendChild(root)
  textarea.focus()
}

const HASH_COMMANDS: { id: HashToolAlgorithm; title: string; keywords: string[]; hint: string }[] = [
  { id: 'md5', title: 'MD5', keywords: ['md5', 'hash', 'checksum'], hint: 'Paste content, get MD5 hash below' },
  { id: 'sha1', title: 'SHA1', keywords: ['sha1', 'hash', 'checksum'], hint: 'Paste content, get SHA1 hash below' },
  { id: 'sha256', title: 'SHA-256', keywords: ['sha256', 'sha-256', 'hash', 'checksum'], hint: 'Paste content, get SHA-256 hash below' },
  { id: 'sha384', title: 'SHA-384', keywords: ['sha384', 'sha-384', 'hash', 'checksum'], hint: 'Paste content, get SHA-384 hash below' },
  { id: 'sha512', title: 'SHA-512', keywords: ['sha512', 'sha-512', 'hash', 'checksum'], hint: 'Paste content, get SHA-512 hash below' },
]

HASH_COMMANDS.forEach(({ id, title, keywords, hint }) => {
  GME_registerSpotlightCommand({
    id,
    keywords,
    title,
    icon: '#',
    hint,
    action: () => openHashTool(id),
  })
})
