/* eslint-disable no-console -- build script log sink */

/**
 * Minimal scoped logger for extension Node build scripts.
 * @param {string} scope
 */
export function createScriptLogger(scope) {
  const prefix = `[${scope}]`
  return {
    /**
     * @param {...unknown} args
     */
    info(...args) {
      console.log(prefix, ...args)
    },
    /**
     * @param {...unknown} args
     */
    warn(...args) {
      console.warn(prefix, ...args)
    },
    /**
     * @param {...unknown} args
     */
    error(...args) {
      console.error(prefix, ...args)
    },
  }
}
