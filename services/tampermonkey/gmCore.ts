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

export function isMissStackblitzFiles(...files: string[]) {
  return files.some((file) => !STACKBLITZ_FILES.includes(file))
}
