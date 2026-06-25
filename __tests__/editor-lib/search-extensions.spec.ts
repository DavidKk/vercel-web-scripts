/**
 * @jest-environment jsdom
 */

import { getSearchQuery, openSearchPanel, searchPanelOpen } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

import { createToggleSearchFlag, editorSearchExtensions, editorSearchKeymap } from '../../editor-lib/src/search-extensions'

describe('editorSearchExtensions', () => {
  it('returns search phrases and search panel extension', () => {
    expect(editorSearchExtensions()).toHaveLength(2)
  })
})

describe('createToggleSearchFlag', () => {
  it('returns false when search panel is closed', () => {
    const view = new EditorView({
      state: EditorState.create({ doc: 'hello' }),
      parent: document.createElement('div'),
    })
    try {
      expect(createToggleSearchFlag('regexp')(view)).toBe(false)
    } finally {
      view.destroy()
    }
  })

  it('toggles regexp flag when search panel is open', () => {
    const mount = document.createElement('div')
    document.body.appendChild(mount)
    const view = new EditorView({
      state: EditorState.create({
        doc: 'hello',
        extensions: [...editorSearchExtensions()],
      }),
      parent: mount,
    })
    try {
      openSearchPanel(view)
      expect(searchPanelOpen(view.state)).toBe(true)
      expect(getSearchQuery(view.state).regexp).toBe(false)

      const toggleRegexp = editorSearchKeymap.find((binding) => binding.key === 'Mod-Alt-r')?.run
      expect(toggleRegexp?.(view)).toBe(true)
      expect(getSearchQuery(view.state).regexp).toBe(true)
    } finally {
      view.destroy()
      mount.remove()
    }
  })
})
