import { ensurePageAgentHighlightsHidden, removePageAgentHighlightDom } from './page-agent-highlights'

/** Truncation / fill limits for builtin page tools (spec §5.3). */
export const PAGE_SNAPSHOT_MAX_CHARS = 24_000
export const PAGE_OUTLINE_MAX_CHARS = 8_000
export const PAGE_FILL_MAX_CHARS = 8_000

/**
 * Truncate a string for LLM tool results.
 * @param text Source text
 * @param maxChars Inclusive max length
 */
export function truncateForPageTool(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false }
  }
  return { text: text.slice(0, maxChars), truncated: true }
}

export interface PageSnapshotResult {
  ok: true
  url: string
  title: string
  simplifiedHtml: string
  indexCount: number
  truncated: boolean
}

export interface PageHeadingItem {
  level: number
  text: string
}

export interface PageOutlineResult {
  ok: true
  url: string
  title: string
  /** Markdown-ish outline (`#` / `##` …). */
  outline: string
  /** Structured headings for reliable H1/H2 answers. */
  headings: PageHeadingItem[]
  h1Count: number
  truncated: boolean
}

export interface PageMetaResult {
  ok: true
  url: string
  title: string
  visibilityState: DocumentVisibilityState
}

export interface PageActionOkResult {
  ok: true
  message: string
}

export interface PageActionErrorResult {
  ok: false
  error: 'index_out_of_range' | 'fill_too_long' | 'action_failed' | 'not_indexed'
  message: string
}

export type PageActionResult = PageActionOkResult | PageActionErrorResult

/** Minimal surface we use from PageController (avoids pulling executeJavascript into our tools). */
export interface PageControllerLike {
  updateTree(): Promise<string>
  getBrowserState(): Promise<{ url: string; title: string; content: string; header?: string; footer?: string }>
  clickElement(index: number): Promise<{ success: boolean; message: string }>
  inputText(index: number, text: string): Promise<{ success: boolean; message: string }>
  scroll(options: { down: boolean; numPages: number; index?: number }): Promise<{ success: boolean; message: string }>
  cleanUpHighlights?(): Promise<void> | void
}

export interface PageControllerAdapter {
  snapshot(options?: { viewportOnly?: boolean }): Promise<PageSnapshotResult>
  outline(): Promise<PageOutlineResult>
  pageMeta(): PageMetaResult
  click(index: number): Promise<PageActionResult>
  fill(index: number, text: string, clear?: boolean): Promise<PageActionResult>
  scroll(options: { down?: boolean; numPages?: number; index?: number }): Promise<PageActionResult>
}

function countIndexedElements(simplifiedHtml: string): number {
  const matches = simplifiedHtml.match(/\[\d+\]/g)
  return matches ? new Set(matches).size : 0
}

/**
 * Collect visible heading text with spaces between nested text runs
 * (avoids concatenating "Script once."+"Run on yours." into one glued string).
 */
function headingText(node: Element): string {
  const parts: string[] = []
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const text = (n.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (text) {
        parts.push(text)
      }
      return
    }
    if (n.nodeType === Node.ELEMENT_NODE) {
      for (const child of Array.from(n.childNodes)) {
        walk(child)
      }
    }
  }
  walk(node)
  return parts.join(' ')
}

function collectHeadingsFromDocument(doc: Document): PageHeadingItem[] {
  const nodes = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]'))
  const headings: PageHeadingItem[] = []
  for (const node of nodes) {
    const text = headingText(node)
    if (!text) {
      continue
    }
    const tag = node.tagName.toLowerCase()
    const level = tag.startsWith('h') && tag.length === 2 ? Number(tag[1]) : Number(node.getAttribute('aria-level') ?? '2') || 2
    headings.push({ level: Math.min(Math.max(level, 1), 6), text })
  }
  return headings
}

function buildOutlineMarkdown(headings: PageHeadingItem[]): string {
  return headings.map((item) => `${'#'.repeat(item.level)} ${item.text}`).join('\n')
}

function mapActionFailure(message: string): PageActionErrorResult {
  const lower = message.toLowerCase()
  if (lower.includes('not indexed') || lower.includes('not indexed yet')) {
    return { ok: false, error: 'not_indexed', message }
  }
  if (lower.includes('index') || lower.includes('out of') || lower.includes('not found')) {
    return {
      ok: false,
      error: 'index_out_of_range',
      message: `${message} Call vws.page.snapshot again, then retry with a fresh index.`,
    }
  }
  return { ok: false, error: 'action_failed', message }
}

/**
 * Wrap PageController for MagickMonkey builtin tools.
 * Does not expose executeJavascript, cookies, or Web Storage.
 */
export function createPageControllerAdapter(controller: PageControllerLike, doc: Document = document): PageControllerAdapter {
  const clearHighlights = async () => {
    try {
      await controller.cleanUpHighlights?.()
    } catch {
      // Highlights are best-effort; never fail the tool on cleanup.
    }
    removePageAgentHighlightDom(doc)
  }

  return {
    async snapshot() {
      ensurePageAgentHighlightsHidden(doc)
      try {
        const simplifiedHtml = await controller.updateTree()
        const { text, truncated } = truncateForPageTool(simplifiedHtml, PAGE_SNAPSHOT_MAX_CHARS)
        return {
          ok: true,
          url: doc.defaultView?.location.href ?? '',
          title: doc.title,
          simplifiedHtml: text,
          indexCount: countIndexedElements(simplifiedHtml),
          truncated,
        }
      } finally {
        await clearHighlights()
      }
    },

    async outline() {
      ensurePageAgentHighlightsHidden(doc)
      try {
        await controller.updateTree()
        const headings = collectHeadingsFromDocument(doc)
        const raw = buildOutlineMarkdown(headings)
        const { text, truncated } = truncateForPageTool(raw, PAGE_OUTLINE_MAX_CHARS)
        return {
          ok: true,
          url: doc.defaultView?.location.href ?? '',
          title: doc.title,
          outline: text,
          headings,
          h1Count: headings.filter((item) => item.level === 1).length,
          truncated,
        }
      } finally {
        await clearHighlights()
      }
    },

    pageMeta() {
      return {
        ok: true,
        url: doc.defaultView?.location.href ?? '',
        title: doc.title,
        visibilityState: doc.visibilityState,
      }
    },

    async click(index: number) {
      try {
        const result = await controller.clickElement(index)
        if (!result.success) {
          return mapActionFailure(result.message)
        }
        return { ok: true, message: result.message }
      } catch (error) {
        return mapActionFailure(error instanceof Error ? error.message : String(error))
      } finally {
        await clearHighlights()
      }
    },

    async fill(index: number, text: string, clear = true) {
      void clear // reserved for future append mode; PageController.inputText always replaces
      if (text.length > PAGE_FILL_MAX_CHARS) {
        return {
          ok: false,
          error: 'fill_too_long',
          message: `text exceeds PAGE_FILL_MAX_CHARS (${PAGE_FILL_MAX_CHARS})`,
        }
      }
      try {
        const result = await controller.inputText(index, text)
        if (!result.success) {
          return mapActionFailure(result.message)
        }
        return { ok: true, message: result.message }
      } catch (error) {
        return mapActionFailure(error instanceof Error ? error.message : String(error))
      } finally {
        await clearHighlights()
      }
    },

    async scroll(options) {
      try {
        const rawPages = options.numPages ?? 1
        const numPages = Math.min(10, Math.max(0.1, Number.isFinite(rawPages) ? rawPages : 1))
        const result = await controller.scroll({
          down: options.down !== false,
          numPages,
          index: options.index,
        })
        if (!result.success) {
          return mapActionFailure(result.message)
        }
        return { ok: true, message: result.message }
      } catch (error) {
        return mapActionFailure(error instanceof Error ? error.message : String(error))
      } finally {
        await clearHighlights()
      }
    },
  }
}
