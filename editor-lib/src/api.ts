import { createDirectEditor } from '@/host-direct'
import { createIsolatedEditor } from '@/host-iframe'
import type { EditorLibApi, EditorLibCreateOptions } from '@/types'

/**
 * Build public editor-lib API object.
 * @returns EditorLibApi instance
 */
export function createEditorLibApi(): EditorLibApi {
  return {
    version: 1,
    ready: true,
    create(options: EditorLibCreateOptions) {
      if (!options?.parent || !(options.parent instanceof HTMLElement)) {
        throw new Error('[editor-lib] create() requires a parent HTMLElement')
      }
      if (options.isolated) {
        return createIsolatedEditor(options)
      }
      return createDirectEditor(options)
    },
  }
}
