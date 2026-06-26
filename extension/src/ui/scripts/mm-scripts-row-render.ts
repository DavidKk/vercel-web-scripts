import { setScriptEnabled, setScriptInstalled } from '@ext/shared/extension-storage'
import { navigateExtensionPage } from '@ext/shared/focus-or-open-tab'

import { hydrateMmIcons } from '../mm-icons'
import { buildRulesPageScriptUrl } from '../rules/mm-rules-hash'
import { formatScriptUpdatedAt } from '../shared/mm-format-relative-time'
import { createMmScriptsSwitch } from '../shared/mm-scripts-switch'
import type { MmToast } from '../shared/mm-toast'
import { updateMmTooltip } from '../shared/mm-tooltip'
import { type ScriptRow, STAGE_BADGE_CLASS } from './mm-scripts-types'

export interface MmScriptsRowRenderHost {
  scriptTogglesIncognito: boolean
  installToggleInProgress: boolean
  toast: MmToast
  enabledMapKey(scriptKey: string, file: string): string
  enabledByKey: Map<string, boolean>
  applyFilters(): void
  handleAcceptAlphaToggle(scriptKey: string, file: string, acceptAlpha: boolean): Promise<void>
}

function wrapScriptTextCell(column: 'index' | 'name' | 'release' | 'file' | 'service', inner: HTMLElement): HTMLDivElement {
  const cell = document.createElement('div')
  cell.className = `mm-script-cell mm-script-cell--${column}`
  cell.append(inner)
  return cell
}

function renderNameCell(item: ScriptRow): HTMLDivElement {
  const cell = document.createElement('div')
  cell.className = 'mm-script-cell mm-script-cell--name'

  const block = document.createElement('div')
  block.className = 'mm-script-name-block'

  const iconWrap = document.createElement('div')
  iconWrap.className = 'mm-script-name-icon'
  if (item.icon) {
    const img = document.createElement('img')
    img.className = 'mm-script-name-icon-img'
    img.src = item.icon
    img.alt = ''
    img.loading = 'lazy'
    img.decoding = 'async'
    iconWrap.append(img)
  } else {
    iconWrap.classList.add('mm-script-name-icon--fallback')
    const slot = document.createElement('span')
    slot.className = 'mm-icon-slot'
    slot.setAttribute('data-icon', 'scripts')
    iconWrap.append(slot)
  }

  const text = document.createElement('div')
  text.className = 'mm-script-name-text'

  const nameText = item.label || item.file
  const titleLine = document.createElement('div')
  titleLine.className = 'mm-script-name-title'

  const nameInner = document.createElement('span')
  nameInner.className = 'mm-script-name'
  nameInner.textContent = nameText
  titleLine.append(nameInner)

  const authorText = item.author?.trim()
  if (authorText) {
    const authorInner = document.createElement('span')
    authorInner.className = 'mm-script-author-suffix'
    authorInner.textContent = ` @${authorText}`
    titleLine.append(authorInner)
  }

  text.append(titleLine)

  const descriptionText = item.description?.trim()
  if (descriptionText) {
    const descriptionInner = document.createElement('span')
    descriptionInner.className = 'mm-script-description'
    descriptionInner.textContent = descriptionText
    text.append(descriptionInner)
  }

  block.append(iconWrap, text)
  cell.append(block)
  return cell
}

function renderReleaseCell(item: ScriptRow): HTMLDivElement {
  const cell = document.createElement('div')
  cell.className = 'mm-script-cell mm-script-cell--release'

  const inner = document.createElement('div')
  inner.className = 'mm-script-release-inner'

  const versionLine = document.createElement('div')
  versionLine.className = 'mm-script-version-line'

  const versionText = item.version?.trim() ?? ''
  const versionInner = document.createElement('span')
  versionInner.className = 'mm-script-version'
  versionInner.textContent = versionText || '—'
  versionLine.append(versionInner)

  const stageBadge = document.createElement('span')
  stageBadge.className = STAGE_BADGE_CLASS[item.ota.stage]
  stageBadge.textContent = item.ota.stage === 'alpha' ? 'ALP' : 'STB'
  versionLine.append(stageBadge)

  if (item.ota.autoUpgrade === false) {
    const autoBadge = document.createElement('span')
    autoBadge.className = 'mm-script-stage-badge mm-script-stage-badge--manual'
    autoBadge.textContent = 'MAN'
    autoBadge.title = 'Auto-upgrade disabled (server policy)'
    versionLine.append(autoBadge)
  }

  if (item.ota.lockedVersion) {
    const lockBadge = document.createElement('span')
    lockBadge.className = 'mm-script-lock-badge'
    lockBadge.textContent = `🔒 ${item.ota.lockedVersion}`
    lockBadge.title = `Fleet-locked to version ${item.ota.lockedVersion}`
    versionLine.append(lockBadge)
  }

  inner.append(versionLine)

  const updatedLabel = formatScriptUpdatedAt(item.updatedAt)
  const updatedInner = document.createElement('span')
  updatedInner.className = 'mm-script-updated'
  updatedInner.textContent = updatedLabel
  inner.append(updatedInner)

  cell.append(inner)
  return cell
}

function applyScriptTooltipPlacement(el: HTMLElement): void {
  el.setAttribute('data-mm-tooltip-placement', 'bottom')
  el.setAttribute('data-mm-tooltip-align', 'center')
  el.setAttribute('data-mm-tooltip-no-flip', '')
}

function setSwitchTooltip(root: HTMLLabelElement, input: HTMLInputElement, item: ScriptRow): void {
  const text = !item.groupActive ? 'Service disabled — enable in Servers' : !item.installed ? 'Install script first' : input.checked ? 'Disable script' : 'Enable script'
  applyScriptTooltipPlacement(root)
  updateMmTooltip(root, text, 'bottom')
  input.setAttribute('aria-label', text)
}

function setOtaSwitchTooltip(root: HTMLLabelElement, input: HTMLInputElement, item: ScriptRow): void {
  const text = !item.groupActive ? 'Service disabled — enable in Servers' : input.checked ? 'Use stable' : 'Use alpha'
  applyScriptTooltipPlacement(root)
  updateMmTooltip(root, text, 'bottom')
  input.setAttribute('aria-label', text)
}

function renderOtaCell(host: MmScriptsRowRenderHost, item: ScriptRow): HTMLDivElement {
  const cell = document.createElement('div')
  cell.className = 'mm-script-cell mm-script-cell--ota'

  const { root: switchRoot, input } = createMmScriptsSwitch({
    variant: 'stable-alpha',
    checked: item.acceptAlpha,
    disabled: !item.groupActive,
  })
  setOtaSwitchTooltip(switchRoot, input, item)
  if (item.groupActive) {
    input.addEventListener('change', () => {
      setOtaSwitchTooltip(switchRoot, input, item)
      void host.handleAcceptAlphaToggle(item.scriptKey, item.file, input.checked)
    })
  }

  cell.append(switchRoot)
  return cell
}

async function applyInstallToggle(host: MmScriptsRowRenderHost, item: ScriptRow, btn: HTMLButtonElement, icon: HTMLElement): Promise<void> {
  if (!item.groupActive) {
    return
  }

  const nextInstalled = !item.installed
  btn.disabled = true
  host.installToggleInProgress = true
  try {
    if (nextInstalled) {
      await setScriptInstalled(item.scriptKey, item.file, true)
      await setScriptEnabled(item.scriptKey, item.file, true, { incognito: host.scriptTogglesIncognito })
      item.installed = true
      item.enabled = true
    } else {
      await setScriptInstalled(item.scriptKey, item.file, false, item.contentHash)
      await setScriptEnabled(item.scriptKey, item.file, false, { incognito: host.scriptTogglesIncognito })
      item.installed = false
      item.enabled = false
    }
    host.enabledByKey.set(host.enabledMapKey(item.scriptKey, item.file), item.enabled)
    host.applyFilters()
    host.toast.show(nextInstalled ? `Installed ${item.file}` : `Uninstalled ${item.file}`, 'success')
  } finally {
    host.installToggleInProgress = false
    btn.disabled = false
    btn.classList.toggle('is-installed', item.installed)
    btn.classList.toggle('is-uninstalled', !item.installed)
    icon.setAttribute('data-icon', item.installed ? 'uninstall' : 'install')
    hydrateMmIcons(btn)
    if (item.installed) {
      btn.setAttribute('aria-label', 'Uninstall script')
      updateMmTooltip(btn, 'Uninstall script', 'bottom')
    } else {
      btn.setAttribute('aria-label', 'Install script')
      updateMmTooltip(btn, 'Install script', 'bottom')
    }
  }
}

function renderInstallButton(host: MmScriptsRowRenderHost, item: ScriptRow): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = `mm-script-install-btn mm-icon-btn-sm ${item.installed ? 'is-installed' : 'is-uninstalled'}`
  btn.disabled = !item.groupActive
  const icon = document.createElement('span')
  icon.className = 'mm-icon-slot'
  icon.setAttribute('data-icon', item.installed ? 'uninstall' : 'install')
  btn.append(icon)

  if (item.installed) {
    btn.setAttribute('aria-label', 'Uninstall script')
    btn.setAttribute('data-mm-tooltip', 'Uninstall script')
  } else {
    btn.setAttribute('aria-label', 'Install script')
    btn.setAttribute('data-mm-tooltip', 'Install script')
  }
  applyScriptTooltipPlacement(btn)

  btn.addEventListener('click', (event) => {
    event.stopPropagation()
    void applyInstallToggle(host, item, btn, icon)
  })

  return btn
}

function renderServiceCell(item: ScriptRow): HTMLDivElement {
  const cell = document.createElement('div')
  cell.className = 'mm-script-cell mm-script-cell--service'

  if (!item.serviceUrl) {
    const inner = document.createElement('span')
    inner.className = 'mm-script-service'
    inner.textContent = item.serviceLabel
    if (item.serviceLabel) {
      inner.title = item.serviceLabel
    }
    cell.append(inner)
    return cell
  }

  const link = document.createElement('a')
  link.className = 'mm-script-service mm-script-service-link'
  link.href = item.serviceUrl
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.textContent = item.serviceLabel || item.serviceUrl
  link.setAttribute('data-mm-tooltip', 'Open service in new tab')
  applyScriptTooltipPlacement(link)
  link.addEventListener('click', (event) => {
    event.stopPropagation()
  })
  cell.append(link)
  return cell
}

function renderRow(host: MmScriptsRowRenderHost, item: ScriptRow, index: number): HTMLElement {
  const row = document.createElement('div')
  row.className = 'mm-script-row'
  row.dataset.scriptKey = item.scriptKey
  row.dataset.scriptFile = item.file
  if (!item.groupActive) {
    row.classList.add('mm-script-row--inactive')
  }

  const indexInner = document.createElement('span')
  indexInner.className = 'mm-script-index'
  indexInner.textContent = String(index + 1)

  const fileInner = document.createElement('span')
  fileInner.className = 'mm-script-file'
  fileInner.textContent = item.file

  const installBtn = renderInstallButton(host, item)

  const rulesLink = document.createElement('button')
  rulesLink.type = 'button'
  rulesLink.className = 'mm-script-rules-link mm-icon-btn-sm'
  rulesLink.setAttribute('aria-label', 'Manage local rules for this script')
  rulesLink.setAttribute('data-mm-tooltip', 'Manage local rules')
  rulesLink.disabled = !item.groupActive || !item.installed
  applyScriptTooltipPlacement(rulesLink)
  const rulesIcon = document.createElement('span')
  rulesIcon.className = 'mm-icon-slot'
  rulesIcon.setAttribute('data-icon', 'rulesManage')
  rulesLink.append(rulesIcon)
  rulesLink.addEventListener('click', (event) => {
    event.stopPropagation()
    navigateExtensionPage(buildRulesPageScriptUrl(item.scriptKey, item.file))
  })

  const actionsCell = document.createElement('div')
  actionsCell.className = 'mm-script-cell mm-script-cell--actions'
  actionsCell.append(rulesLink, installBtn)

  const rowChildren: HTMLElement[] = [
    wrapScriptTextCell('index', indexInner),
    renderNameCell(item),
    wrapScriptTextCell('file', fileInner),
    renderReleaseCell(item),
    renderOtaCell(host, item),
    renderServiceCell(item),
    actionsCell,
  ]

  if (item.installed) {
    const switchDisabled = !item.groupActive
    const { root: switchRoot, input } = createMmScriptsSwitch({ variant: 'on-off', checked: item.enabled, disabled: switchDisabled })
    setSwitchTooltip(switchRoot, input, item)
    rowChildren.push(switchRoot)

    if (item.groupActive) {
      const applyToggle = (): void => {
        void (async () => {
          const enabled = input.checked
          await setScriptEnabled(item.scriptKey, item.file, enabled, { incognito: host.scriptTogglesIncognito })
          host.enabledByKey.set(host.enabledMapKey(item.scriptKey, item.file), enabled)
          item.enabled = enabled
          setSwitchTooltip(switchRoot, input, item)
          host.applyFilters()
          host.toast.show(enabled ? `Enabled ${item.file}` : `Disabled ${item.file}`, 'success')
        })()
      }

      input.addEventListener('change', applyToggle)
    }
  }

  row.append(...rowChildren)

  return row
}

/** Append script rows for a partition (installed or uninstalled) into a fragment. */
export function renderGroupRows(host: MmScriptsRowRenderHost, rows: ScriptRow[], startIndex: number): DocumentFragment {
  const fragment = document.createDocumentFragment()
  for (let offset = 0; offset < rows.length; offset++) {
    fragment.appendChild(renderRow(host, rows[offset], startIndex + offset))
  }
  return fragment
}
