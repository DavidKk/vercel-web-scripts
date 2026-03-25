'use server'

import * as prettier from 'prettier'
import * as ts from 'typescript'

import { EXCLUDED_FILES, SCRIPTS_FILE_EXTENSION } from '@/constants/file'

import { createBanner } from './createBanner'
import { clearMeta, extractMeta } from './meta'

/**
 * RunAt execution timing values for Tampermonkey scripts
 */
enum RunAt {
  DocumentStart = 'document-start',
  DocumentBody = 'document-body',
  DocumentEnd = 'document-end',
  DocumentIdle = 'document-idle',
}

const PRETTIER_CONFIG: prettier.Options = {
  parser: 'babel',
  printWidth: 180,
  tabWidth: 2,
  useTabs: false,
  singleQuote: true,
  semi: false,
  trailingComma: 'es5',
  bracketSpacing: true,
}

/**
 * Extract first value from meta field (string or array)
 * @param value Meta field value (string, string array, or undefined)
 * @param defaultValue Default value if meta field is missing or invalid
 * @returns First value from array or the string value, or defaultValue
 */
function extractMetaValue(value: string | string[] | undefined, defaultValue: string): string {
  if (!value) {
    return defaultValue
  }
  if (typeof value === 'string') {
    return value
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[0]
  }
  return defaultValue
}

export interface CreateScriptParams {
  files: Record<string, string>
  scriptUrl: string
  version: string
}

export async function createUserScript({ scriptUrl, version, files }: CreateScriptParams) {
  const { content, grant, connect } = compileScripts(files, { strictCompile: true })
  const withBanner = await createBanner({ grant, connect, scriptUrl, version })
  const script = withBanner(content).trim()
  return prettier.format(script, PRETTIER_CONFIG)
}

/**
 * Options for compiling GIST script files to the remote bundle (no preset).
 */
export interface CompileScriptsOptions {
  /** When true, syntax / transpile errors fail the whole compile (throws). */
  strictCompile?: boolean
  /**
   * Epoch ms baked into each module wrapper for logs. Use a stable value (e.g. Gist `updated_at`) for
   * remote bundles so content hash matches between manifest and `/static/.../tampermonkey-remote.js`; omit for `Date.now()`.
   */
  scriptBuiltAt?: number
}

/**
 * Compile GIST files to script content only (no banner, no preset).
 * Used by /static/[key]/tampermonkey-remote.js for launcher mode.
 * Must be async when exported from a 'use server' file (Server Action).
 * @param files Map of path to source
 * @param options Compile options (default strictCompile: true)
 * @returns Compiled remote script body
 */
export async function getRemoteScriptContent(files: Record<string, string>, options: CompileScriptsOptions = { strictCompile: true }): Promise<string> {
  const { content } = compileScripts(files, {
    strictCompile: options.strictCompile !== false,
    scriptBuiltAt: options.scriptBuiltAt,
  })
  return content
}

/**
 * Format TypeScript transpile diagnostics for error responses.
 * @param displayFile Logical file path shown to the user
 * @param diagnostics Transpile diagnostics from TypeScript
 * @returns Single multi-line message or empty string if no errors
 */
function formatTranspileErrors(displayFile: string, diagnostics: readonly ts.Diagnostic[] | undefined): string {
  if (!diagnostics?.length) {
    return ''
  }
  const errors = diagnostics.filter((d) => d.category === ts.DiagnosticCategory.Error)
  if (errors.length === 0) {
    return ''
  }
  return errors
    .map((d) => {
      const text = ts.flattenDiagnosticMessageText(d.messageText, '\n')
      let pos = ''
      if (d.file && d.start !== undefined) {
        const { line, character } = ts.getLineAndCharacterOfPosition(d.file, d.start)
        pos = ` (${line + 1}:${character + 1})`
      }
      return `${displayFile}${pos}: ${text}`
    })
    .join('\n')
}

function compileScripts(files: Record<string, string>, options?: CompileScriptsOptions) {
  const strictCompile = options?.strictCompile !== false
  const scriptBuiltAt = options?.scriptBuiltAt !== undefined ? options.scriptBuiltAt : Date.now()
  const { compile, grants, connects } = createScriptCompiler(scriptBuiltAt, { strictCompile })

  const parts: string[] = []
  for (const name of Object.keys(files).sort()) {
    const content = files[name]
    const compiledContent = compile(name, content)
    if (!compiledContent) {
      continue
    }

    parts.push(compiledContent)
  }

  const grant = Array.from(grants).sort()
  const connect = Array.from(connects).sort()
  const content = parts.join('\n\n').trim()
  return { content, grant, connect }
}

function createScriptCompiler(scriptBuiltAt: number, options?: { strictCompile: boolean }) {
  const strictCompile = options?.strictCompile ?? false
  const matches = new Set<string>()
  const grants = new Set<string>()
  const connects = new Set<string>()

  const compile = (file: string, content: string) => {
    if (EXCLUDED_FILES.includes(file)) {
      return
    }

    // Skip .d.ts files (TypeScript declaration files)
    if (file.endsWith('.d.ts')) {
      return
    }

    // Only compile script files (.ts, .js), skip config files like package.json, tsconfig.json, etc.
    if (!SCRIPTS_FILE_EXTENSION.some((ext) => file.endsWith(ext))) {
      return
    }

    const meta = extractMeta(content)
    const match = !meta.match ? [] : Array.isArray(meta.match) ? meta.match : [meta.match]
    match.forEach((match) => typeof match === 'string' && match && matches.add(match))

    const connect = !meta.connect ? [] : Array.isArray(meta.connect) ? meta.connect : [meta.connect]
    connect.forEach((connect) => typeof connect === 'string' && connect && connects.add(connect))

    if (meta.grant) {
      const grant = Array.isArray(meta.grant) ? meta.grant : [meta.grant]
      grant.forEach((grant) => typeof grant === 'string' && grant && grants.add(grant))
    }

    // Extract module name: prefer @namespace, fallback to filename without extension
    const defaultModuleName = file.replace(/\.[^/.]+$/, '')
    const moduleName = extractMetaValue(meta.namespace, defaultModuleName)

    // Extract runAt meta value
    const runAt = extractMetaValue(meta.runAt, RunAt.DocumentIdle)

    const clearedContent = clearMeta(content)
    const compiledContent = (() => {
      try {
        const result = ts.transpileModule(clearedContent, {
          compilerOptions: {
            module: ts.ModuleKind.None,
            target: ts.ScriptTarget.ESNext,
            jsx: ts.JsxEmit.Preserve,
            esModuleInterop: true,
            allowJs: true,
            checkJs: false,
            removeComments: true,
          },
          fileName: file,
          reportDiagnostics: true,
        })

        const diagText = formatTranspileErrors(file, result.diagnostics)
        if (strictCompile && diagText) {
          throw new Error(diagText)
        }

        return result.outputText
      } catch (error) {
        if (strictCompile) {
          throw error instanceof Error ? error : new Error(String(error))
        }
        // eslint-disable-next-line no-console
        console.error(`Compiling ${file} script failed:`, error)
      }
    })()

    if (!compiledContent) {
      if (strictCompile && clearedContent.trim().length > 0) {
        throw new Error(`Compiling ${file} produced no output`)
      }
      return
    }

    const executionWrapper = getExecutionWrapper(runAt, moduleName, match, file, compiledContent, scriptBuiltAt)

    return `
      // ${file}
      ${executionWrapper}
    `
  }

  return { compile, matches, grants, connects }
}

/**
 * Get execution wrapper based on runAt value
 * @param runAt The @run-at meta value
 * @param moduleName Module name for logging
 * @param match Match patterns for URL matching
 * @param file File name
 * @param compiledContent Compiled script content
 * @param scriptBuiltAt Build timestamp for "Executing script" log
 * @returns Execution wrapper code
 */
function getExecutionWrapper(runAt: string, moduleName: string, match: string[], file: string, compiledContent: string, scriptBuiltAt: number): string {
  const builtAtDisplay = scriptBuiltAt > 0 && Number.isFinite(scriptBuiltAt) ? new Date(scriptBuiltAt).toLocaleString() : 'unknown'
  const scriptContent = `
        const { GME_ok, GME_info, GME_fail, GME_warn } = createGMELogger(${JSON.stringify(moduleName)})
        try {
          if (${JSON.stringify(match)}.some((m) => matchUrl(m)) || matchRule("${file}")) {
            GME_ok('Executing script \`${file}\` (built ${builtAtDisplay})');
            ${compiledContent}
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : Object.prototype.toString.call(error)
          GME_fail('Executing script \`${file}\` failed:', message)
        }
      `

  switch (runAt) {
    case RunAt.DocumentStart:
      // Execute immediately when script loads
      return `;(function() {${scriptContent}})()`

    case RunAt.DocumentBody:
      // Execute when document.body exists
      return `;(function() {
        function executeScript() {
          ${scriptContent}
        }
        if (document.body) {
          executeScript()
        } else {
          const observer = new MutationObserver(function(mutations, obs) {
            if (document.body) {
              obs.disconnect()
              executeScript()
            }
          })
          observer.observe(document.documentElement, { childList: true, subtree: true })
        }
      })()`

    case RunAt.DocumentEnd:
      // Execute when DOMContentLoaded fires
      return `;(function() {
        function executeScript() {
          ${scriptContent}
        }
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', executeScript)
        } else {
          executeScript()
        }
      })()`

    case RunAt.DocumentIdle:
    default:
      // Execute after DOMContentLoaded, when page is idle
      return `;(function() {
        function executeScript() {
          ${scriptContent}
        }
        function runWhenIdle() {
          if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(executeScript, { timeout: 2000 })
          } else {
            setTimeout(executeScript, 1)
          }
        }
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', runWhenIdle)
        } else {
          runWhenIdle()
        }
      })()`
  }
}
