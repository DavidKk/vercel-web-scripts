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
  const { content, grant, connect } = compileScripts(files)
  // createBanner is now synchronous (uses inline imports, no fetch needed)
  const withBanner = createBanner({ grant, connect, scriptUrl, version })
  const script = withBanner(content).trim()
  return prettier.format(script, PRETTIER_CONFIG)
}

function compileScripts(files: Record<string, string>) {
  const { compile, grants, connects } = createScriptCompiler()

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

function createScriptCompiler() {
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
        })

        return result.outputText
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Compiling ${file} script failed:`, error)
      }
    })()

    if (!compiledContent) {
      return
    }

    const executionWrapper = getExecutionWrapper(runAt, moduleName, match, file, compiledContent)

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
 * @returns Execution wrapper code
 */
function getExecutionWrapper(runAt: string, moduleName: string, match: string[], file: string, compiledContent: string): string {
  const scriptContent = `
        const { GME_ok, GME_info, GME_fail, GME_warn } = createGMELogger(${JSON.stringify(moduleName)})
        try {
          if (${JSON.stringify(match)}.some((m) => matchUrl(m)) || matchRule("${file}")) {
            GME_ok('Executing script \`${file}\`');\n
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
