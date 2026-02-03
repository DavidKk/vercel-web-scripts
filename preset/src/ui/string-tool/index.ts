/**
 * String Tool UI - Overlay for string operations: hash, UUID, JSON format/minify, Base64, URL encode/decode.
 * Layouts: uuid (controls + result), transform (input editor + plain text result), json-editor (single editor + Format/Minify).
 * Result area is plain text; compact single style.
 */

import { GME_fail } from '@/helpers/logger'
import { GME_debounce, GME_md5, GME_uuid } from '@/helpers/utils'
import { CODEMIRROR_EDITOR_TAG, type ICodeMirrorEditorElement } from '@/ui/codemirror-editor'
import { GME_registerCommandPaletteCommand } from '@/ui/command-palette/index'
import iconStringTool from '~icons/mdi/format-text?raw'

import { base64Decode, base64Encode } from './base64'
import { STRING_COMMANDS } from './commands'
import { getLayoutForType } from './config'
import { ASYNC_HASHERS } from './hash'
import { htmlEscape, htmlUnescape } from './html'
import stringToolCss from './index.css?raw'
import stringToolHtml from './index.html?raw'
import { jsonFormat, jsonMinify } from './json'
import type { HashAlgorithm, StringToolType } from './types'

export type { StringToolLayout } from './config'
export type { StringToolCommand, StringToolType } from './types'

interface StringToolRefs {
  getInput: () => string
  setResult: (text: string) => void
  getResult: () => string
  setResultEmpty: (empty: boolean) => void
  focusInput: () => void
}

/**
 * If clipboard contains valid JSON, pastes it into the editor via setValue.
 * No-op on permission error or non-JSON content; does not show UI feedback.
 * @param setValue Callback to set editor content (e.g. el.setValue or refs.setResult)
 */
function tryPasteClipboardJson(setValue: (text: string) => void): void {
  navigator.clipboard
    .readText()
    .then((text) => {
      const trimmed = text?.trim()
      if (trimmed) {
        try {
          JSON.parse(trimmed)
          setValue(trimmed)
        } catch {
          /* not valid JSON, leave editor empty */
        }
      }
    })
    .catch(() => {})
}

function buildUpdateResult(type: StringToolType, getRefs: () => StringToolRefs): () => void {
  return GME_debounce(() => {
    const refs = getRefs()
    const text = refs.getInput().trim()
    if (type !== 'uuid' && !text) {
      refs.setResult('—')
      refs.setResultEmpty(true)
      return
    }
    refs.setResultEmpty(false)
    if (type === 'md5') {
      refs.setResult(GME_md5(text))
      return
    }
    if (type in ASYNC_HASHERS) {
      refs.setResult('…')
      ASYNC_HASHERS[type as Exclude<HashAlgorithm, 'md5'>](text).then((hash) => {
        refs.setResult(hash)
      })
      return
    }
    if (type === 'uuid') {
      const count = Math.min(Math.max(1, parseInt(text, 10) || 1), 50)
      refs.setResult(Array.from({ length: count }, () => GME_uuid()).join('\n'))
      return
    }
    if (type === 'json-format') {
      refs.setResult(jsonFormat(text))
      return
    }
    if (type === 'json-minify') {
      refs.setResult(jsonMinify(text))
      return
    }
    if (type === 'base64-encode') {
      refs.setResult(base64Encode(text))
      return
    }
    if (type === 'base64-decode') {
      refs.setResult(base64Decode(text))
      return
    }
    if (type === 'url-encode') {
      refs.setResult(encodeURIComponent(text))
      return
    }
    if (type === 'url-decode') {
      try {
        refs.setResult(decodeURIComponent(text))
      } catch {
        refs.setResult('Invalid URL-encoded string')
      }
      return
    }
    if (type === 'html-escape') {
      refs.setResult(htmlEscape(text))
      return
    }
    if (type === 'html-unescape') {
      refs.setResult(htmlUnescape(text))
    }
  }, 150)
}

/** UUID layout: count 1–50 (input area); regenerate button in footer. */
function buildUuidControls(): { container: HTMLElement; getCount: () => number; regenerateBtn: HTMLButtonElement } {
  const container = document.createElement('div')
  container.className = 'string-tool__uuid-controls'
  const label = document.createElement('label')
  label.textContent = 'Count'
  const countInput = document.createElement('input')
  countInput.type = 'number'
  countInput.min = '1'
  countInput.max = '50'
  countInput.value = '1'
  const regenerateBtn = document.createElement('button')
  regenerateBtn.type = 'button'
  regenerateBtn.className = 'string-tool__btn string-tool__uuid-regenerate'
  regenerateBtn.textContent = 'Regenerate'
  label.appendChild(countInput)
  container.appendChild(label)
  const getCount = (): number => Math.min(Math.max(1, parseInt(countInput.value, 10) || 1), 50)
  return { container, getCount, regenerateBtn }
}

/**
 * Opens the string tool overlay. Uses bundled CodeMirror for editors; on init error falls back to textarea.
 * UUID layout shows count + regenerate button + result only (no text input).
 */
function openStringTool(type: StringToolType): void {
  const titleMap = Object.fromEntries(STRING_COMMANDS.map((c) => [c.id, c.title])) as Record<StringToolType, string>
  let rootEl: HTMLElement
  let refs: StringToolRefs

  function close(): void {
    rootEl.remove()
    document.removeEventListener('keydown', onEscape)
  }

  function onEscape(e: KeyboardEvent): void {
    if (e.key === 'Escape') close()
  }

  const updateResult = buildUpdateResult(type, () => refs)

  const root = document.createElement('div')
  root.innerHTML = `<style>${stringToolCss}</style>${stringToolHtml}`
  rootEl = root

  const box = root.querySelector('.string-tool__box') as HTMLElement
  const layout = getLayoutForType(type)
  if (box) box.setAttribute('data-layout', layout)

  const titleEl = root.querySelector('.string-tool__title') as HTMLElement
  if (titleEl) titleEl.textContent = titleMap[type]

  const inputSlot = root.querySelector('.string-tool__input-slot') as HTMLElement
  const resultSlot = root.querySelector('.string-tool__result-slot') as HTMLElement
  const footer = root.querySelector('.string-tool__footer') as HTMLElement
  const copyBtn = root.querySelector('.string-tool__copy-btn') as HTMLButtonElement
  let footerActions: HTMLElement | null = null
  if (footer && copyBtn) {
    footerActions = document.createElement('div')
    footerActions.className = 'string-tool__footer-actions'
    footer.removeChild(copyBtn)
    footerActions.appendChild(copyBtn)
    footer.appendChild(footerActions)
  }
  const backdrop = root.querySelector('.string-tool__backdrop')
  const closeBtn = root.querySelector('.string-tool__close')

  backdrop?.addEventListener('click', close)
  closeBtn?.addEventListener('click', close)
  document.addEventListener('keydown', onEscape)
  document.body.appendChild(root)

  const isUuid = layout === 'uuid'
  const isJsonEditor = layout === 'json-editor'
  let uuidGetCount: () => number = () => 1

  if (isUuid) {
    const { container, getCount, regenerateBtn } = buildUuidControls()
    uuidGetCount = getCount
    inputSlot.appendChild(container)
    regenerateBtn.addEventListener('click', () => updateResult())
    if (footerActions) footerActions.insertBefore(regenerateBtn, copyBtn)
  } else {
    inputSlot.textContent = ''
  }

  function buildEditorsWithCodeMirror(): void {
    const resultEl = document.createElement('div')
    resultEl.className = 'string-tool__result string-tool__result--empty'
    resultEl.textContent = '—'
    if (!isJsonEditor) resultSlot.appendChild(resultEl)

    if (isJsonEditor) {
      const wrap = document.createElement('div')
      wrap.className = 'string-tool__json-editor-wrap'
      const editorArea = document.createElement('div')
      editorArea.className = 'string-tool__json-editor-area'
      const el = document.createElement(CODEMIRROR_EDITOR_TAG) as ICodeMirrorEditorElement
      el.setAttribute('lang', 'json')
      el.className = 'string-tool__input-editor'
      editorArea.appendChild(el)
      wrap.appendChild(editorArea)
      inputSlot.appendChild(wrap)

      refs = {
        getInput: () => el.getValue(),
        setResult: (text) => el.setValue(text),
        getResult: () => el.getValue(),
        setResultEmpty: () => {},
        focusInput: () => el.focus(),
      }
      const formatBtn = document.createElement('button')
      formatBtn.type = 'button'
      formatBtn.className = 'string-tool__btn'
      formatBtn.textContent = 'Format'
      const minifyBtn = document.createElement('button')
      minifyBtn.type = 'button'
      minifyBtn.className = 'string-tool__btn'
      minifyBtn.textContent = 'Minify'
      formatBtn.addEventListener('click', () => {
        const out = jsonFormat(refs.getInput())
        if (out !== refs.getInput()) refs.setResult(out)
      })
      minifyBtn.addEventListener('click', () => {
        const out = jsonMinify(refs.getInput())
        if (out !== refs.getInput()) refs.setResult(out)
      })
      if (footerActions) {
        footerActions.insertBefore(minifyBtn, copyBtn)
        footerActions.insertBefore(formatBtn, minifyBtn)
      }
      copyBtn?.addEventListener('click', () => {
        const text = refs.getResult()
        if (text) {
          navigator.clipboard.writeText(text).then(() => {
            const label = copyBtn.textContent
            copyBtn.textContent = 'Copied!'
            setTimeout(() => {
              copyBtn.textContent = label ?? 'Copy'
            }, 1500)
          })
        }
      })
      if (type === 'json-format') tryPasteClipboardJson((text) => el.setValue(text))
      el.focus()
      return
    }

    if (!isUuid) {
      const el = document.createElement(CODEMIRROR_EDITOR_TAG) as ICodeMirrorEditorElement
      el.setAttribute('lang', '')
      el.className = 'string-tool__input-editor'
      inputSlot.appendChild(el)
      refs = {
        getInput: () => el.getValue(),
        setResult: (text) => {
          resultEl.textContent = text
        },
        getResult: () => resultEl.textContent ?? '',
        setResultEmpty: (empty) => resultEl.classList.toggle('string-tool__result--empty', empty),
        focusInput: () => el.focus(),
      }
      el.onChange = () => updateResult()
    } else {
      refs = {
        getInput: () => String(uuidGetCount()),
        setResult: (text) => {
          resultEl.textContent = text
        },
        getResult: () => resultEl.textContent ?? '',
        setResultEmpty: (empty) => resultEl.classList.toggle('string-tool__result--empty', empty),
        focusInput: () => {},
      }
    }

    copyBtn?.addEventListener('click', () => {
      const text = refs.getResult()
      if (text && text !== '—') {
        navigator.clipboard.writeText(text).then(() => {
          const label = copyBtn.textContent
          copyBtn.textContent = 'Copied!'
          setTimeout(() => {
            copyBtn.textContent = label ?? 'Copy'
          }, 1500)
        })
      }
    })

    refs.focusInput()
    if (isUuid) updateResult()
  }

  try {
    buildEditorsWithCodeMirror()
  } catch (err) {
    GME_fail('[String Tool] CodeMirror init failed, using textarea. ' + (err instanceof Error ? err.message : String(err)))
    const resultEl = document.createElement('div')
    resultEl.className = 'string-tool__result string-tool__result--empty'
    resultEl.textContent = '—'
    if (!isJsonEditor) resultSlot.appendChild(resultEl)

    if (isJsonEditor) {
      inputSlot.textContent = ''
      const wrap = document.createElement('div')
      wrap.className = 'string-tool__json-editor-wrap'
      const editorArea = document.createElement('div')
      editorArea.className = 'string-tool__json-editor-area'
      const textarea = document.createElement('textarea')
      textarea.className = 'string-tool__textarea'
      textarea.placeholder = 'Paste JSON here...'
      editorArea.appendChild(textarea)
      wrap.appendChild(editorArea)
      inputSlot.appendChild(wrap)
      refs = {
        getInput: () => textarea.value,
        setResult: (text) => {
          textarea.value = text
        },
        getResult: () => textarea.value,
        setResultEmpty: () => {},
        focusInput: () => textarea.focus(),
      }
      const formatBtn = document.createElement('button')
      formatBtn.type = 'button'
      formatBtn.className = 'string-tool__btn'
      formatBtn.textContent = 'Format'
      const minifyBtn = document.createElement('button')
      minifyBtn.type = 'button'
      minifyBtn.className = 'string-tool__btn'
      minifyBtn.textContent = 'Minify'
      formatBtn.addEventListener('click', () => {
        const out = jsonFormat(refs.getInput())
        if (out !== refs.getInput()) refs.setResult(out)
      })
      minifyBtn.addEventListener('click', () => {
        const out = jsonMinify(refs.getInput())
        if (out !== refs.getInput()) refs.setResult(out)
      })
      const footerActionsFallback = root.querySelector('.string-tool__footer-actions') as HTMLElement | null
      if (footerActionsFallback) {
        footerActionsFallback.insertBefore(minifyBtn, copyBtn)
        footerActionsFallback.insertBefore(formatBtn, minifyBtn)
      }
      copyBtn?.addEventListener('click', () => {
        const text = refs.getResult()
        if (text) {
          navigator.clipboard.writeText(text).then(() => {
            const label = copyBtn.textContent
            copyBtn.textContent = 'Copied!'
            setTimeout(() => {
              copyBtn.textContent = label ?? 'Copy'
            }, 1500)
          })
        }
      })
      if (type === 'json-format') tryPasteClipboardJson((text) => refs.setResult(text))
      textarea.focus()
    } else if (isUuid) {
      refs = {
        getInput: () => String(uuidGetCount()),
        setResult: (text) => {
          resultEl.textContent = text
        },
        getResult: () => resultEl.textContent ?? '',
        setResultEmpty: (empty) => resultEl.classList.toggle('string-tool__result--empty', empty),
        focusInput: () => {},
      }
      updateResult()
    } else {
      inputSlot.textContent = ''
      const textarea = document.createElement('textarea')
      textarea.className = 'string-tool__textarea'
      textarea.placeholder = 'Paste or type content here...'
      inputSlot.appendChild(textarea)
      refs = {
        getInput: () => textarea.value,
        setResult: (text) => {
          resultEl.textContent = text
        },
        getResult: () => resultEl.textContent ?? '',
        setResultEmpty: (empty) => resultEl.classList.toggle('string-tool__result--empty', empty),
        focusInput: () => textarea.focus(),
      }
      textarea.addEventListener('input', updateResult)
      textarea.addEventListener('paste', () => setTimeout(updateResult, 0))
      textarea.focus()
    }

    if (!isJsonEditor && copyBtn) {
      copyBtn.addEventListener('click', () => {
        const text = refs.getResult()
        if (text && text !== '—') {
          navigator.clipboard.writeText(text).then(() => {
            const label = copyBtn.textContent
            copyBtn.textContent = 'Copied!'
            setTimeout(() => {
              copyBtn.textContent = label ?? 'Copy'
            }, 1500)
          })
        }
      })
    }
  }
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
