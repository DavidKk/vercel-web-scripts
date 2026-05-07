import { fetchGist, readGistFile, writeGistFiles } from '@/services/gist'
import {
  batchPatchManagedScriptFiles,
  getManagedScriptSnippet,
  patchManagedScriptFile,
  replaceManagedScriptFile,
  searchManagedScriptFiles,
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
// @match https://example.org/*
// ==/UserScript==

console.log('other')
`

const mockFetchGist = jest.mocked(fetchGist)
const mockReadGistFile = jest.mocked(readGistFile)
const mockWriteGistFiles = jest.mocked(writeGistFiles)

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
          line: 8,
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
        line: 7,
        column: 1,
      })
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
        totalLines: 12,
        lines: ['// @name Demo Script', '// @version 1.0.0', '// @match https://example.com/*'],
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
        ],
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
      ])
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
})
