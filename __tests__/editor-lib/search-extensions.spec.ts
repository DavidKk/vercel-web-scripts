/**
 * @jest-environment jsdom
 */

import { getSearchQuery, openSearchPanel, searchPanelOpen } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

import { createDirectEditorView } from '../../editor-lib/src/profiles'
import { createToggleSearchFlag, editorSearchExtensions, editorSearchKeymap, openReplacePanel } from '../../editor-lib/src/search-extensions'

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

      const panel = mount.querySelector('.vws-search-panel')
      expect(panel).toBeTruthy()
      const regexpToggle = panel?.querySelector('button[name="re"]')
      expect(regexpToggle?.classList.contains('vws-search-toggle--active')).toBe(false)

      const toggleRegexp = editorSearchKeymap.find((binding) => binding.key === 'Mod-Alt-r')?.run
      expect(toggleRegexp?.(view)).toBe(true)
      expect(getSearchQuery(view.state).regexp).toBe(true)
      expect(regexpToggle?.classList.contains('vws-search-toggle--active')).toBe(true)
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('opens replace row via openReplacePanel', () => {
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
      expect(openReplacePanel(view)).toBe(true)
      const replaceRow = mount.querySelector('.vws-search-replace-row')
      expect(replaceRow).toBeTruthy()
      expect((replaceRow as HTMLElement).hidden).toBe(false)
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('uses compact icon-only panel without prev/next/select buttons', () => {
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
      openReplacePanel(view)
      const panel = mount.querySelector('.vws-search-panel')
      expect(panel?.querySelector('button[name="prev"]')).toBeNull()
      expect(panel?.querySelector('button[name="next"]')).toBeNull()
      expect(panel?.querySelector('button[name="select"]')).toBeNull()
      expect(panel?.querySelector('.vws-search-input-wrap')).toBeTruthy()
      expect(panel?.querySelector('button[name="replace"] svg')).toBeTruthy()
      expect(panel?.querySelector('button[name="replaceAll"] svg')).toBeTruthy()
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('overlays search panel without reserving layout height', () => {
    const mount = document.createElement('div')
    mount.style.height = '320px'
    document.body.appendChild(mount)
    const view = createDirectEditorView(mount, {
      profile: 'javascript',
      readOnly: false,
      value: 'hello\n'.repeat(30),
    })
    try {
      openSearchPanel(view)
      const panels = mount.querySelector('.cm-panels-top')
      expect(panels).toBeTruthy()
      const panelStyle = window.getComputedStyle(panels as Element)
      expect(panelStyle.position).toBe('absolute')
      expect(parseFloat(panelStyle.height)).toBe(0)
      const searchPanel = mount.querySelector('.vws-search-panel') as HTMLElement | null
      expect(searchPanel).toBeTruthy()
      expect(window.getComputedStyle(searchPanel as Element).position).toBe('absolute')
    } finally {
      view.destroy()
      mount.remove()
    }
  })
})
