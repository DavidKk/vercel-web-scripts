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
  const matches = new Set<string>()
  const grants = new Set<string>()
  const parts = Array.from(
    (function* () {
      for (const [file, content] of Object.entries(files)) {
        if (EXCLUDED_FILES.includes(file)) {
          continue
        }

        const meta = extractMeta(content)
        const match = !meta.match ? [] : Array.isArray(meta.match) ? meta.match : [meta.match]
        match.forEach((match) => typeof match === 'string' && match && matches.add(match))

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
          continue
        }

        yield `
          // ${file}
          try {
            if (${JSON.stringify(match)}.some((m) => matchUrl(m)) || matchRule("${file}")) {
              ${compiledContent}
            }
          } catch (error) {
            console.error('Executing script \`${file}\` failed:', error)
          }
        `
      }
    })()
  )

  const grant = Array.from(grants)
  const withBanner = createBanner({ grant, scriptUrl, version })
  const content = parts.join('\n\n')
  const script = withBanner(content).trim()
  return prettier.format(script, PRETTIER_CONFIG)
}
