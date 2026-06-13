import {
  buildPresetWithWindowScriptSource,
  buildWithGlobalStagedScriptSource,
  CspExtensionFallbackRequired,
  CspUserScriptExhausted,
  escapeInlineScriptText,
  isCspEvalError,
  isCspExtensionFallbackRequired,
  isCspUserScriptExhausted,
  wrapUserScriptIifeBody,
} from '../../shared/csp-script-executor'

describe('csp-script-executor', () => {
  it('isCspEvalError detects EvalError and CSP messages', () => {
    expect(isCspEvalError(new EvalError('unsafe-eval'))).toBe(true)
    expect(isCspEvalError(new Error('Content Security Policy'))).toBe(true)
    expect(isCspEvalError(new Error('other'))).toBe(false)
  })

  it('escapeInlineScriptText escapes closing script tags', () => {
    expect(escapeInlineScriptText('</script>')).toBe('<\\/script>')
  })

  it('wrapUserScriptIifeBody rethrows caught errors', () => {
    const wrapped = wrapUserScriptIifeBody('void 0;')
    expect(wrapped).toContain('catch(e){throw e;}')
  })

  it('buildPresetWithWindowScriptSource uses window as preset sandbox', () => {
    expect(buildPresetWithWindowScriptSource('var x=1;', 'void 0')).toContain('var g=window')
  })

  it('buildWithGlobalStagedScriptSource reads staged sandbox from window', () => {
    expect(buildWithGlobalStagedScriptSource('void 0')).toContain('__VWS_CSP_EXEC_G__')
  })

  it('isCspExtensionFallbackRequired detects CspExtensionFallbackRequired', () => {
    expect(isCspExtensionFallbackRequired(new CspExtensionFallbackRequired())).toBe(true)
    expect(isCspExtensionFallbackRequired(new Error('other'))).toBe(false)
  })

  it('isCspUserScriptExhausted detects CspUserScriptExhausted', () => {
    expect(isCspUserScriptExhausted(new CspUserScriptExhausted())).toBe(true)
    expect(isCspUserScriptExhausted(new Error('other'))).toBe(false)
  })
})
