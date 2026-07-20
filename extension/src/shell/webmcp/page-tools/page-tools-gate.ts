/**
 * Pure gate for whether builtin `vws.page.*` tools may register on a tab.
 * Async gathering of these flags lives in page-tools-ensure (background).
 *
 * Note: matching MagickMonkey scripts is NOT required — builtin page tools exist
 * precisely when a page has no script-registered WebMCP tools.
 */
export interface PageToolsGateContext {
  /** Extension master switch + tab not disabled. */
  shellEnabled: boolean
  /** Tab URL is http(s). */
  isHttpUrl: boolean
  /** chrome.userScripts API usable. */
  userScriptsAvailable: boolean
}

/**
 * Return true when all injection gates pass for builtin page tools.
 * @param ctx Precomputed gate inputs
 */
export function shouldRegisterPageTools(ctx: PageToolsGateContext): boolean {
  if (!ctx.shellEnabled) {
    return false
  }
  if (!ctx.isHttpUrl) {
    return false
  }
  if (!ctx.userScriptsAvailable) {
    return false
  }
  return true
}
