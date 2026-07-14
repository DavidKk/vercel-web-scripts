import iconAccountCircleOutline from '~icons/mdi/account-circle-outline?raw'
import iconAlertCircleOutline from '~icons/mdi/alert-circle-outline?raw'
import iconAlertOutline from '~icons/mdi/alert-outline?raw'
import iconArrowCollapseDown from '~icons/mdi/arrow-collapse-down?raw'
import iconArrowLeft from '~icons/mdi/arrow-left?raw'
import iconArrowUp from '~icons/mdi/arrow-up?raw'
import iconAsterisk from '~icons/mdi/asterisk?raw'
import iconAutoFix from '~icons/mdi/auto-fix?raw'
import iconBackspaceOutline from '~icons/mdi/backspace-outline?raw'
import iconBugOutline from '~icons/mdi/bug-outline?raw'
import iconCancel from '~icons/mdi/cancel?raw'
import iconCheck from '~icons/mdi/check?raw'
import iconCheckAll from '~icons/mdi/check-all?raw'
import iconCheckCircleOutline from '~icons/mdi/check-circle-outline?raw'
import iconChevronDown from '~icons/mdi/chevron-down?raw'
import iconClipboardTextOutline from '~icons/mdi/clipboard-text-outline?raw'
import iconClose from '~icons/mdi/close?raw'
import iconCloudDownloadOutline from '~icons/mdi/cloud-download-outline?raw'
import iconCodeTags from '~icons/mdi/code-tags?raw'
import iconCog from '~icons/mdi/cog?raw'
import iconContentCopy from '~icons/mdi/content-copy?raw'
import iconCpu64Bit from '~icons/mdi/cpu-64-bit?raw'
import iconDelete from '~icons/mdi/delete-outline?raw'
import iconDragVertical from '~icons/mdi/drag-vertical?raw'
import iconEyeOffOutline from '~icons/mdi/eye-off-outline?raw'
import iconEyeOutline from '~icons/mdi/eye-outline?raw'
import iconHammerScrewdriver from '~icons/mdi/hammer-screwdriver?raw'
import iconHelpCircleOutline from '~icons/mdi/help-circle-outline?raw'
import iconInboxOutline from '~icons/mdi/inbox-outline?raw'
import iconInformationOutline from '~icons/mdi/information-outline?raw'
import iconLanCheck from '~icons/mdi/lan-check?raw'
import iconLightningBoltOutline from '~icons/mdi/lightning-bolt-outline?raw'
import iconLoading from '~icons/mdi/loading?raw'
import iconMessagePlusOutline from '~icons/mdi/message-plus-outline?raw'
import iconMessageTextOutline from '~icons/mdi/message-text-outline?raw'
import iconMinus from '~icons/mdi/minus?raw'
import iconPencil from '~icons/mdi/pencil?raw'
import iconPlus from '~icons/mdi/plus?raw'
import iconPower from '~icons/mdi/power?raw'
import iconPowerOff from '~icons/mdi/power-off?raw'
import iconReload from '~icons/mdi/reload?raw'
import iconRobotOutline from '~icons/mdi/robot-outline?raw'
import iconShieldOutline from '~icons/mdi/shield-outline?raw'
import iconStopCircleOutline from '~icons/mdi/stop-circle-outline?raw'
import iconTuneVariant from '~icons/mdi/tune-variant?raw'
import iconWeb from '~icons/mdi/web?raw'

/** Popup menu icons (MDI via unplugin-icons). */
export const mmPopupIcons = {
  refresh: iconCpu64Bit,
  agent: iconMessageTextOutline,
  agentAvatar: iconRobotOutline,
  chatSparkle: iconAutoFix,
  userAvatar: iconAccountCircleOutline,
  send: iconArrowUp,
  stop: iconStopCircleOutline,
  tool: iconHammerScrewdriver,
  chatNew: iconMessagePlusOutline,
  back: iconArrowLeft,
  chevronDown: iconChevronDown,
  reload: iconReload,
  reset: iconDelete,
  scripts: iconCodeTags,
  sync: iconCloudDownloadOutline,
  install: iconCloudDownloadOutline,
  uninstall: iconDelete,
  editor: iconPencil,
  settings: iconCog,
  rulesManage: iconShieldOutline,
  network: iconWeb,
  logs: iconClipboardTextOutline,
  quickRules: iconLightningBoltOutline,
  plus: iconPlus,
  minus: iconMinus,
  wildcard: iconAsterisk,
  drag: iconDragVertical,
  test: iconLanCheck,
  check: iconCheck,
  copy: iconContentCopy,
  clear: iconDelete,
  backspaceOutline: iconBackspaceOutline,
  follow: iconArrowCollapseDown,
  logDebug: iconBugOutline,
  logInfo: iconInformationOutline,
  logOk: iconCheck,
  logWarn: iconAlertOutline,
  logError: iconAlertCircleOutline,
  close: iconClose,
  testAll: iconCheckAll,
  delete: iconDelete,
  eye: iconEyeOutline,
  eyeOff: iconEyeOffOutline,
  serviceOn: iconPower,
  serviceOff: iconPowerOff,
  nodata: iconInboxOutline,
  permissionAllow: iconCheckCircleOutline,
  permissionAsk: iconHelpCircleOutline,
  permissionDeny: iconCancel,
  permissionMixed: iconTuneVariant,
} as const

/** Inject Tailwind classes into a raw SVG string from unplugin-icons. */
export function mmIcon(raw: string, className = 'mm-row-icon'): string {
  return raw.replace('<svg', `<svg class="${className}" aria-hidden="true"`)
}

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
  root.querySelectorAll<HTMLElement>('[data-icon]:not(.mm-select-option)').forEach((el) => {
    hydrateIconSlot(el)
  })
}

/** Set icon slot to a known MDI key (clears loading spinner). */
export function setIconSlotKey(el: HTMLElement, key: keyof typeof mmPopupIcons): void {
  el.setAttribute('data-icon', key)
  el.classList.remove('mm-icon-spin')
  hydrateIconSlot(el)
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
