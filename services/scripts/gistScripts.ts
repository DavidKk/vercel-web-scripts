import { createHash } from 'crypto'
import * as ts from 'typescript'

import { EXCLUDED_FILES, SCRIPT_INDEX_FILE, SCRIPTS_FILE_EXTENSION } from '@/constants/file'
import { fetchGist, getGistInfo, readGistFile, writeGistFiles } from '@/services/gist'

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
  /** Userscript @match values */
  matches?: string[]
  /** Userscript @grant values */
  grants?: string[]
  /** Userscript @connect values */
  connects?: string[]
  /** Human-maintained search aliases preserved from the index */
  aliases?: string[]
  /** Human-maintained search keywords preserved from the index */
  keywords?: string[]
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
}

export interface ScriptIndexFile {
  version: 1
  updatedAt: string
  scripts: ScriptFileMeta[]
}

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
  const matches: string[] = []
  const grants: string[] = []
  const connects: string[] = []
  const header = content.slice(open, close).split('\n')

  for (const line of header) {
    const match = line.match(/^\s*\/\/\s*@([\w:-]+)\s*(.*)$/)
    if (!match) continue

    const key = match[1]
    const value = match[2].trim()
    if (!value) continue

    if (key === 'name') {
      metadata.name = value
    } else if (key === 'description') {
      metadata.description = value
    } else if (key === 'version') {
      metadata.version = value
    } else if (key === 'run-at') {
      metadata.runAt = value
    } else if (key === 'match') {
      matches.push(value)
    } else if (key === 'grant') {
      grants.push(value)
    } else if (key === 'connect') {
      connects.push(value)
    }
  }

  if (matches.length > 0) metadata.matches = uniqueSorted(matches)
  if (grants.length > 0) metadata.grants = uniqueSorted(grants)
  if (connects.length > 0) metadata.connects = uniqueSorted(connects)

  return metadata
}

function parseScriptIndex(content?: string): Map<string, Pick<ScriptFileMeta, 'aliases' | 'keywords'>> {
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
          },
        ])
    )
  } catch {
    return new Map()
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
    scripts: parsed.scripts
      .filter((script) => typeof script.filename === 'string' && Number.isFinite(script.byteLength))
      .map((script) => ({
        ...script,
        aliases: Array.isArray(script.aliases) ? uniqueSorted(script.aliases) : undefined,
        keywords: Array.isArray(script.keywords) ? uniqueSorted(script.keywords) : undefined,
      }))
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
  manualMetadataOverrides: Map<string, Pick<ScriptFileMeta, 'aliases' | 'keywords'>> = new Map()
): ScriptIndexFile {
  const manualMetadata = parseScriptIndex(files[SCRIPT_INDEX_FILE]?.content)
  const scripts: ScriptFileMeta[] = []

  for (const [filename, { content }] of Object.entries(files)) {
    if (!isManagedScriptFilename(filename)) {
      continue
    }

    const manual = manualMetadataOverrides.get(filename) ?? manualMetadata.get(filename)
    scripts.push({
      filename,
      byteLength: Buffer.byteLength(content, 'utf8'),
      contentHash: sha256(content),
      ...parseUserscriptHeader(content),
      ...(manual?.aliases && manual.aliases.length > 0 ? { aliases: manual.aliases } : {}),
      ...(manual?.keywords && manual.keywords.length > 0 ? { keywords: manual.keywords } : {}),
    })
  }

  scripts.sort((a, b) => a.filename.localeCompare(b.filename))

  return {
    version: 1,
    updatedAt,
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
  manualMetadataOverrides: Map<string, Pick<ScriptFileMeta, 'aliases' | 'keywords'>> = new Map()
): Promise<void> {
  const managedWrites = writes.filter(({ file }) => isManagedScriptFilename(file))
  if (managedWrites.length === 0) {
    return
  }

  const { gistId, gistToken } = getGistInfo()
  const gist = await fetchGist({ gistId, gistToken })
  const nextFiles = applyFileWritesToGistFiles(gist.files, managedWrites)
  const index = buildScriptIndex(nextFiles, new Date().toISOString(), manualMetadataOverrides)

  await writeGistFiles({
    gistId,
    gistToken,
    files: [...managedWrites, { file: SCRIPT_INDEX_FILE, content: stringifyScriptIndex(index) }],
  })
}

/**
 * Whether a Gist filename is allowed for script integration (mutations).
 * @param filename Gist file name
 * @returns True when list/get/upsert/delete are permitted
 */
export function isManagedScriptFilename(filename: string): boolean {
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return false
  }
  if (EXCLUDED_FILES.includes(filename)) {
    return false
  }
  return SCRIPTS_FILE_EXTENSION.some((ext) => filename.endsWith(ext))
}

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
      { label: 'match', value: script.matches, weight: 2 },
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
  const overrides = new Map<string, Pick<ScriptFileMeta, 'aliases' | 'keywords'>>()
  overrides.set(options.filename, {
    aliases: options.aliases === undefined ? existingManual?.aliases : uniqueSorted(options.aliases),
    keywords: options.keywords === undefined ? existingManual?.keywords : uniqueSorted(options.keywords),
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
export async function upsertManagedScriptFile(filename: string, content: string): Promise<void> {
  if (!isManagedScriptFilename(filename)) {
    throw new Error('File is not a managed script path')
  }
  await writeManagedScriptFilesWithIndex([{ file: filename, content }])
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
  const manualOverrides = new Map<string, Pick<ScriptFileMeta, 'aliases' | 'keywords'>>()
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
