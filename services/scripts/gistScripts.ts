import * as ts from 'typescript'

import { EXCLUDED_FILES, SCRIPTS_FILE_EXTENSION } from '@/constants/file'
import { fetchGist, getGistInfo, readGistFile, writeGistFiles } from '@/services/gist'

/** Metadata for one script file in the backing Gist */
export interface ScriptFileMeta {
  /** File name in the Gist */
  filename: string
  /** UTF-8 byte length of content */
  byteLength: number
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
  const files: ScriptFileMeta[] = []

  for (const [filename, { content }] of Object.entries(gist.files)) {
    if (!isManagedScriptFilename(filename)) {
      continue
    }
    files.push({ filename, byteLength: Buffer.byteLength(content, 'utf8') })
  }

  files.sort((a, b) => a.filename.localeCompare(b.filename))

  return {
    files,
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
  const { gistId, gistToken } = getGistInfo()
  await writeGistFiles({ gistId, gistToken, files: [{ file: filename, content }] })
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

  await upsertManagedScriptFile(filename, nextContent)
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

  await upsertManagedScriptFile(filename, patched.content)
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

  const { gistId, gistToken } = getGistInfo()
  await writeGistFiles({
    gistId,
    gistToken,
    files: results.map(({ filename, content }) => ({ file: filename, content })),
  })

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
  const { gistId, gistToken } = getGistInfo()
  await writeGistFiles({ gistId, gistToken, files: [{ file: filename, content: null }] })
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
  await upsertManagedScriptFile(toFilename, content)
  await deleteManagedScriptFile(fromFilename)

  return { ok: true as const, fromFilename, toFilename }
}
