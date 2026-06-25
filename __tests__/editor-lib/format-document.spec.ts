import { formatCssBasic, formatDocument, formatJson } from '../../editor-lib/src/format-document'

describe('editor-lib formatDocument', () => {
  it('formats valid JSON with 2-space indent', () => {
    const result = formatJson('{"a":1,"b":[2,3]}')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.text).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}\n')
    }
  })

  it('returns error for invalid JSON', () => {
    const result = formatJson('{not json')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0)
    }
  })

  it('indents basic CSS blocks', () => {
    const result = formatCssBasic('.a{color:red;}.b{margin:0;}')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.text).toContain('.a {')
      expect(result.text).toContain('color:red')
      expect(result.text).toContain('.b {')
    }
  })

  it('rejects unsupported profiles without Prettier', () => {
    const result = formatDocument('javascript', 'const x=1')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/JSON and CSS/i)
    }
  })
})
