import {
  buildPresetWithGScriptSource,
  buildWithGlobalStagedScriptSource,
  buildWithGlobalWindowScriptSource,
  CSP_EXEC_MODULE_GLOBAL_KEY,
  CSP_EXEC_PRESET_GLOBAL_KEY,
  CspExtensionFallbackRequired,
  CspUserScriptExhausted,
  escapeInlineScriptText,
  isCspEvalError,
  isCspExtensionFallbackRequired,
  isCspUserScriptExhausted,
  isTrustedTypesAssignmentError,
  shouldRememberCspUserScriptAttempt,
  wrapUserScriptIifeBody,
} from '@shared/csp-script-executor'

describe('csp-script-executor', () => {
  it('isCspEvalError detects EvalError and CSP messages', () => {
    expect(isCspEvalError(new EvalError('unsafe-eval'))).toBe(true)
    expect(isCspEvalError(new Error('Content Security Policy'))).toBe(true)
    expect(isCspEvalError(new Error('other'))).toBe(false)
  })

  it('isTrustedTypesAssignmentError detects TrustedHTML and TrustedScript errors', () => {
    expect(isTrustedTypesAssignmentError(new Error("This document requires 'TrustedHTML' assignment."))).toBe(true)
    expect(isTrustedTypesAssignmentError(new Error("This document requires 'TrustedScript' assignment."))).toBe(true)
    expect(isTrustedTypesAssignmentError(new Error('other'))).toBe(false)
  })

  it('escapeInlineScriptText escapes closing script tags', () => {
    expect(escapeInlineScriptText('</script>')).toBe('<\\/script>')
  })

  it('wrapUserScriptIifeBody rethrows caught errors', () => {
    const wrapped = wrapUserScriptIifeBody('void 0;')
    expect(wrapped).toContain('catch(e){throw e;}')
  })

  it('should build preset source from staged launcher sandbox on window', () => {
    const source = buildPresetWithGScriptSource('var x=1;', 'void 0')
    expect(source).toContain(`window[${JSON.stringify(CSP_EXEC_PRESET_GLOBAL_KEY)}]`)
    expect(source).toContain('CSP user-script preset sandbox missing on window')
  })

  it('buildWithGlobalStagedScriptSource reads staged sandbox from window', () => {
    expect(buildWithGlobalStagedScriptSource('void 0')).toContain(CSP_EXEC_MODULE_GLOBAL_KEY)
    expect(buildWithGlobalStagedScriptSource('void 0')).not.toContain(CSP_EXEC_PRESET_GLOBAL_KEY)
  })

  it('buildWithGlobalWindowScriptSource uses window directly without staged sandbox', () => {
    expect(buildWithGlobalWindowScriptSource('void 0')).toContain('var global=window')
    expect(buildWithGlobalWindowScriptSource('void 0')).not.toContain(CSP_EXEC_MODULE_GLOBAL_KEY)
    expect(buildWithGlobalWindowScriptSource('void 0')).not.toContain(CSP_EXEC_PRESET_GLOBAL_KEY)
  })

  it('isCspExtensionFallbackRequired detects CspExtensionFallbackRequired', () => {
    expect(isCspExtensionFallbackRequired(new CspExtensionFallbackRequired())).toBe(true)
    expect(isCspExtensionFallbackRequired(new Error('other'))).toBe(false)
  })

  it('isCspUserScriptExhausted detects CspUserScriptExhausted', () => {
    expect(isCspUserScriptExhausted(new CspUserScriptExhausted())).toBe(true)
    expect(isCspUserScriptExhausted(new Error('other'))).toBe(false)
  })

  it('only remembers preset user-script fallback attempts', () => {
    expect(shouldRememberCspUserScriptAttempt('preset')).toBe(true)
    expect(shouldRememberCspUserScriptAttempt('global')).toBe(false)
  })
})
