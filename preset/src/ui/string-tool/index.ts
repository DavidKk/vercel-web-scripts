/**
 * String Tool UI - Overlay for string operations: hash, UUID, JSON format/minify, Base64, URL encode/decode.
 * Registers commands with command palette; opened via Cmd+Shift+P.
 */

import { GME_debounce, GME_md5, GME_uuid } from '@/helpers/utils'
import { GME_registerCommandPaletteCommand } from '@/ui/command-palette/index'
import iconStringTool from '~icons/mdi/format-text?raw'

import { base64Decode, base64Encode } from './base64'
import { STRING_COMMANDS } from './commands'
import { ASYNC_HASHERS } from './hash'
import { htmlEscape, htmlUnescape } from './html'
import stringToolCss from './index.css?raw'
import stringToolHtml from './index.html?raw'
import { jsonFormat, jsonMinify } from './json'
import type { HashAlgorithm, StringToolType } from './types'

export type { StringToolCommand, StringToolType } from './types'

/**
 * Opens the string tool overlay: paste content in textarea (or use action button for UUID), result shows below.
 * @param type - Operation: hash algorithms, uuid, json-format, json-minify, base64, url, html
 */
function openStringTool(type: StringToolType): void {
  const root = document.createElement('div')
  root.innerHTML = `<style>${stringToolCss}</style>${stringToolHtml}`
  const titleMap = Object.fromEntries(STRING_COMMANDS.map((c) => [c.id, c.title])) as Record<StringToolType, string>
  const titleEl = root.querySelector('.string-tool__title') as HTMLElement
  if (titleEl) {
    titleEl.textContent = titleMap[type]
  }

  const textarea = root.querySelector('.string-tool__textarea') as HTMLTextAreaElement
  const resultEl = root.querySelector('.string-tool__result') as HTMLElement
  const actionWrap = root.querySelector('.string-tool__action-wrap') as HTMLElement
  const backdrop = root.querySelector('.string-tool__backdrop')
  const closeBtn = root.querySelector('.string-tool__close')

  function close(): void {
    root.remove()
    document.removeEventListener('keydown', onEscape)
  }

  function onEscape(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      close()
    }
  }

  if (type === 'uuid') {
    actionWrap.innerHTML = '<button type="button" class="string-tool__action-btn">Generate UUID</button>'
    const btn = actionWrap.querySelector('.string-tool__action-btn') as HTMLButtonElement
    const applyUuid = (): void => {
      const count = Math.min(Math.max(1, parseInt(textarea.value.trim(), 10) || 1), 50)
      resultEl.textContent = Array.from({ length: count }, () => GME_uuid()).join('\n')
      resultEl.classList.remove('string-tool__result--empty')
    }
    btn?.addEventListener('click', applyUuid)
    applyUuid()
    textarea.placeholder = 'Optional: enter number (1–50) for multiple UUIDs'
  }

  const updateResult = GME_debounce(() => {
    const text = textarea.value.trim()
    if (type !== 'uuid' && !text) {
      resultEl.textContent = '—'
      resultEl.classList.add('string-tool__result--empty')
      return
    }
    resultEl.classList.remove('string-tool__result--empty')

    if (type === 'md5') {
      resultEl.textContent = GME_md5(text)
      return
    }
    if (type in ASYNC_HASHERS) {
      resultEl.textContent = '…'
      ASYNC_HASHERS[type as Exclude<HashAlgorithm, 'md5'>](text).then((hash) => {
        resultEl.textContent = hash
      })
      return
    }
    if (type === 'uuid') {
      const count = Math.min(Math.max(1, parseInt(text, 10) || 1), 50)
      resultEl.textContent = Array.from({ length: count }, () => GME_uuid()).join('\n')
      return
    }
    if (type === 'json-format') {
      resultEl.textContent = jsonFormat(text)
      return
    }
    if (type === 'json-minify') {
      resultEl.textContent = jsonMinify(text)
      return
    }
    if (type === 'base64-encode') {
      resultEl.textContent = base64Encode(text)
      return
    }
    if (type === 'base64-decode') {
      resultEl.textContent = base64Decode(text)
      return
    }
    if (type === 'url-encode') {
      resultEl.textContent = encodeURIComponent(text)
      return
    }
    if (type === 'url-decode') {
      try {
        resultEl.textContent = decodeURIComponent(text)
      } catch {
        resultEl.textContent = 'Invalid URL-encoded string'
      }
      return
    }
    if (type === 'html-escape') {
      resultEl.textContent = htmlEscape(text)
      return
    }
    if (type === 'html-unescape') {
      resultEl.textContent = htmlUnescape(text)
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

STRING_COMMANDS.forEach(({ id, title, keywords, hint }) => {
  GME_registerCommandPaletteCommand({
    id,
    keywords,
    title,
    iconHtml: iconStringTool,
    hint,
    action: () => openStringTool(id),
  })
})
