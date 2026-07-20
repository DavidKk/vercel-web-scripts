import type { VwsWebMcpToolInput } from '@shared/webmcp/types'

import type { PageControllerAdapter } from './page-controller-adapter'

type PageToolDefinition = Omit<VwsWebMcpToolInput, 'execute'> & {
  localName: string
  execute: (adapter: PageControllerAdapter, input: Record<string, unknown>) => unknown | Promise<unknown>
}

function asIndex(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return null
  }
  return value
}

/**
 * Builtin page tool definitions (localName only; canonical prefix applied at register).
 */
export function getPageToolDefinitions(): PageToolDefinition[] {
  return [
    {
      localName: 'snapshot',
      name: 'snapshot',
      description:
        'Return a compact interactive DOM text map with element indices (links, buttons, inputs). Use for UI structure, visible controls, and before click/fill. Not for document.title alone — use page_meta for that.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          viewportOnly: {
            type: 'boolean',
            description: 'Reserved; currently ignored — full-page interactive map is always returned.',
          },
        },
        additionalProperties: false,
      },
      execute: (adapter, input) => {
        void input.viewportOnly
        return adapter.snapshot()
      },
    },
    {
      localName: 'outline',
      name: 'outline',
      description:
        'Return page headings (h1–h6 / role=heading) as markdown plus structured headings[] and h1Count. Use for questions about H1/H2 text, heading counts, or section titles. Prefer this over page_meta for heading content.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      execute: (adapter) => adapter.outline(),
    },
    {
      localName: 'page_meta',
      name: 'page_meta',
      description:
        'Return only URL, document.title, and visibilityState. Does NOT include headings, H1 text, body copy, or UI elements — use outline for headings and snapshot for interactive UI.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      execute: (adapter) => adapter.pageMeta(),
    },
    {
      localName: 'click',
      name: 'click',
      description: 'Click an interactive element by index from the latest snapshot.',
      annotations: { readOnlyHint: false },
      inputSchema: {
        type: 'object',
        required: ['index'],
        properties: {
          index: { type: 'integer', minimum: 0 },
        },
        additionalProperties: false,
      },
      execute: (adapter, input) => {
        const index = asIndex(input.index)
        if (index == null) {
          return { ok: false, error: 'index_out_of_range', message: 'index must be a non-negative integer' }
        }
        return adapter.click(index)
      },
    },
    {
      localName: 'fill',
      name: 'fill',
      description: 'Type text into an element by snapshot index.',
      annotations: { readOnlyHint: false },
      inputSchema: {
        type: 'object',
        required: ['index', 'text'],
        properties: {
          index: { type: 'integer', minimum: 0 },
          text: { type: 'string', maxLength: 8000 },
          clear: { type: 'boolean', default: true },
        },
        additionalProperties: false,
      },
      execute: (adapter, input) => {
        const index = asIndex(input.index)
        if (index == null) {
          return { ok: false, error: 'index_out_of_range', message: 'index must be a non-negative integer' }
        }
        if (typeof input.text !== 'string') {
          return { ok: false, error: 'action_failed', message: 'text must be a string' }
        }
        return adapter.fill(index, input.text, input.clear !== false)
      },
    },
    {
      localName: 'scroll',
      name: 'scroll',
      description: 'Scroll the page or an indexed element.',
      annotations: { readOnlyHint: false },
      inputSchema: {
        type: 'object',
        properties: {
          down: { type: 'boolean', default: true },
          numPages: { type: 'number', minimum: 0.1, maximum: 10, default: 1 },
          index: { type: 'integer', minimum: 0 },
        },
        additionalProperties: false,
      },
      execute: (adapter, input) => {
        const index = input.index === undefined ? undefined : asIndex(input.index)
        if (input.index !== undefined && index == null) {
          return { ok: false, error: 'index_out_of_range', message: 'index must be a non-negative integer' }
        }
        const numPages = typeof input.numPages === 'number' ? input.numPages : 1
        return adapter.scroll({
          down: input.down !== false,
          numPages,
          index: index ?? undefined,
        })
      },
    },
  ]
}
