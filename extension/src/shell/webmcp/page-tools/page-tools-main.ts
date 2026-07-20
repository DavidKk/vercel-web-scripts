/**
 * MAIN-world entry for builtin page tools.
 * Built as IIFE `page-tools-main.js` and injected via userScripts.
 * Exposes `globalThis.__VWS_ENSURE_PAGE_TOOLS__` for the background ensure invoke.
 */
import { ensureVwsPageToolsInMainWorld } from './page-tools-register'
;(globalThis as typeof globalThis & { __VWS_ENSURE_PAGE_TOOLS__?: typeof ensureVwsPageToolsInMainWorld }).__VWS_ENSURE_PAGE_TOOLS__ = ensureVwsPageToolsInMainWorld
