import iconCloudDownload from '~icons/mdi/cloud-download?raw'
import iconCodeTags from '~icons/mdi/code-tags?raw'
import iconCog from '~icons/mdi/cog?raw'
import iconDelete from '~icons/mdi/delete-outline?raw'
import iconLoading from '~icons/mdi/loading?raw'
import iconPencil from '~icons/mdi/pencil?raw'
import iconPlus from '~icons/mdi/plus?raw'
import iconRefresh from '~icons/mdi/refresh?raw'
import iconReload from '~icons/mdi/reload?raw'
import iconWeb from '~icons/mdi/web?raw'

/** Popup menu icons (MDI via unplugin-icons). */
export const mmPopupIcons = {
  refresh: iconRefresh,
  reload: iconReload,
  reset: iconDelete,
  scripts: iconCodeTags,
  sync: iconCloudDownload,
  editor: iconPencil,
  settings: iconCog,
  network: iconWeb,
  plus: iconPlus,
} as const

/**
 * Inject Tailwind classes into a raw SVG string from unplugin-icons.
 * @param raw - Raw SVG markup
 * @param className - CSS classes for the svg element
 */
export function mmIcon(raw: string, className = 'mm-row-icon'): string {
  return raw.replace('<svg', `<svg class="${className}" aria-hidden="true"`)
}

/**
 * Fill `[data-icon]` placeholders with MDI SVG (class from the element).
 * @param root - Container to search within
 */
function iconClassForSlot(el: HTMLElement): string {
  if (!el.classList.contains('mm-icon-slot')) {
    el.classList.add('mm-icon-slot')
  }
  const extra = [...el.classList].filter((c) => c !== 'mm-icon-slot' && c !== 'mm-icon-spin').join(' ')
  return extra || 'mm-row-icon'
}

/** Restore one `[data-icon]` slot from `mmPopupIcons`. */
export function hydrateIconSlot(el: HTMLElement): void {
  const key = el.getAttribute('data-icon') as keyof typeof mmPopupIcons | null
  if (!key || !(key in mmPopupIcons)) {
    return
  }
  el.classList.remove('mm-icon-spin')
  el.innerHTML = mmIcon(mmPopupIcons[key], iconClassForSlot(el))
}

export function hydrateMmIcons(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    hydrateIconSlot(el)
  })
}

/** Show MDI loading spinner in an icon slot; restores `data-icon` when done. */
export function setIconSlotLoading(el: HTMLElement, loading: boolean): void {
  if (loading) {
    el.classList.add('mm-icon-spin')
    el.innerHTML = mmIcon(iconLoading, iconClassForSlot(el))
    return
  }
  hydrateIconSlot(el)
}
