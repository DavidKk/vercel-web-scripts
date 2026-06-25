import iconClose from '~icons/mdi/close?raw'
import iconFile from '~icons/mdi/file-outline?raw'
import iconFolder from '~icons/mdi/folder-outline?raw'
import iconSearch from '~icons/mdi/magnify?raw'

/** MDI icons for explorer chrome — bundled via unplugin-icons. */
export const EXPLORER_ICONS = {
  search: iconSearch,
  close: iconClose,
  file: iconFile,
  folder: iconFolder,
} as const

/**
 * Inject sizing class into raw SVG from unplugin-icons.
 * @param raw SVG string from `~icons/mdi/*?raw`
 * @param className CSS class on the root svg element
 */
export function explorerIconHtml(raw: string, className = 'vws-explorer-icon'): string {
  return raw.replace(/\s(width|height)="[^"]*"/g, '').replace('<svg', `<svg class="${className}" aria-hidden="true"`)
}
