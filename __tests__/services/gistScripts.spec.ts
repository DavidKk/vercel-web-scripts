import { fetchGist, readGistFile, writeGistFiles } from '@/services/gist'
import {
  batchPatchManagedScriptFiles,
  buildScriptUpdatedAtMapFromIndexContent,
  deleteManagedScriptFile,
  findManagedScriptFiles,
  getManagedScriptSnippet,
  listManagedScriptFiles,
  patchManagedScriptFile,
  rebuildManagedScriptIndex,
  renameManagedScriptFile,
  replaceManagedScriptFile,
  searchManagedScriptFiles,
  updateManagedScriptIndexMetadata,
  upsertManagedScriptFile,
  validateManagedScriptFile,
} from '@/services/scripts/gistScripts'

jest.mock('@/services/gist', () => ({
  fetchGist: jest.fn(),
  getGistInfo: jest.fn(() => ({ gistId: 'gist-id', gistToken: 'gist-token' })),
  readGistFile: jest.fn(),
  writeGistFiles: jest.fn(),
}))

const scriptContent = `// ==UserScript==
// @name Demo Script
// @version 1.0.0
// @description Copy table data as CSV
// @match https://example.com/*
// @run-at document-idle
// ==/UserScript==

const label = 'Copy CSV'
function run() {
  console.log(label)
}
`

const otherScriptContent = `// ==UserScript==
// @name Other Script
// @version 1.0.0
// @description Open another helper
// @match https://example.org/*
// ==/UserScript==

console.log('other')
`

const mockFetchGist = jest.mocked(fetchGist)
const mockReadGistFile = jest.mocked(readGistFile)
const mockWriteGistFiles = jest.mocked(writeGistFiles)

function buildIndex(files: Record<string, string>, scripts: Array<Record<string, unknown>> = []) {
  const generatedScripts = Object.entries(files)
    .filter(([filename]) => filename.endsWith('.ts') || filename.endsWith('.js'))
    .map(([filename, content]) => ({
      filename,
      byteLength: Buffer.byteLength(content, 'utf8'),
      ...(filename === 'demo.ts'
        ? {
            contentHash: '0'.repeat(64),
            name: 'Demo Script',
            description: 'Copy table data as CSV',
            version: '1.0.0',
            runAt: 'document-idle',
            matches: ['https://example.com/*'],
          }
        : {}),
      ...(filename === 'other.ts'
        ? {
            contentHash: '1'.repeat(64),
            name: 'Other Script',
            description: 'Open another helper',
            version: '1.0.0',
            matches: ['https://example.org/*'],
          }
        : {}),
    }))

  return JSON.stringify({
    version: 1,
    updatedAt: '2026-01-02T00:00:00Z',
    scripts: scripts.length > 0 ? scripts : generatedScripts,
  })
}

function getWrittenIndex(callIndex = 0) {
  const writeArg = mockWriteGistFiles.mock.calls[callIndex][0]
  const indexFile = writeArg.files.find(({ file }) => file === 'magickmonkey.scripts.index.json')
  if (!indexFile || !indexFile.content) {
    throw new Error('index file was not written')
  }
  return JSON.parse(indexFile.content)
}

function mockGist(files: Record<string, string>): void {
  mockFetchGist.mockResolvedValue({
    url: 'https://api.github.com/gists/gist-id',
    forks_url: '',
    commits_url: '',
    html_url: '',
    description: '',
    files: Object.fromEntries(Object.entries(files).map(([filename, content]) => [filename, { content, raw_url: '' }])),
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  })
}

function mockRead(files: Record<string, string>): void {
  mockReadGistFile.mockImplementation(async ({ fileName }) => {
    const content = files[fileName]
    if (content === undefined) throw new Error('not found')
    return content
  })
}

describe('gist script token-efficient editing helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGist({
      'demo.ts': scriptContent,
      'other.ts': otherScriptContent,
      'README.md': 'ignored Copy CSV',
    })
    mockRead({
      'demo.ts': scriptContent,
      'other.ts': otherScriptContent,
      'magickmonkey.scripts.index.json': buildIndex({
        'demo.ts': scriptContent,
        'other.ts': otherScriptContent,
      }),
    })
  })

  describe('searchManagedScriptFiles', () => {
    it('returns compact line-level matches with context and ignores unmanaged files', async () => {
      const result = await searchManagedScriptFiles({
        query: 'Copy CSV',
        contextLines: 1,
      })

      expect(result.matches).toEqual([
        {
          filename: 'demo.ts',
          line: 9,
          column: 16,
          text: "const label = 'Copy CSV'",
          before: [''],
          after: ['function run() {'],
        },
      ])
    })

    it('can search within one file using a regex', async () => {
      const result = await searchManagedScriptFiles({
        filename: 'other.ts',
        query: 'console\\.log',
        regex: true,
        contextLines: 0,
      })

      expect(result.matches).toHaveLength(1)
      expect(result.matches[0]).toMatchObject({
        filename: 'other.ts',
        line: 8,
        column: 1,
      })
    })
  })

  describe('listManagedScriptFiles', () => {
    it('returns indexed metadata derived from userscript headers', async () => {
      const result = await listManagedScriptFiles()

      expect(result.files[0]).toMatchObject({
        filename: 'demo.ts',
        name: 'Demo Script',
        description: 'Copy table data as CSV',
        version: '1.0.0',
        runAt: 'document-idle',
        matches: ['https://example.com/*'],
      })
      expect(result.files[0].contentHash).toHaveLength(64)
    })
  })

  describe('findManagedScriptFiles', () => {
    it('finds scripts by header name and description', async () => {
      const byName = await findManagedScriptFiles({ query: 'Demo Script' })
      const byDescription = await findManagedScriptFiles({ query: 'table data' })

      expect(mockFetchGist).not.toHaveBeenCalled()
      expect(byName.results[0]).toMatchObject({
        filename: 'demo.ts',
        reasons: expect.arrayContaining(['name:exact']),
      })
      expect(byDescription.results[0]).toMatchObject({
        filename: 'demo.ts',
        reasons: expect.arrayContaining(['description:contains']),
      })
    })

    it('preserves and searches aliases from the index file', async () => {
      mockRead({
        'magickmonkey.scripts.index.json': buildIndex({ 'demo.ts': scriptContent }, [
          {
            filename: 'demo.ts',
            byteLength: Buffer.byteLength(scriptContent, 'utf8'),
            name: 'Demo Script',
            description: 'Copy table data as CSV',
            aliases: ['表格复制'],
            keywords: ['CSV'],
          },
        ]),
      })

      const result = await findManagedScriptFiles({ query: '表格复制' })

      expect(mockFetchGist).not.toHaveBeenCalled()
      expect(result.results[0]).toMatchObject({
        filename: 'demo.ts',
        reasons: expect.arrayContaining(['alias:exact']),
      })
    })

    it('asks callers to rebuild when the persisted index is missing', async () => {
      mockRead({})

      await expect(findManagedScriptFiles({ query: 'Demo Script' })).rejects.toThrow('scripts_index_rebuild')
      expect(mockFetchGist).not.toHaveBeenCalled()
    })
  })

  describe('getManagedScriptSnippet', () => {
    it('returns only the requested line range', async () => {
      const result = await getManagedScriptSnippet({
        filename: 'demo.ts',
        startLine: 2,
        endLine: 4,
      })

      expect(result).toEqual({
        filename: 'demo.ts',
        startLine: 2,
        endLine: 4,
        totalLines: 13,
        lines: ['// @name Demo Script', '// @version 1.0.0', '// @description Copy table data as CSV'],
      })
    })

    it('rejects ranges that start past the end of the file', async () => {
      await expect(
        getManagedScriptSnippet({
          filename: 'demo.ts',
          startLine: 99,
          endLine: 100,
        })
      ).rejects.toThrow('startLine exceeds total lines')
    })
  })

  describe('replaceManagedScriptFile', () => {
    it('replaces content server-side and writes the updated file', async () => {
      const result = await replaceManagedScriptFile({
        filename: 'demo.ts',
        search: 'Copy CSV',
        replace: 'Copy TSV',
        expectedCount: 1,
        validate: true,
      })

      expect(result).toMatchObject({
        ok: true,
        filename: 'demo.ts',
        replacedCount: 1,
        validation: {
          ok: true,
          header: { openCount: 1, closeCount: 1 },
          diagnostics: [],
        },
      })
      expect(mockWriteGistFiles).toHaveBeenCalledWith({
        gistId: 'gist-id',
        gistToken: 'gist-token',
        files: [
          {
            file: 'demo.ts',
            content: expect.stringContaining("const label = 'Copy TSV'"),
          },
          {
            file: 'magickmonkey.scripts.index.json',
            content: expect.any(String),
          },
        ],
      })
      expect(getWrittenIndex().scripts.find((script: { filename: string }) => script.filename === 'demo.ts')).toMatchObject({
        filename: 'demo.ts',
        name: 'Demo Script',
        description: 'Copy table data as CSV',
      })
    })

    it('rejects when expectedCount does not match', async () => {
      await expect(
        replaceManagedScriptFile({
          filename: 'demo.ts',
          search: 'Copy CSV',
          replace: 'Copy TSV',
          expectedCount: 2,
        })
      ).rejects.toThrow('Expected 2 match(es), found 1')
      expect(mockWriteGistFiles).not.toHaveBeenCalled()
    })
  })

  describe('patchManagedScriptFile', () => {
    it('applies structured insert and replace operations', async () => {
      const result = await patchManagedScriptFile({
        filename: 'demo.ts',
        operations: [
          {
            type: 'insertAfter',
            search: "const label = 'Copy CSV'",
            text: "\nconst mode = 'csv'",
            expectedCount: 1,
          },
          {
            type: 'replace',
            search: 'console.log(label)',
            replace: 'console.log(label, mode)',
            expectedCount: 1,
          },
        ],
        validate: true,
      })

      expect(result.operationsApplied).toBe(2)
      const writeArg = mockWriteGistFiles.mock.calls[0][0]
      expect(writeArg.files[0].content).toContain("const label = 'Copy CSV'\nconst mode = 'csv'")
      expect(writeArg.files[0].content).toContain('console.log(label, mode)')
    })
  })

  describe('batchPatchManagedScriptFiles', () => {
    it('prepares multiple file edits and writes them in one Gist update', async () => {
      const result = await batchPatchManagedScriptFiles({
        files: [
          {
            filename: 'demo.ts',
            operations: [{ type: 'replace', search: 'Demo Script', replace: 'Demo Script Updated', expectedCount: 1 }],
          },
          {
            filename: 'other.ts',
            operations: [{ type: 'insertBefore', search: "console.log('other')", text: 'const ready = true\n', expectedCount: 1 }],
          },
        ],
        validate: true,
      })

      expect(result.results).toHaveLength(2)
      expect(mockWriteGistFiles).toHaveBeenCalledTimes(1)
      expect(mockWriteGistFiles.mock.calls[0][0].files).toEqual([
        {
          file: 'demo.ts',
          content: expect.stringContaining('Demo Script Updated'),
        },
        {
          file: 'other.ts',
          content: expect.stringContaining("const ready = true\nconsole.log('other')"),
        },
        {
          file: 'magickmonkey.scripts.index.json',
          content: expect.any(String),
        },
      ])
    })
  })

  describe('index synchronization for CRUD', () => {
    it('writes an index when upserting a script', async () => {
      await upsertManagedScriptFile('demo.ts', scriptContent.replace('Demo Script', 'Demo Script v2'))

      const index = getWrittenIndex()
      expect(index.scripts.find((script: { filename: string }) => script.filename === 'demo.ts')).toMatchObject({
        filename: 'demo.ts',
        name: 'Demo Script v2',
      })
    })

    it('removes deleted scripts from the index', async () => {
      await deleteManagedScriptFile('demo.ts')

      const index = getWrittenIndex()
      expect(index.scripts.map((script: { filename: string }) => script.filename)).toEqual(['other.ts'])
    })

    it('preserves manual aliases and keywords when updating and renaming', async () => {
      mockGist({
        'demo.ts': scriptContent,
        'magickmonkey.scripts.index.json': JSON.stringify({
          version: 1,
          updatedAt: '2026-01-01T00:00:00Z',
          scripts: [{ filename: 'demo.ts', aliases: ['表格复制'], keywords: ['CSV'] }],
        }),
      })

      await upsertManagedScriptFile('demo.ts', scriptContent.replace('Demo Script', 'Demo Script v2'))
      expect(getWrittenIndex().scripts[0]).toMatchObject({
        filename: 'demo.ts',
        aliases: ['表格复制'],
        keywords: ['CSV'],
      })

      mockRead({ 'demo.ts': scriptContent })
      mockWriteGistFiles.mockClear()
      await renameManagedScriptFile('demo.ts', 'demo-renamed.ts')
      expect(getWrittenIndex().scripts[0]).toMatchObject({
        filename: 'demo-renamed.ts',
        aliases: ['表格复制'],
        keywords: ['CSV'],
      })
    })

    it('can rebuild the index and update human-maintained metadata', async () => {
      const rebuilt = await rebuildManagedScriptIndex()

      expect(rebuilt.scripts.map((script) => script.filename)).toEqual(['demo.ts', 'other.ts'])
      expect(getWrittenIndex().scripts[0]).toMatchObject({
        filename: 'demo.ts',
        name: 'Demo Script',
      })

      mockWriteGistFiles.mockClear()
      const updated = await updateManagedScriptIndexMetadata({
        filename: 'demo.ts',
        aliases: ['表格复制', '表格复制'],
        keywords: ['CSV', '复制'],
      })

      const expectedKeywords = ['CSV', '复制'].sort((a, b) => a.localeCompare(b))

      expect(updated).toMatchObject({
        filename: 'demo.ts',
        aliases: ['表格复制'],
        keywords: expectedKeywords,
      })
      expect(getWrittenIndex().scripts[0]).toMatchObject({
        filename: 'demo.ts',
        aliases: ['表格复制'],
        keywords: expectedKeywords,
      })
    })
  })

  describe('validateManagedScriptFile', () => {
    it('validates userscript header and TypeScript syntax without returning file content', async () => {
      const result = await validateManagedScriptFile('demo.ts')

      expect(result).toEqual({
        ok: true,
        filename: 'demo.ts',
        header: {
          openCount: 1,
          closeCount: 1,
        },
        diagnostics: [],
      })
    })

    it('reports header and syntax diagnostics', async () => {
      mockRead({
        'broken.ts': "const value = '\n",
      })

      const result = await validateManagedScriptFile('broken.ts')

      expect(result.ok).toBe(false)
      expect(result.header).toEqual({ openCount: 0, closeCount: 0 })
      expect(result.diagnostics).toContain('Userscript header block must be present exactly once')
      expect(result.diagnostics.length).toBeGreaterThan(1)
    })
  })

  describe('script updatedAt metadata', () => {
    it('maps per-file updatedAt from index JSON with gist fallback', () => {
      const map = buildScriptUpdatedAtMapFromIndexContent(
        JSON.stringify({
          version: 1,
          updatedAt: '2026-01-02T00:00:00Z',
          scripts: [
            { filename: 'demo.ts', byteLength: 1, updatedAt: 1761481200000 },
            { filename: 'other.ts', byteLength: 1 },
          ],
        }),
        1761481300000
      )

      expect(map.get('demo.ts')).toBe(1761481200000)
      expect(map.get('other.ts')).toBe(1761481300000)
    })

    it('preserves updatedAt when script content hash is unchanged', async () => {
      mockGist({ 'demo.ts': scriptContent })
      await upsertManagedScriptFile('demo.ts', scriptContent)
      const firstIndex = getWrittenIndex()
      const preservedUpdatedAt = firstIndex.scripts[0].updatedAt

      mockGist({
        'demo.ts': scriptContent,
        'magickmonkey.scripts.index.json': JSON.stringify(firstIndex),
      })
      mockWriteGistFiles.mockClear()
      await upsertManagedScriptFile('demo.ts', scriptContent)

      const secondIndex = getWrittenIndex()
      expect(secondIndex.scripts[0].updatedAt).toBe(preservedUpdatedAt)
    })

    it('bumps updatedAt when script content changes', async () => {
      const before = 1761481200000
      mockGist({
        'demo.ts': scriptContent,
        'magickmonkey.scripts.index.json': JSON.stringify({
          version: 1,
          updatedAt: '2026-01-01T00:00:00Z',
          scripts: [{ filename: 'demo.ts', byteLength: 1, contentHash: '0'.repeat(64), updatedAt: before }],
        }),
      })

      await upsertManagedScriptFile('demo.ts', scriptContent.replace('Demo Script', 'Demo Script v2'))

      const index = getWrittenIndex()
      expect(index.scripts[0].updatedAt).toBeGreaterThan(before)
    })
  })
})
