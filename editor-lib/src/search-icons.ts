import iconChevronDown from '~icons/mdi/chevron-down?raw'
import iconChevronRight from '~icons/mdi/chevron-right?raw'
import iconClose from '~icons/mdi/close?raw'
import iconReplaceAll from '~icons/mdi/file-replace?raw'
import iconReplace from '~icons/mdi/find-replace?raw'
import iconCase from '~icons/mdi/format-letter-case?raw'
import iconWholeWord from '~icons/mdi/format-letter-matches?raw'
import iconRegexp from '~icons/mdi/regex?raw'

/** MDI icons for search panel — bundled via unplugin-icons (preset / notification pattern). */
export const SEARCH_ICONS = {
  caseSensitive: iconCase,
  wholeWord: iconWholeWord,
  regexp: iconRegexp,
  chevronDown: iconChevronDown,
  chevronRight: iconChevronRight,
  replace: iconReplace,
  replaceAll: iconReplaceAll,
  close: iconClose,
} as const

/**
 * Inject sizing class into raw SVG from unplugin-icons; strip default em sizing so CSS controls dimensions.
 * @param raw SVG string from `~icons/mdi/*?raw`
 * @param className CSS class on the root svg element
 */
export function searchIconHtml(raw: string, className = 'vws-search-icon'): string {
  return raw.replace(/\s(width|height)="[^"]*"/g, '').replace('<svg', `<svg class="${className}" aria-hidden="true"`)
}
