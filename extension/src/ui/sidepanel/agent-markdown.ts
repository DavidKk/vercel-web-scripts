import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: false,
})

/**
 * Convert Agent markdown to sanitized HTML for chat display.
 * @param markdown Raw model text (markdown)
 * @returns Safe HTML string
 */
export function renderAgentMarkdownToHtml(markdown: string): string {
  const source = String(markdown ?? '')
  if (!source.trim()) {
    return ''
  }

  const parsed = marked.parse(source, { async: false })
  const html = typeof parsed === 'string' ? parsed : String(parsed)
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['style'],
  })
}
