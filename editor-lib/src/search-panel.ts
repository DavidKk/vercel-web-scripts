import { closeSearchPanel, findNext, findPrevious, getSearchQuery, replaceAll, replaceNext, SearchQuery, setSearchQuery } from '@codemirror/search'
import type { EditorView, Panel, ViewUpdate } from '@codemirror/view'
import { runScopeHandlers } from '@codemirror/view'

import { SEARCH_ICONS, searchIconHtml } from '@/search-icons'

type SearchFlag = 'caseSensitive' | 'wholeWord' | 'regexp'

function phrase(view: EditorView, key: string): string {
  return view.state.phrase(key)
}

function iconButton(iconKey: keyof typeof SEARCH_ICONS, title: string, name: string, className: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = className
  btn.name = name
  btn.title = title
  btn.setAttribute('aria-label', title)
  btn.innerHTML = searchIconHtml(SEARCH_ICONS[iconKey])
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    onClick()
  })
  return btn
}

function iconToggle(iconKey: keyof typeof SEARCH_ICONS, title: string, name: string, onToggle: () => void): HTMLButtonElement {
  return iconButton(iconKey, title, name, 'vws-search-toggle', onToggle)
}

function setButtonIcon(btn: HTMLButtonElement, iconKey: keyof typeof SEARCH_ICONS): void {
  btn.innerHTML = searchIconHtml(SEARCH_ICONS[iconKey])
}

/**
 * VS Code–style search panel: MDI icon toggles (case / whole word / regex) + replace row.
 */
const panelByView = new WeakMap<EditorView, VwsSearchPanel>()

export class VwsSearchPanel implements Panel {
  readonly dom: HTMLElement
  private readonly view: EditorView
  private query: SearchQuery
  private readonly searchField: HTMLInputElement
  private readonly replaceField: HTMLInputElement
  private readonly replaceRow: HTMLElement
  private readonly caseToggle: HTMLButtonElement
  private readonly wordToggle: HTMLButtonElement
  private readonly reToggle: HTMLButtonElement
  private readonly replaceExpandBtn: HTMLButtonElement
  private replaceExpanded = false

  constructor(view: EditorView) {
    this.view = view
    this.query = getSearchQuery(view.state)

    this.searchField = document.createElement('input')
    this.searchField.className = 'cm-textfield vws-search-input'
    this.searchField.name = 'search'
    this.searchField.setAttribute('form', '')
    this.searchField.setAttribute('main-field', 'true')
    this.searchField.placeholder = phrase(view, 'Find')
    this.searchField.setAttribute('aria-label', phrase(view, 'Find'))
    this.searchField.addEventListener('change', () => this.commit())
    this.searchField.addEventListener('keyup', () => this.commit())

    this.replaceField = document.createElement('input')
    this.replaceField.className = 'cm-textfield vws-search-input'
    this.replaceField.name = 'replace'
    this.replaceField.setAttribute('form', '')
    this.replaceField.placeholder = phrase(view, 'Replace')
    this.replaceField.setAttribute('aria-label', phrase(view, 'Replace'))
    this.replaceField.addEventListener('change', () => this.commit())
    this.replaceField.addEventListener('keyup', () => this.commit())

    const run = (fn: (v: EditorView) => boolean) => () => {
      fn(view)
    }

    this.caseToggle = iconToggle('caseSensitive', phrase(view, 'match case'), 'case', () => this.flipFlag('caseSensitive'))
    this.wordToggle = iconToggle('wholeWord', phrase(view, 'by word'), 'word', () => this.flipFlag('wholeWord'))
    this.reToggle = iconToggle('regexp', phrase(view, 'regexp'), 're', () => this.flipFlag('regexp'))

    const searchToggles = document.createElement('div')
    searchToggles.className = 'vws-search-input-toggles'
    searchToggles.append(this.caseToggle, this.wordToggle, this.reToggle)

    const searchInputWrap = document.createElement('div')
    searchInputWrap.className = 'vws-search-input-wrap'
    searchInputWrap.append(this.searchField, searchToggles)

    this.replaceExpandBtn = iconButton('chevronRight', phrase(view, 'Replace'), 'expand-replace', 'vws-search-icon-btn vws-search-expand', () =>
      this.setReplaceExpanded(!this.replaceExpanded)
    )

    const closeBtn = iconButton('close', phrase(view, 'close'), 'close', 'vws-search-icon-btn vws-search-close', () => closeSearchPanel(view))

    const findRow = document.createElement('div')
    findRow.className = 'vws-search-row'
    findRow.append(this.replaceExpandBtn, searchInputWrap, closeBtn)

    this.replaceRow = document.createElement('div')
    this.replaceRow.className = 'vws-search-row vws-search-replace-row'
    this.replaceRow.hidden = true
    const replaceSpacer = document.createElement('span')
    replaceSpacer.className = 'vws-search-expand-spacer'
    this.replaceRow.append(
      replaceSpacer,
      this.replaceField,
      iconButton('replace', phrase(view, 'replace'), 'replace', 'vws-search-icon-btn', run(replaceNext)),
      iconButton('replaceAll', phrase(view, 'replace all'), 'replaceAll', 'vws-search-icon-btn', run(replaceAll))
    )

    this.dom = document.createElement('div')
    this.dom.className = 'cm-search vws-search-panel'
    this.dom.addEventListener('keydown', (e) => this.keydown(e))
    this.dom.append(findRow, this.replaceRow)

    if (view.state.readOnly) {
      this.replaceExpandBtn.hidden = true
    }

    this.setQuery(this.query)
  }

  private flipFlag(flag: SearchFlag): void {
    const q = getSearchQuery(this.view.state)
    this.dispatchQuery(
      new SearchQuery({
        search: q.search,
        caseSensitive: flag === 'caseSensitive' ? !q.caseSensitive : q.caseSensitive,
        literal: q.literal,
        regexp: flag === 'regexp' ? !q.regexp : q.regexp,
        replace: q.replace,
        wholeWord: flag === 'wholeWord' ? !q.wholeWord : q.wholeWord,
      })
    )
  }

  private dispatchQuery(query: SearchQuery): void {
    if (!query.eq(this.query)) {
      this.query = query
      this.view.dispatch({ effects: setSearchQuery.of(query) })
    }
    this.syncToggleButtons(query)
  }

  private commit(): void {
    this.dispatchQuery(
      new SearchQuery({
        search: this.searchField.value,
        caseSensitive: this.query.caseSensitive,
        regexp: this.query.regexp,
        wholeWord: this.query.wholeWord,
        replace: this.replaceField.value,
      })
    )
  }

  private syncToggleButtons(query: SearchQuery): void {
    this.setToggleActive(this.caseToggle, query.caseSensitive)
    this.setToggleActive(this.wordToggle, query.wholeWord)
    this.setToggleActive(this.reToggle, query.regexp)
  }

  private setToggleActive(btn: HTMLButtonElement, active: boolean): void {
    btn.classList.toggle('vws-search-toggle--active', active)
    btn.setAttribute('aria-pressed', active ? 'true' : 'false')
  }

  /** @param expanded Whether replace row is visible */
  setReplaceExpanded(expanded: boolean): void {
    if (this.view.state.readOnly) {
      return
    }
    this.replaceExpanded = expanded
    this.replaceRow.hidden = !expanded
    setButtonIcon(this.replaceExpandBtn, expanded ? 'chevronDown' : 'chevronRight')
  }

  /** Focus the replace input (opens replace row if needed). */
  focusReplace(): void {
    this.setReplaceExpanded(true)
    this.replaceField.focus()
    this.replaceField.select()
  }

  private keydown(e: KeyboardEvent): void {
    if (runScopeHandlers(this.view, e, 'search-panel')) {
      e.preventDefault()
      return
    }
    if (e.key === 'Enter' && e.target === this.searchField) {
      e.preventDefault()
      ;(e.shiftKey ? findPrevious : findNext)(this.view)
    } else if (e.key === 'Enter' && e.target === this.replaceField) {
      e.preventDefault()
      replaceNext(this.view)
    }
  }

  update(update: ViewUpdate): void {
    for (const tr of update.transactions) {
      for (const effect of tr.effects) {
        if (effect.is(setSearchQuery) && !effect.value.eq(this.query)) {
          this.setQuery(effect.value)
        }
      }
    }
  }

  setQuery(query: SearchQuery): void {
    this.query = query
    this.searchField.value = query.search
    this.replaceField.value = query.replace
    this.syncToggleButtons(query)
  }

  mount(): void {
    this.searchField.select()
  }

  get pos(): number {
    return 80
  }

  get top(): boolean {
    return true
  }
}

export function createVscodeSearchPanel(view: EditorView): Panel {
  const panel = new VwsSearchPanel(view)
  panelByView.set(view, panel)
  return panel
}

/** Resolve live search panel instance for a view (after panel open). */
export function getVwsSearchPanel(view: EditorView): VwsSearchPanel | null {
  return panelByView.get(view) ?? null
}
