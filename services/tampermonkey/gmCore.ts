import ts from 'typescript'

const SCRIPT_FILES = ['helpers.ts', 'rules.ts', 'scripts.ts']
const UI_NAMES = ['corner-widget', 'notification']
const UI_FILES = ['index.html', 'index.ts', 'index.css'] as const
const STACKBLITZ_FILES = ['package.json', 'tsconfig.json', 'typings.d.ts', 'gitignore']

export async function fetchCoreScripts(baseUrl: string) {
  const promises = SCRIPT_FILES.map(async (file) => {
    const url = `${baseUrl}/gm-template/${file}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error('Failed to fetch template')
    }

    const content = await response.text()
    return { [file]: content }
  })

  const results = await Promise.all(promises)
  return results.reduce((acc, result) => ({ ...acc, ...result }), {})
}

export async function fetchCoreUIs(baseUrl: string, tsOnly = false) {
  const group = new Map<string, Record<string, string>>()
  const promises = UI_NAMES.map(async (name) => {
    const files = await Promise.all(
      (tsOnly ? ['index.ts'] : UI_FILES).map(async (filename) => {
        const url = `${baseUrl}/gm-template/ui/${name}/${filename}`
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`Failed to fetch ${url}`)
        }

        const content = await response.text()
        const template = content.trim()
        const extname = filename.split('.').pop()!
        return { [extname]: template }
      })
    )

    group.set(
      name,
      files.reduce((acc, file) => ({ ...acc, ...file }), {})
    )
  })

  await Promise.all(promises)
  const contents: Record<string, string> = {}
  group.entries().forEach(([name, item]) => {
    const { html = '', css = '', ts = '' } = item
    const content = tsOnly
      ? ts
      : `${ts}
      if (!document.querySelector('vercel-web-script-${name}')) {
        const container = document.createElement('vercel-web-script-${name}');
        container.innerHTML = \`<template><style>${css}</style>${html}</template>\`;
        document.body.appendChild(container);
      }
    `

    contents[name] = content
  })

  return contents
}

export async function fetchStackblitzTemplate(baseUrl: string) {
  const promises = STACKBLITZ_FILES.map(async (filename) => {
    const url = `${baseUrl}/gm-template/stackblitz/${filename}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}`)
    }

    if (filename === 'gitignore') {
      filename = '.gitignore'
    }

    const content = await response.text()
    const template = content.trim()
    return { [filename]: template }
  })

  const results = await Promise.all(promises)
  return results.reduce((acc, result) => ({ ...acc, ...result }), {})
}

export async function compileScripts(contents: Record<string, string>) {
  const compiledContent = (() => {
    try {
      const combinedContent = Object.values(contents).join('\n')
      const result = ts.transpileModule(combinedContent, {
        compilerOptions: {
          module: ts.ModuleKind.None,
          target: ts.ScriptTarget.ESNext,
          jsx: ts.JsxEmit.Preserve,
          esModuleInterop: true,
          allowJs: true,
          checkJs: false,
        },
        fileName: 'gm-core.ts',
      })

      return result.outputText
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Compiling gm script failed:`, error)
    }
  })()

  return compiledContent
}

/**
 * Fetch and compile main script
 * @param baseUrl Base URL for fetching the script
 * @param variables Variables to inject into the script
 * @returns Compiled script content
 */
export async function fetchAndCompileMainScript(
  baseUrl: string,
  variables: {
    __BASE_URL__: string
    __RULE_API_URL__: string
    __RULE_MANAGER_URL__: string
    __EDITOR_URL__: string
    __HMK_URL__: string
    __SCRIPT_URL__: string
    __IS_DEVELOP_MODE__: boolean
    __HOSTNAME_PORT__: string
    __GRANTS_STRING__: string
  }
): Promise<string> {
  const url = `${baseUrl}/gm-template/main.ts`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch main script from ${url}`)
  }

  let content = await response.text()

  // Replace variable declarations with actual values
  content = content.replace(/declare const __BASE_URL__: string/g, `const __BASE_URL__ = ${JSON.stringify(variables.__BASE_URL__)}`)
  content = content.replace(/declare const __RULE_API_URL__: string/g, `const __RULE_API_URL__ = ${JSON.stringify(variables.__RULE_API_URL__)}`)
  content = content.replace(/declare const __RULE_MANAGER_URL__: string/g, `const __RULE_MANAGER_URL__ = ${JSON.stringify(variables.__RULE_MANAGER_URL__)}`)
  content = content.replace(/declare const __EDITOR_URL__: string/g, `const __EDITOR_URL__ = ${JSON.stringify(variables.__EDITOR_URL__)}`)
  content = content.replace(/declare const __HMK_URL__: string/g, `const __HMK_URL__ = ${JSON.stringify(variables.__HMK_URL__)}`)
  content = content.replace(/declare const __SCRIPT_URL__: string/g, `const __SCRIPT_URL__ = ${JSON.stringify(variables.__SCRIPT_URL__)}`)
  content = content.replace(/declare const __IS_DEVELOP_MODE__: boolean/g, `const __IS_DEVELOP_MODE__ = ${variables.__IS_DEVELOP_MODE__}`)
  content = content.replace(/declare const __HOSTNAME_PORT__: string/g, `const __HOSTNAME_PORT__ = ${JSON.stringify(variables.__HOSTNAME_PORT__)}`)
  content = content.replace(/declare const __GRANTS_STRING__: string/g, `const __GRANTS_STRING__ = ${JSON.stringify(variables.__GRANTS_STRING__)}`)
  // Keep placeholder for GIST scripts (will be replaced in index.ts after compilation)
  // The placeholder is inside executeGistScripts function body

  // Compile TypeScript to JavaScript
  const compiledContent = (() => {
    try {
      const result = ts.transpileModule(content, {
        compilerOptions: {
          module: ts.ModuleKind.None,
          target: ts.ScriptTarget.ESNext,
          jsx: ts.JsxEmit.Preserve,
          esModuleInterop: true,
          allowJs: true,
          checkJs: false,
        },
        fileName: 'main.ts',
      })

      return result.outputText
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Compiling main script failed:`, error)
      throw error
    }
  })()

  return compiledContent
}

export function isMissStackblitzFiles(...files: string[]) {
  return files.some((file) => !STACKBLITZ_FILES.includes(file))
}
