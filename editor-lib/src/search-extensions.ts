import { getSearchQuery, openSearchPanel, search, searchKeymap, searchPanelOpen, SearchQuery, setSearchQuery } from '@codemirror/search'
import { EditorState, type Extension } from '@codemirror/state'
import type { Command, KeyBinding } from '@codemirror/view'

import { createVscodeSearchPanel, getVwsSearchPanel } from '@/search-panel'

const searchPhrases = EditorState.phrases.of({
  Find: '查找',
  Replace: '替换',
  next: '下一个',
  previous: '上一个',
  all: '全部',
  'match case': '区分大小写',
  regexp: '正则表达式',
  'by word': '全词匹配',
  replace: '替换',
  'replace all': '全部替换',
  close: '关闭',
  'current match': '当前匹配',
  'on line': '行',
  'replaced match on line $': '已替换第 $ 行的匹配',
  'replaced $ matches': '已替换 $ 处匹配',
})

/**
 * Create a command that toggles a search-panel flag (regexp / case / whole word).
 * @param flag Query field to flip
 * @returns CodeMirror command
 */
export function createToggleSearchFlag(flag: 'regexp' | 'caseSensitive' | 'wholeWord'): Command {
  return (view) => {
    if (!searchPanelOpen(view.state)) {
      return false
    }
    const query = getSearchQuery(view.state)
    view.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({
          search: query.search,
          caseSensitive: flag === 'caseSensitive' ? !query.caseSensitive : query.caseSensitive,
          literal: query.literal,
          regexp: flag === 'regexp' ? !query.regexp : query.regexp,
          replace: query.replace,
          wholeWord: flag === 'wholeWord' ? !query.wholeWord : query.wholeWord,
        })
      ),
    })
    return true
  }
}

/**
 * Open search panel with replace row expanded (VS Code Ctrl+H style).
 * @param view Editor view
 */
export const openReplacePanel: Command = (view) => {
  openSearchPanel(view)
  const panel = getVwsSearchPanel(view)
  if (panel) {
    panel.setReplaceExpanded(true)
    panel.focusReplace()
  }
  return true
}

/** Extra search keybindings (regexp / case / whole-word toggles in search panel). */
export const editorSearchKeymap: readonly KeyBinding[] = [
  { key: 'Mod-Alt-r', run: createToggleSearchFlag('regexp'), scope: 'editor search-panel' },
  { key: 'Mod-Alt-c', run: createToggleSearchFlag('caseSensitive'), scope: 'editor search-panel' },
  { key: 'Mod-Alt-w', run: createToggleSearchFlag('wholeWord'), scope: 'editor search-panel' },
]

/**
 * Search extension bundle: VS Code–style panel (icon toggles + replace) and zh phrases.
 * @returns Search-related CM6 extensions
 */
export function editorSearchExtensions(): Extension[] {
  return [searchPhrases, search({ top: true, createPanel: createVscodeSearchPanel })]
}

/** Re-export default CM search keymap for merging in profiles. */
export { searchKeymap }
