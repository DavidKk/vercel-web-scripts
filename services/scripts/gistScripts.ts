import { createHash } from 'crypto'
import * as ts from 'typescript'

import { EXCLUDED_FILES, isManagedScriptFilename, SCRIPT_INDEX_FILE } from '@/constants/file'
import { fetchGist, getGistInfo, readGistFile, writeGistFiles } from '@/services/gist'
import {
  buildReleaseSnapshotPath,
  LEGACY_SCRIPT_OTA_DEFAULTS,
  NEW_SCRIPT_OTA_DEFAULTS,
  resolveRuntimeOtaPolicy,
  resolveScriptOtaPolicy,
  type RuntimeOtaPolicy,
  type ScriptOtaPolicy,
} from '@/shared/script-ota-policy'
import { isScriptSemverVersion, isStrictSemverVersion } from '@/shared/semver-compare'

/** Metadata for one script file in the backing Gist */
export interface ScriptFileMeta {
  /** File name in the Gist */
  filename: string
  /** UTF-8 byte length of content */
  byteLength: number
  /** SHA-256 content hash used by the generated script index */
  contentHash?: string
  /** Userscript @name */
  name?: string
  /** Userscript @description */
  description?: string
  /** Userscript @version */
  version?: string
  /** Userscript @run-at */
  runAt?: string
  /** Userscript @icon */
  icon?: string
  /** Userscript @author */
  author?: string
  /** Userscript @match values */
  match?: string[]
  /** Other Gist filenames that must load before this module (Phase D). */
  dependsOn?: string[]
  /** Userscript @grant values */
  grants?: string[]
  /** Userscript @connect values */
  connect?: string[]
  /** Human-maintained search aliases preserved from the index */
  aliases?: string[]
  /** Human-maintained search keywords preserved from the index */
  keywords?: string[]
  /** Last content change time for this file (epoch ms) */
  updatedAt?: number
  /** SERVER OTA publish policy */
  ota?: ScriptOtaPolicy
}

/** Result of listing script files */
export interface ListScriptFilesResult {
  /** Script files eligible for integration CRUD */
  files: ScriptFileMeta[]
  /** Gist `updated_at` as epoch ms */
  gistUpdatedAt: number
}

export interface ScriptSearchMatch {
  filename: string
  line: number
  column: number
  text: string
  before: string[]
  after: string[]
}

export interface ScriptSearchOptions {
  query: string
  filename?: string
  regex?: boolean
  caseSensitive?: boolean
  contextLines?: number
  maxResults?: number
}

export interface ScriptFindOptions {
  query: string
  caseSensitive?: boolean
  maxResults?: number
}

export interface ScriptFindResult {
  filename: string
  score: number
  reasons: string[]
  script: ScriptFileMeta
}

export interface ScriptIndexMetadataOptions {
  filename: string
  aliases?: string[]
  keywords?: string[]
  ota?: Partial<ScriptOtaPolicy>
}

export interface ScriptIndexFile {
  version: 1
  updatedAt: string
  runtime?: RuntimeOtaPolicy
  scripts: ScriptFileMeta[]
}

type ManualScriptIndexMeta = Pick<ScriptFileMeta, 'aliases' | 'keywords' | 'ota'>

export interface ScriptSnippetOptions {
  filename: string
  startLine: number
  endLine: number
}

export interface ScriptReplaceOptions {
  filename: string
  search: string
  replace: string
  regex?: boolean
  caseSensitive?: boolean
  expectedCount?: number
  validate?: boolean
}

export type ScriptPatchOperation =
  | {
      type: 'replace'
      search: string
      replace: string
      expectedCount?: number
    }
  | {
      type: 'insertBefore' | 'insertAfter'
      search: string
      text: string
      expectedCount?: number
    }

export interface ScriptPatchOptions {
  filename: string
  operations: ScriptPatchOperation[]
  validate?: boolean
}

export interface ScriptBatchPatchOptions {
  files: ScriptPatchOptions[]
  validate?: boolean
  atomic?: boolean
}

export interface ScriptValidationResult {
  ok: boolean
  filename?: string
  header: {
    openCount: number
    closeCount: number
  }
  diagnostics: string[]
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

function parseUserscriptHeader(content: string): Omit<ScriptFileMeta, 'filename' | 'byteLength' | 'contentHash' | 'aliases' | 'keywords'> {
  const open = content.indexOf('// ==UserScript==')
  const close = content.indexOf('// ==/UserScript==')
  if (open === -1 || close === -1 || close < open) {
    return {}
  }

  const metadata: Omit<ScriptFileMeta, 'filename' | 'byteLength' | 'contentHash' | 'aliases' | 'keywords'> = {}
  const match: string[] = []
  const grants: string[] = []
  const connect: string[] = []
  const header = content.slice(open, close).split('\n')

  for (const line of header) {
    const matched = line.match(/^\s*\/\/\s*@([\w:-]+)\s*(.*)$/)
    if (!matched) continue

    const key = matched[1]
    const value = matched[2].trim()
    if (!value) continue

    if (key === 'name') {
      metadata.name = value
    } else if (key === 'description') {
      metadata.description = value
    } else if (key === 'version') {
      metadata.version = value
    } else if (key === 'run-at') {
      metadata.runAt = value
    } else if (key === 'icon') {
      metadata.icon = value
    } else if (key === 'author') {
      metadata.author = value
    } else if (key === 'match') {
      match.push(value)
    } else if (key === 'grant') {
      grants.push(value)
    } else if (key === 'connect') {
      connect.push(value)
    }
  }

  if (match.length > 0) metadata.match = uniqueSorted(match)
  if (grants.length > 0) metadata.grants = uniqueSorted(grants)
  if (connect.length > 0) metadata.connect = uniqueSorted(connect)

  return metadata
}

function parsePreviousScriptIndexEntries(content?: string): Map<string, Pick<ScriptFileMeta, 'contentHash' | 'updatedAt' | 'ota'>> {
  if (!content) {
    return new Map()
  }

  try {
    const parsed = JSON.parse(content) as Partial<ScriptIndexFile>
    if (!Array.isArray(parsed.scripts)) {
      return new Map()
    }

    return new Map(
      parsed.scripts
        .filter((script) => typeof script.filename === 'string')
        .map((script) => [
          script.filename,
          {
            contentHash: typeof script.contentHash === 'string' ? script.contentHash : undefined,
            updatedAt: typeof script.updatedAt === 'number' && Number.isFinite(script.updatedAt) ? script.updatedAt : undefined,
            ota: script.ota && typeof script.ota === 'object' ? resolveScriptOtaPolicy(script.ota as Partial<ScriptOtaPolicy>) : undefined,
          },
        ])
    )
  } catch {
    return new Map()
  }
}

/**
 * Build a filename → updatedAt map from persisted script index JSON.
 * @param indexContent Raw `magickmonkey.scripts.index.json` content
 * @param gistUpdatedAtMs Gist-level fallback when a row has no per-file timestamp
 */
export function buildScriptUpdatedAtMapFromIndexContent(indexContent: string | undefined, gistUpdatedAtMs: number): Map<string, number> {
  const fallback = Number.isFinite(gistUpdatedAtMs) ? gistUpdatedAtMs : 0
  const map = new Map<string, number>()
  if (!indexContent) {
    return map
  }

  try {
    const parsed = JSON.parse(indexContent) as Partial<ScriptIndexFile>
    if (!Array.isArray(parsed.scripts)) {
      return map
    }

    for (const script of parsed.scripts) {
      if (typeof script.filename !== 'string') {
        continue
      }
      const updatedAt = typeof script.updatedAt === 'number' && Number.isFinite(script.updatedAt) ? script.updatedAt : fallback
      map.set(script.filename, updatedAt)
    }
  } catch {
    /* ignore malformed index */
  }

  return map
}

export interface ScriptDisplayMeta {
  name?: string
  description?: string
  icon?: string
  version?: string
  author?: string
  contentHash?: string
}

/**
 * Build filename → display metadata map from persisted script index JSON.
 * @param indexContent Raw `magickmonkey.scripts.index.json` content
 */
export function buildScriptDisplayMetaByFilenameFromIndexContent(indexContent: string | undefined): Map<string, ScriptDisplayMeta> {
  const map = new Map<string, ScriptDisplayMeta>()
  if (!indexContent) {
    return map
  }

  try {
    const parsed = JSON.parse(indexContent) as Partial<ScriptIndexFile>
    if (!Array.isArray(parsed.scripts)) {
      return map
    }

    for (const script of parsed.scripts) {
      if (typeof script.filename !== 'string') {
        continue
      }
      const normalized = normalizeScriptIndexEntry(script as ScriptFileMeta & { matches?: string[]; connects?: string[] })
      const meta: ScriptDisplayMeta = {}
      if (typeof normalized.name === 'string' && normalized.name.trim()) {
        meta.name = normalized.name.trim()
      }
      if (typeof normalized.description === 'string' && normalized.description.trim()) {
        meta.description = normalized.description.trim()
      }
      if (typeof normalized.icon === 'string' && normalized.icon.trim()) {
        meta.icon = normalized.icon.trim()
      }
      if (typeof normalized.version === 'string' && normalized.version.trim()) {
        meta.version = normalized.version.trim()
      }
      if (typeof normalized.author === 'string' && normalized.author.trim()) {
        meta.author = normalized.author.trim()
      }
      if (typeof normalized.contentHash === 'string' && normalized.contentHash.trim()) {
        meta.contentHash = normalized.contentHash.trim()
      }
      if (Object.keys(meta).length > 0) {
        map.set(script.filename, meta)
      }
    }
  } catch {
    /* ignore malformed index */
  }

  return map
}

function parseScriptIndex(content?: string): Map<string, ManualScriptIndexMeta> {
  if (!content) {
    return new Map()
  }

  try {
    const parsed = JSON.parse(content) as Partial<ScriptIndexFile>
    if (!Array.isArray(parsed.scripts)) {
      return new Map()
    }

    return new Map(
      parsed.scripts
        .filter((script) => typeof script.filename === 'string')
        .map((script) => [
          script.filename,
          {
            aliases: Array.isArray(script.aliases) ? uniqueSorted(script.aliases) : undefined,
            keywords: Array.isArray(script.keywords) ? uniqueSorted(script.keywords) : undefined,
            ota: script.ota && typeof script.ota === 'object' ? resolveScriptOtaPolicy(script.ota as Partial<ScriptOtaPolicy>) : undefined,
          },
        ])
    )
  } catch {
    return new Map()
  }
}

function normalizeScriptIndexEntry(script: ScriptFileMeta & { matches?: string[]; connects?: string[] }): ScriptFileMeta {
  const { matches, connects, ...rest } = script
  return {
    ...rest,
    ...(rest.match === undefined && matches?.length ? { match: uniqueSorted(matches) } : {}),
    ...(rest.connect === undefined && connects?.length ? { connect: uniqueSorted(connects) } : {}),
  }
}

function parsePersistedScriptIndex(content: string): ScriptIndexFile {
  const parsed = JSON.parse(content) as Partial<ScriptIndexFile>
  if (parsed.version !== 1 || typeof parsed.updatedAt !== 'string' || !Array.isArray(parsed.scripts)) {
    throw new Error('Script index is invalid; run scripts_index_rebuild to regenerate it')
  }

  return {
    version: 1,
    updatedAt: parsed.updatedAt,
    ...(parsed.runtime && typeof parsed.runtime === 'object' ? { runtime: resolveRuntimeOtaPolicy(parsed.runtime as Partial<RuntimeOtaPolicy>) } : {}),
    scripts: parsed.scripts
      .filter((script) => typeof script.filename === 'string' && Number.isFinite(script.byteLength))
      .map((script) =>
        normalizeScriptIndexEntry({
          ...script,
          aliases: Array.isArray(script.aliases) ? uniqueSorted(script.aliases) : undefined,
          keywords: Array.isArray(script.keywords) ? uniqueSorted(script.keywords) : undefined,
        })
      )
      .sort((a, b) => a.filename.localeCompare(b.filename)),
  }
}

async function readPersistedScriptIndex(): Promise<ScriptIndexFile> {
  const { gistId, gistToken } = getGistInfo()

  try {
    const content = await readGistFile({ gistId, gistToken, fileName: SCRIPT_INDEX_FILE })
    return parsePersistedScriptIndex(content)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Script index is missing or unreadable; run scripts_index_rebuild to regenerate it. ${message}`)
  }
}

function buildScriptIndex(
  files: Record<string, { content: string }>,
  updatedAt: string = new Date().toISOString(),
  manualMetadataOverrides: Map<string, ManualScriptIndexMeta> = new Map(),
  runtimeOverride?: RuntimeOtaPolicy
): ScriptIndexFile {
  const previousIndexRuntime = (() => {
    try {
      const raw = files[SCRIPT_INDEX_FILE]?.content
      if (!raw) return undefined
      const parsed = JSON.parse(raw) as { runtime?: Partial<RuntimeOtaPolicy> }
      return parsed.runtime ? resolveRuntimeOtaPolicy(parsed.runtime) : undefined
    } catch {
      return undefined
    }
  })()
  const manualMetadata = parseScriptIndex(files[SCRIPT_INDEX_FILE]?.content)
  const previousEntries = parsePreviousScriptIndexEntries(files[SCRIPT_INDEX_FILE]?.content)
  const writeNow = Date.now()
  const scripts: ScriptFileMeta[] = []

  for (const [filename, { content }] of Object.entries(files)) {
    if (!isManagedScriptFilename(filename)) {
      continue
    }

    const manual = manualMetadataOverrides.get(filename) ?? manualMetadata.get(filename)
    const contentHash = sha256(content)
    const previous = previousEntries.get(filename)
    const fileUpdatedAt = previous?.contentHash === contentHash && typeof previous.updatedAt === 'number' ? previous.updatedAt : writeNow
    const ota = manual?.ota ?? previous?.ota

    scripts.push({
      filename,
      byteLength: Buffer.byteLength(content, 'utf8'),
      contentHash,
      updatedAt: fileUpdatedAt,
      ...parseUserscriptHeader(content),
      ...(manual?.aliases && manual.aliases.length > 0 ? { aliases: manual.aliases } : {}),
      ...(manual?.keywords && manual.keywords.length > 0 ? { keywords: manual.keywords } : {}),
      ...(ota ? { ota } : {}),
    })
  }

  scripts.sort((a, b) => a.filename.localeCompare(b.filename))

  return {
    version: 1,
    updatedAt,
    ...(runtimeOverride ? { runtime: runtimeOverride } : previousIndexRuntime ? { runtime: previousIndexRuntime } : {}),
    scripts,
  }
}

function stringifyScriptIndex(index: ScriptIndexFile): string {
  return `${JSON.stringify(index, null, 2)}\n`
}

function applyFileWritesToGistFiles(
  files: Record<string, { content: string; raw_url?: string }>,
  writes: Array<{ file: string; content: string | null }>
): Record<string, { content: string; raw_url?: string }> {
  const nextFiles = { ...files }

  for (const { file, content } of writes) {
    if (EXCLUDED_FILES.includes(file)) {
      continue
    }
    if (content === null) {
      delete nextFiles[file]
    } else {
      nextFiles[file] = { ...(nextFiles[file] ?? {}), content }
    }
  }

  return nextFiles
}

async function writeManagedScriptFilesWithIndex(
  writes: Array<{ file: string; content: string | null }>,
  manualMetadataOverrides: Map<string, ManualScriptIndexMeta> = new Map(),
  runtimeOverride?: RuntimeOtaPolicy
): Promise<ScriptIndexFile> {
  const managedWrites = writes.filter(({ file, content }) => isManagedScriptFilename(file) && content !== null)

  for (const { file, content } of managedWrites) {
    const validation = validateScriptContent(content!, file)
    if (!validation.ok) {
      throw new Error(`${file}: ${validation.diagnostics.join('; ')}`)
    }
  }

  const { gistId, gistToken } = getGistInfo()
  const gist = await fetchGist({ gistId, gistToken })
  const nextFiles = writes.length > 0 ? applyFileWritesToGistFiles(gist.files, writes) : gist.files
  const index = buildScriptIndex(nextFiles, new Date().toISOString(), manualMetadataOverrides, runtimeOverride)

  const gistWrites: Array<{ file: string; content: string | null }> =
    writes.length > 0 ? [...writes, { file: SCRIPT_INDEX_FILE, content: stringifyScriptIndex(index) }] : [{ file: SCRIPT_INDEX_FILE, content: stringifyScriptIndex(index) }]

  await writeGistFiles({
    gistId,
    gistToken,
    files: gistWrites,
  })

  return index
}

export { isManagedScriptFilename } from '@/constants/file'

/**
 * List managed script files from the configured Gist.
 * @returns File names and sizes (not full content)
 */
export async function listManagedScriptFiles(): Promise<ListScriptFilesResult> {
  const { gistId, gistToken } = getGistInfo()
  const gist = await fetchGist({ gistId, gistToken })
  const index = buildScriptIndex(gist.files, gist.updated_at)

  return {
    files: index.scripts,
    gistUpdatedAt: new Date(gist.updated_at).getTime(),
  }
}

function countMatches(content: string, search: string): number {
  if (search === '') {
    throw new Error('search must not be empty')
  }

  let count = 0
  let index = 0
  while (true) {
    const found = content.indexOf(search, index)
    if (found === -1) break
    count += 1
    index = found + search.length
  }
  return count
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildSearchRegExp(query: string, regex?: boolean, caseSensitive?: boolean): RegExp {
  if (!query) {
    throw new Error('query must not be empty')
  }

  return new RegExp(regex ? query : escapeRegExp(query), caseSensitive ? 'g' : 'gi')
}

function normalizeLineRange(startLine: number, endLine: number, totalLines: number) {
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine) {
    throw new Error('Invalid line range')
  }
  if (startLine > totalLines) {
    throw new Error(`startLine exceeds total lines (${totalLines})`)
  }

  return {
    start: Math.max(1, startLine),
    end: Math.min(endLine, totalLines),
  }
}

function assertExpectedCount(actual: number, expected?: number): void {
  if (expected !== undefined && actual !== expected) {
    throw new Error(`Expected ${expected} match(es), found ${actual}`)
  }
}

function validateScriptContent(content: string, filename?: string): ScriptValidationResult {
  const openCount = (content.match(/\/\/ ==UserScript==/g) || []).length
  const closeCount = (content.match(/\/\/ ==\/UserScript==/g) || []).length
  const diagnostics: string[] = []

  if (openCount !== 1 || closeCount !== 1) {
    diagnostics.push('Userscript header block must be present exactly once')
  }

  const headerMeta = parseUserscriptHeader(content)
  if (!headerMeta.version) {
    diagnostics.push('@version is required in userscript header')
  } else if (!isScriptSemverVersion(headerMeta.version)) {
    diagnostics.push(`@version must be semver x.x.x or x.x.x-prerelease (got "${headerMeta.version}")`)
  }

  const transpileResult = ts.transpileModule(content, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ESNext,
      allowJs: true,
      checkJs: false,
      removeComments: false,
    },
    fileName: filename,
    reportDiagnostics: true,
  })
  for (const diagnostic of transpileResult.diagnostics ?? []) {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
    diagnostics.push(message)
  }

  return {
    ok: diagnostics.length === 0,
    filename,
    header: {
      openCount,
      closeCount,
    },
    diagnostics,
  }
}

function applyPatchOperations(content: string, operations: ScriptPatchOperation[]): { content: string; operationsApplied: number } {
  let nextContent = content
  let operationsApplied = 0

  for (const operation of operations) {
    if (!operation.search) {
      throw new Error('operation.search must not be empty')
    }

    const actualCount = countMatches(nextContent, operation.search)
    assertExpectedCount(actualCount, operation.expectedCount)

    if (actualCount === 0) {
      continue
    }

    if (operation.type === 'replace') {
      nextContent = nextContent.split(operation.search).join(operation.replace)
    } else if (operation.type === 'insertBefore') {
      nextContent = nextContent.split(operation.search).join(operation.text + operation.search)
    } else {
      nextContent = nextContent.split(operation.search).join(operation.search + operation.text)
    }
    operationsApplied += actualCount
  }

  return { content: nextContent, operationsApplied }
}

/**
 * Read one managed script file from the Gist.
 * @param filename Gist file name
 * @returns File content
 */
export async function getManagedScriptFile(filename: string): Promise<{ filename: string; content: string }> {
  if (!isManagedScriptFilename(filename)) {
    throw new Error('File is not a managed script path')
  }
  const { gistId, gistToken } = getGistInfo()
  const content = await readGistFile({ gistId, gistToken, fileName: filename })
  return { filename, content }
}

/**
 * Search managed script files and return compact line-level matches.
 * @param options Search options
 * @returns Search matches with bounded context
 */
export async function searchManagedScriptFiles(options: ScriptSearchOptions): Promise<{ matches: ScriptSearchMatch[] }> {
  const { gistId, gistToken } = getGistInfo()
  const gist = await fetchGist({ gistId, gistToken })
  const matcher = buildSearchRegExp(options.query, options.regex, options.caseSensitive)
  const contextLines = Math.max(0, Math.min(options.contextLines ?? 1, 5))
  const maxResults = Math.max(1, Math.min(options.maxResults ?? 50, 200))
  const matches: ScriptSearchMatch[] = []

  for (const [filename, { content }] of Object.entries(gist.files).sort(([a], [b]) => a.localeCompare(b))) {
    if (!isManagedScriptFilename(filename) || (options.filename && filename !== options.filename)) {
      continue
    }

    const lines = content.split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      matcher.lastIndex = 0
      const match = matcher.exec(lines[index])
      if (!match) continue

      matches.push({
        filename,
        line: index + 1,
        column: match.index + 1,
        text: lines[index],
        before: lines.slice(Math.max(0, index - contextLines), index),
        after: lines.slice(index + 1, Math.min(lines.length, index + 1 + contextLines)),
      })
      if (matches.length >= maxResults) {
        return { matches }
      }
    }
  }

  return { matches }
}

/**
 * Search script metadata generated from filename, userscript header, and index aliases/keywords.
 * @param options Find options
 * @returns Ranked script matches
 */
export async function findManagedScriptFiles(options: ScriptFindOptions): Promise<{ results: ScriptFindResult[]; indexUpdatedAt: string }> {
  const index = await readPersistedScriptIndex()
  const maxResults = Math.max(1, Math.min(options.maxResults ?? 20, 100))
  const query = options.caseSensitive ? options.query.trim() : options.query.trim().toLowerCase()

  if (!query) {
    throw new Error('query must not be empty')
  }

  const results: ScriptFindResult[] = []

  for (const script of index.scripts) {
    const weightedFields: Array<{ label: string; value?: string | string[]; weight: number }> = [
      { label: 'filename', value: script.filename, weight: 4 },
      { label: 'name', value: script.name, weight: 6 },
      { label: 'description', value: script.description, weight: 5 },
      { label: 'alias', value: script.aliases, weight: 7 },
      { label: 'keyword', value: script.keywords, weight: 6 },
      { label: 'match', value: script.match, weight: 2 },
      { label: 'author', value: script.author, weight: 3 },
    ]
    let score = 0
    const reasons: string[] = []

    for (const field of weightedFields) {
      const values = Array.isArray(field.value) ? field.value : field.value ? [field.value] : []
      for (const rawValue of values) {
        const value = options.caseSensitive ? rawValue : rawValue.toLowerCase()
        if (value === query) {
          score += field.weight * 3
          reasons.push(`${field.label}:exact`)
        } else if (value.includes(query)) {
          score += field.weight
          reasons.push(`${field.label}:contains`)
        }
      }
    }

    if (score > 0) {
      results.push({ filename: script.filename, score, reasons: uniqueSorted(reasons), script })
    }
  }

  results.sort((a, b) => b.score - a.score || a.filename.localeCompare(b.filename))

  return {
    results: results.slice(0, maxResults),
    indexUpdatedAt: index.updatedAt,
  }
}

/**
 * Rebuild and persist the generated script index from current Gist files.
 * @returns Rebuilt index
 */
export async function rebuildManagedScriptIndex(): Promise<ScriptIndexFile> {
  const { gistId, gistToken } = getGistInfo()
  const gist = await fetchGist({ gistId, gistToken })
  const index = buildScriptIndex(gist.files)

  await writeGistFiles({
    gistId,
    gistToken,
    files: [{ file: SCRIPT_INDEX_FILE, content: stringifyScriptIndex(index) }],
  })

  return index
}

/**
 * Update human-maintained script index metadata while preserving derived fields from files.
 * @param options Metadata update options
 * @returns Updated index entry
 */
export async function updateManagedScriptIndexMetadata(options: ScriptIndexMetadataOptions): Promise<ScriptFileMeta> {
  if (!isManagedScriptFilename(options.filename)) {
    throw new Error('File is not a managed script path')
  }

  const { gistId, gistToken } = getGistInfo()
  const gist = await fetchGist({ gistId, gistToken })
  if (!gist.files[options.filename]) {
    throw new Error(`File ${options.filename} not found in gist ${gistId}`)
  }

  const existingManual = parseScriptIndex(gist.files[SCRIPT_INDEX_FILE]?.content).get(options.filename)
  const overrides = new Map<string, ManualScriptIndexMeta>()
  overrides.set(options.filename, {
    aliases: options.aliases === undefined ? existingManual?.aliases : uniqueSorted(options.aliases),
    keywords: options.keywords === undefined ? existingManual?.keywords : uniqueSorted(options.keywords),
    ota: options.ota ? resolveScriptOtaPolicy({ ...existingManual?.ota, ...options.ota }) : existingManual?.ota,
  })

  const index = buildScriptIndex(gist.files, new Date().toISOString(), overrides)
  await writeGistFiles({
    gistId,
    gistToken,
    files: [{ file: SCRIPT_INDEX_FILE, content: stringifyScriptIndex(index) }],
  })

  const updated = index.scripts.find((script) => script.filename === options.filename)
  if (!updated) {
    throw new Error(`File ${options.filename} not found in rebuilt index`)
  }
  return updated
}

/**
 * Read a line range from one managed script file.
 * @param options Snippet options
 * @returns Selected lines
 */
export async function getManagedScriptSnippet(
  options: ScriptSnippetOptions
): Promise<{ filename: string; startLine: number; endLine: number; lines: string[]; totalLines: number }> {
  const { filename, content } = await getManagedScriptFile(options.filename)
  const lines = content.split('\n')
  const { start, end } = normalizeLineRange(options.startLine, options.endLine, lines.length)
  return {
    filename,
    startLine: start,
    endLine: end,
    lines: lines.slice(start - 1, end),
    totalLines: lines.length,
  }
}

/**
 * Create or replace a managed script file in the Gist.
 * @param filename Gist file name
 * @param content New file body
 */
export async function upsertManagedScriptFile(filename: string, content: string, options?: { saveAsDebug?: boolean }): Promise<void> {
  if (!isManagedScriptFilename(filename)) {
    throw new Error('File is not a managed script path')
  }
  const validation = validateScriptContent(content, filename)
  if (!validation.ok) {
    throw new Error(validation.diagnostics.join('; '))
  }

  const { gistId, gistToken } = getGistInfo()
  const gist = await fetchGist({ gistId, gistToken })
  const isNew = !gist.files[filename]
  const overrides = new Map<string, ManualScriptIndexMeta>()
  if (isNew || options?.saveAsDebug === true) {
    overrides.set(filename, { ota: { ...NEW_SCRIPT_OTA_DEFAULTS } })
  }

  await writeManagedScriptFilesWithIndex([{ file: filename, content }], overrides)
}

/**
 * Batch write managed and auxiliary Gist files while rebuilding the script index.
 * @param writes File writes (null content deletes)
 * @param options When `saveAsDebug` is true, managed script writes get alpha OTA defaults
 * @returns Rebuilt script index
 */
export async function saveManagedScriptFiles(writes: Array<{ file: string; content: string | null }>, options?: { saveAsDebug?: boolean }): Promise<ScriptIndexFile> {
  const overrides = new Map<string, ManualScriptIndexMeta>()
  if (options?.saveAsDebug === true && writes.length > 0) {
    const { gistId, gistToken } = getGistInfo()
    const gist = await fetchGist({ gistId, gistToken })
    for (const { file, content } of writes) {
      if (content === null || !isManagedScriptFilename(file)) {
        continue
      }
      const isNew = !gist.files[file]
      if (isNew || options.saveAsDebug) {
        overrides.set(file, { ota: { ...NEW_SCRIPT_OTA_DEFAULTS } })
      }
    }
  }

  return writeManagedScriptFilesWithIndex(writes, overrides)
}

/**
 * Validate one managed script file without returning its content.
 * @param filename Gist file name
 * @returns Validation result
 */
export async function validateManagedScriptFile(filename: string): Promise<ScriptValidationResult> {
  const { content } = await getManagedScriptFile(filename)
  return validateScriptContent(content, filename)
}

/**
 * Replace text in a managed script file on the server side.
 * @param options Replace options
 * @returns Operation summary
 */
export async function replaceManagedScriptFile(
  options: ScriptReplaceOptions
): Promise<{ ok: true; filename: string; replacedCount: number; byteLengthBefore: number; byteLengthAfter: number; validation?: ScriptValidationResult }> {
  const { filename, content } = await getManagedScriptFile(options.filename)
  let nextContent = content
  let replacedCount = 0

  if (options.regex) {
    const flags = options.caseSensitive ? 'g' : 'gi'
    const regex = new RegExp(options.search, flags)
    nextContent = content.replace(regex, () => {
      replacedCount += 1
      return options.replace
    })
  } else {
    const regex = new RegExp(escapeRegExp(options.search), options.caseSensitive === false ? 'gi' : 'g')
    nextContent = content.replace(regex, () => {
      replacedCount += 1
      return options.replace
    })
  }

  assertExpectedCount(replacedCount, options.expectedCount)

  const validation = options.validate ? validateScriptContent(nextContent, filename) : undefined
  if (validation && !validation.ok) {
    throw new Error(validation.diagnostics.join('; '))
  }

  await writeManagedScriptFilesWithIndex([{ file: filename, content: nextContent }])
  return {
    ok: true,
    filename,
    replacedCount,
    byteLengthBefore: Buffer.byteLength(content, 'utf8'),
    byteLengthAfter: Buffer.byteLength(nextContent, 'utf8'),
    validation,
  }
}

/**
 * Apply simple structured patch operations to one managed script file.
 * @param options Patch options
 * @returns Operation summary
 */
export async function patchManagedScriptFile(
  options: ScriptPatchOptions
): Promise<{ ok: true; filename: string; operationsApplied: number; byteLengthBefore: number; byteLengthAfter: number; validation?: ScriptValidationResult }> {
  const { filename, content } = await getManagedScriptFile(options.filename)
  const patched = applyPatchOperations(content, options.operations)
  const validation = options.validate ? validateScriptContent(patched.content, filename) : undefined
  if (validation && !validation.ok) {
    throw new Error(validation.diagnostics.join('; '))
  }

  await writeManagedScriptFilesWithIndex([{ file: filename, content: patched.content }])
  return {
    ok: true,
    filename,
    operationsApplied: patched.operationsApplied,
    byteLengthBefore: Buffer.byteLength(content, 'utf8'),
    byteLengthAfter: Buffer.byteLength(patched.content, 'utf8'),
    validation,
  }
}

/**
 * Apply structured patch operations to multiple files.
 * @param options Batch patch options
 * @returns Operation summaries
 */
export async function batchPatchManagedScriptFiles(
  options: ScriptBatchPatchOptions
): Promise<{ ok: true; results: Array<{ filename: string; operationsApplied: number; byteLengthBefore: number; byteLengthAfter: number; validation?: ScriptValidationResult }> }> {
  const results: Array<{ filename: string; content: string; operationsApplied: number; byteLengthBefore: number; byteLengthAfter: number; validation?: ScriptValidationResult }> =
    []

  for (const fileOptions of options.files) {
    const { filename, content } = await getManagedScriptFile(fileOptions.filename)
    const patched = applyPatchOperations(content, fileOptions.operations)
    const validation = options.validate || fileOptions.validate ? validateScriptContent(patched.content, filename) : undefined
    if (validation && !validation.ok) {
      throw new Error(`${filename}: ${validation.diagnostics.join('; ')}`)
    }
    results.push({
      filename,
      content: patched.content,
      operationsApplied: patched.operationsApplied,
      byteLengthBefore: Buffer.byteLength(content, 'utf8'),
      byteLengthAfter: Buffer.byteLength(patched.content, 'utf8'),
      validation,
    })
  }

  await writeManagedScriptFilesWithIndex(results.map(({ filename, content }) => ({ file: filename, content })))

  return {
    ok: true,
    results: results.map(({ filename, operationsApplied, byteLengthBefore, byteLengthAfter, validation }) => ({
      filename,
      operationsApplied,
      byteLengthBefore,
      byteLengthAfter,
      validation,
    })),
  }
}

/**
 * Remove a managed script file from the Gist.
 * @param filename Gist file name
 */
export async function deleteManagedScriptFile(filename: string): Promise<void> {
  if (!isManagedScriptFilename(filename)) {
    throw new Error('File is not a managed script path')
  }
  await writeManagedScriptFilesWithIndex([{ file: filename, content: null }])
}

/**
 * Rename a managed script file inside the backing Gist.
 *
 * Implemented as: read old content -> upsert new filename -> delete old filename.
 * @param fromFilename Existing managed script file name in the Gist
 * @param toFilename New managed script file name in the Gist
 * @returns Confirmation object for the rename operation
 */
export async function renameManagedScriptFile(fromFilename: string, toFilename: string): Promise<{ ok: true; fromFilename: string; toFilename: string }> {
  if (!fromFilename || !toFilename) {
    throw new Error('Both fromFilename and toFilename are required')
  }
  if (fromFilename === toFilename) {
    throw new Error('fromFilename and toFilename must be different')
  }
  if (!isManagedScriptFilename(fromFilename) || !isManagedScriptFilename(toFilename)) {
    throw new Error('File is not a managed script path')
  }

  const { content } = await getManagedScriptFile(fromFilename)
  const { gistId, gistToken } = getGistInfo()
  const gist = await fetchGist({ gistId, gistToken })
  const manual = parseScriptIndex(gist.files[SCRIPT_INDEX_FILE]?.content).get(fromFilename)
  const manualOverrides = new Map<string, ManualScriptIndexMeta>()
  if (manual) {
    manualOverrides.set(toFilename, manual)
  }

  await writeManagedScriptFilesWithIndex(
    [
      { file: toFilename, content },
      { file: fromFilename, content: null },
    ],
    manualOverrides
  )

  return { ok: true as const, fromFilename, toFilename }
}

/**
 * Read the persisted managed script index from Gist.
 * @returns Parsed script index including runtime OTA policy
 */
export async function readManagedScriptIndex(): Promise<ScriptIndexFile> {
  return readPersistedScriptIndex()
}

/**
 * Publish a managed script to stable: write releases snapshot and set OTA policy.
 * @param filename Managed script filename
 * @returns Updated script index entry
 */
export async function publishManagedScriptStable(filename: string): Promise<ScriptFileMeta> {
  if (!isManagedScriptFilename(filename)) {
    throw new Error('File is not a managed script path')
  }

  const { content } = await getManagedScriptFile(filename)
  const headerMeta = parseUserscriptHeader(content)
  if (!headerMeta.version || !isStrictSemverVersion(headerMeta.version)) {
    throw new Error(`publish stable requires @version x.x.x (got "${headerMeta.version ?? ''}")`)
  }

  const snapshotPath = buildReleaseSnapshotPath(filename, headerMeta.version)
  const overrides = new Map<string, ManualScriptIndexMeta>()
  overrides.set(filename, {
    ota: {
      stage: 'stable',
      autoUpgrade: true,
    },
  })

  const index = await writeManagedScriptFilesWithIndex(
    [
      { file: filename, content },
      { file: snapshotPath, content },
    ],
    overrides
  )

  const updated = index.scripts.find((script) => script.filename === filename)
  if (!updated) {
    throw new Error(`File ${filename} not found in rebuilt index`)
  }
  return updated
}

/**
 * Fleet-lock a managed script to its current @version (stable track uses releases snapshot).
 * @param filename Managed script filename
 * @param version Optional explicit version; defaults to header @version
 * @returns Updated script index entry
 */
export async function lockManagedScriptVersion(filename: string, version?: string): Promise<ScriptFileMeta> {
  if (!isManagedScriptFilename(filename)) {
    throw new Error('File is not a managed script path')
  }

  const { content } = await getManagedScriptFile(filename)
  const headerMeta = parseUserscriptHeader(content)
  const lockedVersion = (version ?? headerMeta.version)?.trim()
  if (!lockedVersion || !isScriptSemverVersion(lockedVersion)) {
    throw new Error(`lock requires a valid @version (got "${lockedVersion ?? ''}")`)
  }

  const snapshotPath = buildReleaseSnapshotPath(filename, lockedVersion)
  const overrides = new Map<string, ManualScriptIndexMeta>()
  overrides.set(filename, {
    ota: {
      stage: 'stable',
      autoUpgrade: true,
      lockedVersion,
    },
  })

  const writes: Array<{ file: string; content: string | null }> = []
  const { gistId, gistToken } = getGistInfo()
  const gist = await fetchGist({ gistId, gistToken })
  if (!gist.files[snapshotPath]) {
    writes.push({ file: snapshotPath, content })
  }

  const index = await writeManagedScriptFilesWithIndex(writes, overrides)
  const updated = index.scripts.find((script) => script.filename === filename)
  if (!updated) {
    throw new Error(`File ${filename} not found in rebuilt index`)
  }
  return updated
}

/**
 * Clear fleet version lock for a managed script.
 * @param filename Managed script filename
 * @returns Updated script index entry
 */
export async function unlockManagedScriptVersion(filename: string): Promise<ScriptFileMeta> {
  if (!isManagedScriptFilename(filename)) {
    throw new Error('File is not a managed script path')
  }

  const { gistId, gistToken } = getGistInfo()
  const gist = await fetchGist({ gistId, gistToken })
  const existingManual = parseScriptIndex(gist.files[SCRIPT_INDEX_FILE]?.content).get(filename)
  const currentOta = resolveScriptOtaPolicy(existingManual?.ota)
  const { lockedVersion, ...otaWithoutLock } = currentOta
  void lockedVersion
  const overrides = new Map<string, ManualScriptIndexMeta>()
  overrides.set(filename, { ota: otaWithoutLock })

  const index = await writeManagedScriptFilesWithIndex([], overrides)
  const updated = index.scripts.find((script) => script.filename === filename)
  if (!updated) {
    throw new Error(`File ${filename} not found in rebuilt index`)
  }
  return updated
}

export { LEGACY_SCRIPT_OTA_DEFAULTS, NEW_SCRIPT_OTA_DEFAULTS, resolveScriptOtaPolicy, type RuntimeOtaPolicy, type ScriptOtaPolicy }
