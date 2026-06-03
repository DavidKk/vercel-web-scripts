import { buildGrantsFromGlobal, buildWithGlobalScriptSource, escapeInlineScriptText, isCspEvalError } from '../../shared/csp-script-executor'

describe('csp-script-executor', () => {
  it('isCspEvalError detects EvalError and CSP messages', () => {
    expect(isCspEvalError(new EvalError('unsafe-eval'))).toBe(true)
    expect(isCspEvalError(new Error('Content Security Policy'))).toBe(true)
    expect(isCspEvalError(new Error('other'))).toBe(false)
  })

  it('escapeInlineScriptText escapes closing script tags', () => {
    expect(escapeInlineScriptText('</script>')).toBe('<\\/script>')
  })

  it('buildWithGlobalScriptSource references CSP exec global key', () => {
    expect(buildWithGlobalScriptSource('void 0')).toContain('__VWS_CSP_EXEC_G__')
  })

  it('buildGrantsFromGlobal collects GM APIs from host without eval', () => {
    const host = { GM_getValue: () => null, GM_setValue: () => undefined }
    const grantsString = "...(typeof GM_getValue !== 'undefined' ? { GM_getValue } : {}), ...(typeof GM_setValue !== 'undefined' ? { GM_setValue } : {})"
    const grants = buildGrantsFromGlobal(host, grantsString)
    expect(grants).toEqual({ GM_getValue: host.GM_getValue, GM_setValue: host.GM_setValue })
  })
})
