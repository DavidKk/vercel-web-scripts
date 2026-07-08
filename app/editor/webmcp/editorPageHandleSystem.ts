import { createPageHandleContext } from '@/initializer/webmcp'

import { createEditorUnavailableSlot } from './createEditorUnavailableSlot'
import type { EditorPageHandle, EditorPageSlot } from './EditorPageHandle'

const editorPageHandleSystem = createPageHandleContext<EditorPageSlot, EditorPageHandle>({
  displayName: 'EditorPageHandle',
  createUnavailableSlot: createEditorUnavailableSlot,
  buildHandle: ({ pageId, listMountedSlots, readSlot }) => ({
    meta: {
      getPageId: () => pageId,
      listMountedSlots,
    },
    session: readSlot('session'),
    tabs: readSlot('tabs'),
    buffer: readSlot('buffer'),
    publish: readSlot('publish'),
    monaco: readSlot('monaco'),
    ai: readSlot('ai'),
    rules: readSlot('rules'),
    layout: readSlot('layout'),
    devMode: readSlot('devMode'),
  }),
})

export const EditorPageHandleProvider = editorPageHandleSystem.PageHandleProvider
export const useEditorPageHandleContext = editorPageHandleSystem.usePageHandleContext
export const useOptionalEditorPageHandleContext = editorPageHandleSystem.useOptionalPageHandleContext
export const useEditorPageSlot = editorPageHandleSystem.usePageSlot
export const useOptionalEditorPageSlot = editorPageHandleSystem.useOptionalPageSlot
