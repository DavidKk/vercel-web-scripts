/**
 * @jest-environment jsdom
 */

import { getSearchQuery, openSearchPanel, searchPanelOpen, SearchQuery, setSearchQuery } from '@codemirror/search'
import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

import { buildProfileExtensions } from '../../editor-lib/src/profiles'
import { vscodeEditorKeymap } from '../../editor-lib/src/vscode-keymap'

function runBinding(view: EditorView, key: string): boolean {
  const binding = vscodeEditorKeymap.find((entry) => entry.key === key)
  if (!binding?.run) {
    throw new Error(`missing binding: ${key}`)
  }
  return binding.run(view)
}

describe('vscodeEditorKeymap', () => {
  it('exposes VS Code find / replace / multi-cursor bindings', () => {
    const keys = vscodeEditorKeymap.map((binding) => binding.key)
    expect(keys).toEqual(expect.arrayContaining(['Mod-f', 'Mod-h', 'Mod-Alt-f', 'Mod-g', 'Mod-d', 'Mod-Shift-l', 'Mod-l']))
  })

  it('opens search panel with Mod-f from editor body', () => {
    const mount = document.createElement('div')
    document.body.appendChild(mount)
    const view = new EditorView({
      state: EditorState.create({
        doc: 'hello world',
        extensions: buildProfileExtensions('plain', false),
      }),
      parent: mount,
    })
    try {
      view.focus()
      expect(runBinding(view, 'Mod-f')).toBe(true)
      expect(searchPanelOpen(view.state)).toBe(true)
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('wires Mod-d to selectNextOccurrence', () => {
    const binding = vscodeEditorKeymap.find((entry) => entry.key === 'Mod-d')
    expect(binding?.run).toBeDefined()
    const mount = document.createElement('div')
    document.body.appendChild(mount)
    const view = new EditorView({
      state: EditorState.create({
        doc: 'foo bar foo baz',
        extensions: buildProfileExtensions('plain', false),
      }),
      parent: mount,
    })
    try {
      view.dispatch({ selection: EditorSelection.single(0, 3) })
      expect(binding!.run!(view)).toBe(true)
      expect(view.state.selection.ranges.length).toBeGreaterThanOrEqual(1)
      expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe('foo')
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('finds next match with Mod-g while search panel is open', () => {
    const mount = document.createElement('div')
    document.body.appendChild(mount)
    const view = new EditorView({
      state: EditorState.create({
        doc: 'alpha beta alpha gamma',
        extensions: buildProfileExtensions('plain', false),
      }),
      parent: mount,
    })
    try {
      openSearchPanel(view)
      view.dispatch({
        effects: setSearchQuery.of(new SearchQuery({ search: 'alpha' })),
        selection: EditorSelection.cursor(6),
      })
      view.focus()
      expect(getSearchQuery(view.state).search).toBe('alpha')
      const firstFrom = view.state.selection.main.from
      expect(runBinding(view, 'Mod-g')).toBe(true)
      expect(view.state.selection.main.from).toBeGreaterThan(firstFrom)
    } finally {
      view.destroy()
      mount.remove()
    }
  })
})
