'use server'

import * as prettier from 'prettier'
import * as ts from 'typescript'

import { EXCLUDED_FILES, SCRIPTS_FILE_EXTENSION } from '@/constants/file'

import { createBanner } from '.'
import { clearMeta, extractMeta } from './meta'

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

export interface CreateScriptParams {
  files: Record<string, string>
  scriptUrl: string
  version: string
}

export async function createUserScript({ scriptUrl, version, files }: CreateScriptParams) {
  const { content, grant, connect } = compileScripts(files)
  const withBanner = await createBanner({ grant, connect, scriptUrl, version })
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

  const grant = Array.from(grants)
  const connect = Array.from(connects)
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
    const moduleName = meta.namespace
      ? typeof meta.namespace === 'string'
        ? meta.namespace
        : Array.isArray(meta.namespace)
          ? meta.namespace[0]
          : file.replace(/\.[^/.]+$/, '')
      : file.replace(/\.[^/.]+$/, '')

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

    return `
      // ${file}
      ;(function() {
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
      })()
    `
  }

  return { compile, matches, grants, connects }
}
