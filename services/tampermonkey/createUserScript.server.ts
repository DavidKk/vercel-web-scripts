'use server'

import * as ts from 'typescript'
import * as prettier from 'prettier'
import { EXCLUDED_FILES } from '@/constants/file'
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

  const parts = []
  for (const [file, content] of Object.entries(files)) {
    const compiledContent = compile(file, content)
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

    const meta = extractMeta(content)
    const match = !meta.match ? [] : Array.isArray(meta.match) ? meta.match : [meta.match]
    match.forEach((match) => typeof match === 'string' && match && matches.add(match))

    const connect = !meta.connect ? [] : Array.isArray(meta.connect) ? meta.connect : [meta.connect]
    connect.forEach((connect) => typeof connect === 'string' && connect && connects.add(connect))

    if (meta.grant) {
      const grant = Array.isArray(meta.grant) ? meta.grant : [meta.grant]
      grant.forEach((grant) => typeof grant === 'string' && grant && grants.add(grant))
    }

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
      try {
        if (${JSON.stringify(match)}.some((m) => matchUrl(m)) || matchRule("${file}")) {
          GM_log('[OK] Executing script \`${file}\`');\n
          ${compiledContent}
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : Object.prototype.toString.call(error)
        GM_log('[ERROR] Executing script \`${file}\` failed:', message)
      }
    `
  }

  return { compile, matches, grants, connects }
}
