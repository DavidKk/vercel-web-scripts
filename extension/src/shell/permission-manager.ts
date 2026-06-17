import {
  buildScriptPermissionRegistryKey,
  createEmptyScriptPermissionRegistry,
  DEFAULT_PERMISSION_PROMPT_TIMEOUT_MS,
  normalizePermissionNetworkHost,
  parseScriptPermissionRegistryKey,
  PERMISSION_BATCH_DEBOUNCE_MS,
  resolvePersistentPermissionDecision,
  type ScriptPermissionAdminPolicy,
  type ScriptPermissionContext,
  type ScriptPermissionDecision,
  type ScriptPermissionRemember,
  type ScriptPermissionRequest,
  TRUST_TIER1_PERMISSION_SEEDS,
} from '@shared/script-permission'

import { getEnabledScriptKeys, getPermissionModeForScriptKey, normalizeScriptKey } from '../shared/extension-services'
import { loadManagedScriptListFromCacheForScriptKey } from '../shared/extension-storage/script-list-cache'
import {
  appendScriptPermissionHistoryEntries,
  listPermissionHistoryRows,
  readScriptPermissionHistory,
  type ScriptPermissionHistoryEntry,
  writeScriptPermissionHistory,
} from '../shared/extension-storage/script-permission-history'
import {
  readScriptPermissionRegistry,
  removePersistentPermissionEntryByKey,
  upsertPersistentPermissionEntry,
  writeScriptPermissionRegistry,
} from '../shared/extension-storage/script-permission-registry'
import {
  applyScriptPermissionSessionSnapshot,
  createEmptyScriptPermissionSessionSnapshot,
  readScriptPermissionSessionSnapshot,
  snapshotFromSessionPermissionMaps,
  writeScriptPermissionSessionSnapshot,
} from '../shared/extension-storage/script-permission-session'
import { ensureExtensionServicesState, loadPermissionModeForScriptKey } from '../shared/extension-storage/services-state'
import { permissionLogger } from '../shared/logger'

export const PERMISSION_MODAL_MESSAGE_TYPE = 'VWS_PERMISSION_MODAL_SHOW'
export const PERMISSION_MODAL_RESULT_MESSAGE_TYPE = 'VWS_PERMISSION_MODAL_RESULT'
export const PERMISSION_REGISTRY_CHANGED_MESSAGE_TYPE = 'VWS_PERMISSION_REGISTRY_CHANGED'
/** Dispatched on extension admin pages when background injects modal via scripting API. */
export const PERMISSION_MODAL_WINDOW_EVENT = 'vws-permission-modal-show'

export interface SessionPermissionEntry {
  tabId: number
  key: string
  request: ScriptPermissionRequest | null
  decision: ScriptPermissionDecision
}

export interface PermissionModalItem {
  requestId: string
  scriptKey: string
  file: string
  capability: ScriptPermissionRequest['capability']
  resource: string
  label: string
}

export interface PermissionModalShowPayload {
  batchId: string
  items: PermissionModalItem[]
}

export interface PermissionModalResultPayload {
  batchId: string
  decisions: Array<{
    requestId: string
    decision: ScriptPermissionDecision
    remember: ScriptPermissionRemember
  }>
}

interface PendingPermission {
  request: ScriptPermissionRequest
  requestId: string
  tabId: number
  resolve: (allowed: boolean) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface PermissionBatch {
  batchId: string
  tabId: number
  items: PermissionModalItem[]
  waiters: Map<string, PendingPermission>
  flushTimer: ReturnType<typeof setTimeout> | null
}

function requestKey(request: ScriptPermissionRequest): string {
  return buildScriptPermissionRegistryKey(request.scriptKey, request.file, request.capability, request.resource)
}

function buildModalLabel(request: ScriptPermissionRequest): string {
  return `${request.file} — ${request.capability} — ${request.resource}`
}

const sessionAllowKeys = new Map<number, Set<string>>()
const sessionDenyKeys = new Map<number, Set<string>>()
const inFlightByTabAndKey = new Map<string, Promise<boolean>>()
const batchesByTab = new Map<number, PermissionBatch>()
/** Present permission UI on another tab (e.g. admin) while decisions apply to targetTabId. */
const modalRelayByTargetTab = new Map<number, number>()
let batchSeq = 0

/** Show permission modal on presentationTabId while session/registry use targetTabId. */
export function setPermissionModalRelay(targetTabId: number, presentationTabId: number): void {
  modalRelayByTargetTab.set(targetTabId, presentationTabId)
}

export function clearPermissionModalRelay(targetTabId: number): void {
  modalRelayByTargetTab.delete(targetTabId)
}

function resolvePermissionModalPresentationTabId(targetTabId: number): number {
  return modalRelayByTargetTab.get(targetTabId) ?? targetTabId
}

function sessionSet(map: Map<number, Set<string>>, tabId: number, key: string): void {
  const set = map.get(tabId) ?? new Set<string>()
  set.add(key)
  map.set(tabId, set)
}

async function persistSessionPermissions(): Promise<void> {
  await writeScriptPermissionSessionSnapshot(snapshotFromSessionPermissionMaps(sessionAllowKeys, sessionDenyKeys))
}

/** Restore per-tab session grants from `chrome.storage.session` after service worker wake. */
export async function hydrateScriptPermissionSession(): Promise<void> {
  const snapshot = await readScriptPermissionSessionSnapshot()
  applyScriptPermissionSessionSnapshot(snapshot, sessionAllowKeys, sessionDenyKeys)
}

function inFlightKey(tabId: number, key: string): string {
  return `${tabId}:${key}`
}

export function clearSessionPermissionsForTab(tabId: number): void {
  sessionAllowKeys.delete(tabId)
  sessionDenyKeys.delete(tabId)
  const batch = batchesByTab.get(tabId)
  if (batch) {
    if (batch.flushTimer) {
      clearTimeout(batch.flushTimer)
    }
    for (const pending of batch.waiters.values()) {
      rejectPending(pending, new Error('Tab closed'))
    }
    batchesByTab.delete(tabId)
  }
  void persistSessionPermissions()
}

function resolvePending(pending: PendingPermission, allowed: boolean): void {
  clearTimeout(pending.timer)
  pending.resolve(allowed)
}

function rejectPending(pending: PendingPermission, error: Error): void {
  clearTimeout(pending.timer)
  pending.reject(error)
}

async function resolveFromStores(tabId: number, request: ScriptPermissionRequest): Promise<ScriptPermissionDecision | undefined> {
  const key = requestKey(request)
  if (sessionDenyKeys.get(tabId)?.has(key)) {
    return 'deny'
  }
  if (sessionAllowKeys.get(tabId)?.has(key)) {
    return 'allow'
  }
  const registry = await readScriptPermissionRegistry()
  return resolvePersistentPermissionDecision(registry, request)
}

/** Auto-allow under Servers → Full trust; records registry + history for Admin → Permissions. */
async function grantTrustedPermission(tabId: number, request: ScriptPermissionRequest): Promise<boolean> {
  const key = requestKey(request)
  const hadSessionAllow = sessionAllowKeys.get(tabId)?.has(key) === true
  sessionSet(sessionAllowKeys, tabId, key)
  sessionDenyKeys.get(tabId)?.delete(key)

  let registry = await readScriptPermissionRegistry()
  const existing = registry.entries[key]
  const needsRegistry = !existing || existing.decision !== 'allow' || existing.adminPolicy === 'ask' || existing.adminPolicy === 'deny'
  if (needsRegistry) {
    registry = upsertPersistentPermissionEntry(registry, request, 'allow', request.contentHash, 'allow')
    await writeScriptPermissionRegistry(registry)
    await appendScriptPermissionHistoryEntries([
      {
        id: `trust:${key}:${Date.now()}`,
        tabId,
        key,
        request,
        decision: 'allow',
        remember: 'persistent',
        decidedAt: Date.now(),
      },
    ])
    void chrome.runtime.sendMessage({ type: PERMISSION_REGISTRY_CHANGED_MESSAGE_TYPE }).catch(() => undefined)
  }

  if (!hadSessionAllow || needsRegistry) {
    await persistSessionPermissions()
  }
  return true
}

/** Allow registry keys for a tab (session allows + persistent registry allows + Full trust preflight). */
export async function listAllowedPermissionKeysForTab(tabId: number): Promise<string[]> {
  const keys = new Set<string>()
  const sessionAllow = sessionAllowKeys.get(tabId)
  if (sessionAllow) {
    for (const key of sessionAllow) {
      keys.add(key)
    }
  }
  const registry = await readScriptPermissionRegistry()
  for (const [key] of Object.entries(registry.entries)) {
    const request = parseScriptPermissionRegistryKey(key)
    if (!request) {
      continue
    }
    if (resolvePersistentPermissionDecision(registry, request) === 'allow') {
      keys.add(key)
    }
  }
  await appendTrustModeAllowKeys(keys)
  return [...keys]
}

async function appendTrustModeAllowKeys(keys: Set<string>): Promise<void> {
  const state = await ensureExtensionServicesState()
  for (const scriptKey of getEnabledScriptKeys(state.services)) {
    const normalized = normalizeScriptKey(scriptKey)
    if (!normalized || getPermissionModeForScriptKey(normalized, state.scriptKeyMeta) !== 'trust') {
      continue
    }
    const scripts = await loadManagedScriptListFromCacheForScriptKey(normalized)
    const files = scripts.map((row) => row.file).filter(Boolean)
    if (files.length === 0) {
      continue
    }
    for (const file of files) {
      for (const seed of TRUST_TIER1_PERMISSION_SEEDS) {
        keys.add(buildScriptPermissionRegistryKey(normalized, file, seed.capability, seed.resource))
      }
    }
  }
}

/** Wipe persistent registry, all tab session grants, history, and in-flight prompts. */
export async function clearAllScriptPermissions(): Promise<void> {
  const tabIds = new Set<number>([...sessionAllowKeys.keys(), ...sessionDenyKeys.keys(), ...batchesByTab.keys()])
  for (const tabId of tabIds) {
    const batch = batchesByTab.get(tabId)
    if (batch) {
      if (batch.flushTimer) {
        clearTimeout(batch.flushTimer)
      }
      for (const pending of batch.waiters.values()) {
        rejectPending(pending, new Error('Permissions cleared'))
      }
      batchesByTab.delete(tabId)
    }
    clearPermissionModalRelay(tabId)
  }
  sessionAllowKeys.clear()
  sessionDenyKeys.clear()
  inFlightByTabAndKey.clear()
  await writeScriptPermissionSessionSnapshot(createEmptyScriptPermissionSessionSnapshot())
  await writeScriptPermissionRegistry(createEmptyScriptPermissionRegistry())
  await writeScriptPermissionHistory({ version: 1, entries: [] })
  void chrome.runtime.sendMessage({ type: PERMISSION_REGISTRY_CHANGED_MESSAGE_TYPE }).catch(() => undefined)
}

/** Deliver permission modal to a tab (http via content script; extension pages via scripting). */
async function deliverPermissionModal(tabId: number, payload: PermissionModalShowPayload): Promise<void> {
  const presentationTabId = resolvePermissionModalPresentationTabId(tabId)
  const tab = await chrome.tabs.get(presentationTabId)
  const extensionRoot = chrome.runtime.getURL('')
  if (tab.url?.startsWith(extensionRoot)) {
    permissionLogger.info('modal:deliver', { tabId: presentationTabId, via: 'scripting-main', batchId: payload.batchId })
    await chrome.scripting.executeScript({
      target: { tabId: presentationTabId },
      world: 'MAIN',
      func: (eventName: string, detail: PermissionModalShowPayload) => {
        window.dispatchEvent(new CustomEvent(eventName, { detail }))
      },
      args: [PERMISSION_MODAL_WINDOW_EVENT, payload],
    })
    return
  }
  try {
    await chrome.tabs.sendMessage(presentationTabId, {
      type: PERMISSION_MODAL_MESSAGE_TYPE,
      payload,
    })
    permissionLogger.info('modal:deliver', { tabId: presentationTabId, via: 'sendMessage', batchId: payload.batchId })
  } catch (error) {
    permissionLogger.warn('modal:sendMessage-failed', {
      tabId: presentationTabId,
      batchId: payload.batchId,
      error: error instanceof Error ? error.message : String(error),
    })
    await chrome.scripting.executeScript({
      target: { tabId: presentationTabId },
      world: 'ISOLATED',
      func: (eventName: string, detail: PermissionModalShowPayload) => {
        window.dispatchEvent(new CustomEvent(eventName, { detail }))
      },
      args: [PERMISSION_MODAL_WINDOW_EVENT, payload],
    })
    permissionLogger.info('modal:deliver', { tabId: presentationTabId, via: 'scripting-isolated', batchId: payload.batchId })
  }
}

async function flushBatch(tabId: number): Promise<void> {
  const batch = batchesByTab.get(tabId)
  if (!batch || batch.items.length === 0) {
    return
  }
  if (batch.flushTimer) {
    clearTimeout(batch.flushTimer)
    batch.flushTimer = null
  }

  try {
    await deliverPermissionModal(tabId, {
      batchId: batch.batchId,
      items: batch.items,
    })
  } catch (error) {
    permissionLogger.warn('modal:deliver-failed', {
      tabId,
      batchId: batch.batchId,
      error: error instanceof Error ? error.message : String(error),
    })
    for (const pending of batch.waiters.values()) {
      rejectPending(pending, new Error('Permission modal unavailable'))
    }
    batchesByTab.delete(tabId)
    clearPermissionModalRelay(tabId)
  }
}

function queueForPrompt(tabId: number, pending: PendingPermission): void {
  let batch = batchesByTab.get(tabId)
  if (!batch) {
    batch = {
      batchId: `perm-${++batchSeq}`,
      tabId,
      items: [],
      waiters: new Map(),
      flushTimer: null,
    }
    batchesByTab.set(tabId, batch)
  }

  batch.waiters.set(pending.requestId, pending)
  if (!batch.items.some((item) => item.requestId === pending.requestId)) {
    batch.items.push({
      requestId: pending.requestId,
      scriptKey: pending.request.scriptKey,
      file: pending.request.file,
      capability: pending.request.capability,
      resource: pending.request.resource,
      label: buildModalLabel(pending.request),
    })
  }

  const flushImmediately = batch.items.length === 1
  if (batch.flushTimer) {
    clearTimeout(batch.flushTimer)
    batch.flushTimer = null
  }
  permissionLogger.info('prompt:queued', {
    tabId,
    batchId: batch.batchId,
    itemCount: batch.items.length,
    flushImmediately,
    file: pending.request.file,
    capability: pending.request.capability,
    resource: pending.request.resource,
  })
  if (flushImmediately) {
    void flushBatch(tabId)
    return
  }
  batch.flushTimer = setTimeout(() => {
    void flushBatch(tabId)
  }, PERMISSION_BATCH_DEBOUNCE_MS)
}

async function promptForPermission(tabId: number, request: ScriptPermissionRequest): Promise<boolean> {
  const key = requestKey(request)
  const flightKey = inFlightKey(tabId, key)
  const existing = inFlightByTabAndKey.get(flightKey)
  if (existing) {
    return existing
  }

  const promise = new Promise<boolean>((resolve, reject) => {
    const requestId = `${key}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
    const pending: PendingPermission = {
      request,
      requestId,
      tabId,
      resolve,
      reject,
      timer: setTimeout(() => {
        inFlightByTabAndKey.delete(flightKey)
        reject(new Error('Permission prompt timeout'))
      }, DEFAULT_PERMISSION_PROMPT_TIMEOUT_MS),
    }
    queueForPrompt(tabId, pending)
  })

  inFlightByTabAndKey.set(flightKey, promise)
  try {
    return await promise
  } finally {
    inFlightByTabAndKey.delete(flightKey)
  }
}

/** Full permission audit log (all modal captures and admin edits). */
export async function listPermissionHistoryEntries(): Promise<ScriptPermissionHistoryEntry[]> {
  const history = await readScriptPermissionHistory()
  return listPermissionHistoryRows(history)
}

/** Whether a history row still matches an enforceable registry/session grant. */
export function isPermissionHistoryEntryEnforceable(
  entry: ScriptPermissionHistoryEntry,
  registry: Awaited<ReturnType<typeof readScriptPermissionRegistry>>,
  sessionEntries: SessionPermissionEntry[]
): boolean {
  if (entry.remember === 'persistent') {
    const active = registry.entries[entry.key]
    if (!active || active.adminPolicy === 'ask') {
      return false
    }
    const enforced = active.adminPolicy ?? active.decision
    return enforced === entry.decision
  }
  if (entry.remember === 'session') {
    return sessionEntries.some((row) => row.tabId === entry.tabId && row.key === entry.key && row.decision === entry.decision)
  }
  return false
}

export function listSessionPermissionEntries(): SessionPermissionEntry[] {
  const rows: SessionPermissionEntry[] = []
  for (const [tabId, keys] of sessionAllowKeys.entries()) {
    for (const key of keys) {
      rows.push({ tabId, key, request: parseScriptPermissionRegistryKey(key), decision: 'allow' })
    }
  }
  for (const [tabId, keys] of sessionDenyKeys.entries()) {
    for (const key of keys) {
      rows.push({ tabId, key, request: parseScriptPermissionRegistryKey(key), decision: 'deny' })
    }
  }
  rows.sort((a, b) => a.tabId - b.tabId)
  return rows
}

export async function ensureScriptPermissionForTab(tabId: number, request: ScriptPermissionRequest, options?: { forcePrompt?: boolean }): Promise<boolean> {
  if (!options?.forcePrompt) {
    const permissionMode = await loadPermissionModeForScriptKey(request.scriptKey)
    if (permissionMode === 'trust') {
      permissionLogger.debug('ensure:trust-auto-allow', { tabId, file: request.file, capability: request.capability, resource: request.resource })
      return grantTrustedPermission(tabId, request)
    }
    const stored = await resolveFromStores(tabId, request)
    if (stored === 'allow') {
      permissionLogger.debug('ensure:cached-allow', { tabId, file: request.file, capability: request.capability })
      return true
    }
    if (stored === 'deny') {
      permissionLogger.debug('ensure:cached-deny', { tabId, file: request.file, capability: request.capability })
      return false
    }
  }
  permissionLogger.info('ensure:prompt', { tabId, file: request.file, capability: request.capability, resource: request.resource })
  const allowed = await promptForPermission(tabId, request)
  permissionLogger.info('ensure:resolved', { tabId, file: request.file, capability: request.capability, allowed })
  return allowed
}

export async function applyPermissionModalResult(payload: PermissionModalResultPayload): Promise<void> {
  const tabIds = [...batchesByTab.entries()].filter(([, batch]) => batch.batchId === payload.batchId).map(([tabId]) => tabId)
  if (tabIds.length === 0) {
    return
  }
  const tabId = tabIds[0]
  const batch = batchesByTab.get(tabId)
  if (!batch) {
    return
  }

  let registry = await readScriptPermissionRegistry()
  let registryDirty = false
  let sessionDirty = false
  const resolved = new Set<string>()
  const historyEntries: ScriptPermissionHistoryEntry[] = []
  const decidedAt = Date.now()
  for (const row of payload.decisions) {
    const pending = batch.waiters.get(row.requestId)
    if (!pending) {
      continue
    }
    resolved.add(row.requestId)
    const key = requestKey(pending.request)
    historyEntries.push({
      id: `${row.requestId}:${decidedAt}`,
      tabId,
      key,
      request: pending.request,
      decision: row.decision,
      remember: row.remember,
      decidedAt,
    })
    if (row.decision === 'allow') {
      if (row.remember === 'persistent') {
        registry = upsertPersistentPermissionEntry(registry, pending.request, 'allow', pending.request.contentHash)
        registryDirty = true
      } else if (row.remember === 'session') {
        sessionSet(sessionAllowKeys, tabId, key)
        sessionDirty = true
      }
      resolvePending(pending, true)
      continue
    }
    if (row.remember === 'persistent') {
      registry = upsertPersistentPermissionEntry(registry, pending.request, 'deny', pending.request.contentHash)
      registryDirty = true
    } else if (row.remember === 'session') {
      sessionSet(sessionDenyKeys, tabId, key)
      sessionDirty = true
    }
    resolvePending(pending, false)
  }

  if (registryDirty) {
    await writeScriptPermissionRegistry(registry)
  }

  if (sessionDirty) {
    await persistSessionPermissions()
  }

  for (const [requestId, pending] of batch.waiters.entries()) {
    if (resolved.has(requestId)) {
      continue
    }
    historyEntries.push({
      id: `dismissed:${requestId}:${decidedAt}`,
      tabId,
      key: requestKey(pending.request),
      request: pending.request,
      decision: 'deny',
      remember: 'once',
      decidedAt,
    })
    rejectPending(pending, new Error('Permission prompt dismissed'))
  }

  if (historyEntries.length > 0) {
    await appendScriptPermissionHistoryEntries(historyEntries)
  }

  void chrome.runtime.sendMessage({ type: PERMISSION_REGISTRY_CHANGED_MESSAGE_TYPE }).catch(() => undefined)

  batchesByTab.delete(tabId)
  clearPermissionModalRelay(tabId)
}

/** Remove a session-scoped permission entry for a tab (admin revoke). */
export function removeSessionPermissionByKey(tabId: number, key: string): boolean {
  let removed = false
  const allow = sessionAllowKeys.get(tabId)
  if (allow?.delete(key)) {
    removed = true
    if (allow.size === 0) {
      sessionAllowKeys.delete(tabId)
    }
  }
  const deny = sessionDenyKeys.get(tabId)
  if (deny?.delete(key)) {
    removed = true
    if (deny.size === 0) {
      sessionDenyKeys.delete(tabId)
    }
  }
  if (removed) {
    void persistSessionPermissions()
  }
  return removed
}

/** Remove a session-scoped permission entry from every open tab. */
export function removeSessionPermissionByKeyAllTabs(key: string): boolean {
  const tabIds = new Set<number>([...sessionAllowKeys.keys(), ...sessionDenyKeys.keys()])
  let removed = false
  for (const tabId of tabIds) {
    if (removeSessionPermissionByKey(tabId, key)) {
      removed = true
    }
  }
  return removed
}

async function resolveAdminSessionTabId(preferredTabId?: number): Promise<number> {
  if (preferredTabId != null) {
    return preferredTabId
  }
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  if (tab?.id == null) {
    throw new Error('No active tab for this-tab permission')
  }
  return tab.id
}

export interface AdminScriptPermissionUpdate {
  registryKey: string
  request: ScriptPermissionRequest
  policy?: ScriptPermissionAdminPolicy
  scope: 'persistent' | 'session'
  tabId?: number
  decision: ScriptPermissionDecision
}

/** Apply an admin override for script permission scope and decision. */
export async function updateAdminScriptPermissionEntry(update: AdminScriptPermissionUpdate): Promise<void> {
  await updateAdminScriptPermissionEntriesBatch([update])
}

/** Apply multiple admin permission overrides in one registry read/write (avoids parallel update races). */
export async function updateAdminScriptPermissionEntriesBatch(updates: readonly AdminScriptPermissionUpdate[]): Promise<void> {
  if (updates.length === 0) {
    return
  }

  let registry = await readScriptPermissionRegistry()
  const historyEntries: ScriptPermissionHistoryEntry[] = []
  const decidedAt = Date.now()
  let sessionDirty = false

  for (const [index, update] of updates.entries()) {
    const parsed = parseScriptPermissionRegistryKey(update.registryKey)
    if (!parsed) {
      throw new Error('Invalid permission key')
    }

    if (removeSessionPermissionByKeyAllTabs(update.registryKey)) {
      sessionDirty = true
    }

    if (update.policy != null) {
      const decision: ScriptPermissionDecision = update.policy === 'deny' ? 'deny' : 'allow'
      registry = upsertPersistentPermissionEntry(registry, update.request, decision, update.request.contentHash, update.policy)
      historyEntries.push({
        id: `admin:${update.registryKey}:${decidedAt}:${index}`,
        tabId: 0,
        key: update.registryKey,
        request: update.request,
        decision,
        remember: 'persistent',
        decidedAt,
      })
      continue
    }

    registry = removePersistentPermissionEntryByKey(registry, update.registryKey)

    if (update.scope === 'persistent') {
      registry = upsertPersistentPermissionEntry(registry, update.request, update.decision, update.request.contentHash)
    }

    if (update.scope === 'session') {
      const sessionTabId = await resolveAdminSessionTabId(update.tabId)
      if (update.decision === 'allow') {
        sessionSet(sessionAllowKeys, sessionTabId, update.registryKey)
      } else {
        sessionSet(sessionDenyKeys, sessionTabId, update.registryKey)
      }
      sessionDirty = true
      historyEntries.push({
        id: `admin:${update.registryKey}:${decidedAt}:${index}`,
        tabId: sessionTabId,
        key: update.registryKey,
        request: update.request,
        decision: update.decision,
        remember: 'session',
        decidedAt,
      })
    }
  }

  await writeScriptPermissionRegistry(registry)
  if (sessionDirty) {
    await persistSessionPermissions()
  }
  if (historyEntries.length > 0) {
    await appendScriptPermissionHistoryEntries(historyEntries)
  }
  void chrome.runtime.sendMessage({ type: PERMISSION_REGISTRY_CHANGED_MESSAGE_TYPE }).catch(() => undefined)
}

/**
 * Pre-authorize @connect hosts for the current tab session (Tampermonkey-style).
 * Skips wildcard patterns other than `*`. Under Full trust, also records persistent allows.
 */
export async function seedSessionConnectAllows(tabId: number, context: ScriptPermissionContext, connects: readonly string[]): Promise<void> {
  const permissionMode = await loadPermissionModeForScriptKey(context.scriptKey)
  let changed = false
  for (const connect of connects) {
    const raw = connect.trim()
    if (!raw) {
      continue
    }
    if (raw === '*') {
      const request: ScriptPermissionRequest = { ...context, capability: 'network', resource: '*' }
      if (permissionMode === 'trust') {
        await grantTrustedPermission(tabId, request)
      } else {
        sessionSet(sessionAllowKeys, tabId, buildScriptPermissionRegistryKey(context.scriptKey, context.file, 'network', '*'))
        changed = true
      }
      continue
    }
    if (raw.includes('*')) {
      continue
    }
    const resource = normalizePermissionNetworkHost(raw)
    if (!resource) {
      continue
    }
    const request: ScriptPermissionRequest = { ...context, capability: 'network', resource }
    if (permissionMode === 'trust') {
      await grantTrustedPermission(tabId, request)
    } else {
      sessionSet(sessionAllowKeys, tabId, buildScriptPermissionRegistryKey(context.scriptKey, context.file, 'network', resource))
      changed = true
    }
  }
  if (changed) {
    await persistSessionPermissions()
  }
}

/**
 * Pre-authorize tier-1 capabilities for Full trust (background session + registry).
 * @returns Registry keys granted for page-world cache hydration
 */
export async function seedTrustedTier1Permissions(tabId: number, context: ScriptPermissionContext): Promise<string[]> {
  const permissionMode = await loadPermissionModeForScriptKey(context.scriptKey)
  if (permissionMode !== 'trust') {
    return []
  }
  const grantedKeys: string[] = []
  for (const seed of TRUST_TIER1_PERMISSION_SEEDS) {
    const request: ScriptPermissionRequest = { ...context, capability: seed.capability, resource: seed.resource }
    await grantTrustedPermission(tabId, request)
    grantedKeys.push(buildScriptPermissionRegistryKey(context.scriptKey, context.file, seed.capability, seed.resource))
  }
  return grantedKeys
}
