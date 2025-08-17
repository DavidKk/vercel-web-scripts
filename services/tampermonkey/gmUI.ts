import ts from 'typescript'

const UI_NAMES = ['corner-widget']
const UI_FILES = ['index.html', 'index.ts', 'index.css'] as const

export async function fetchGMUIFiles(baseUrl: string) {
  const group = new Map<string, Record<string, string>>()
  const promises = UI_NAMES.map(async (name) => {
    const files = await Promise.all(
      UI_FILES.map(async (filename) => {
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
  return group
}

export async function compileGMUi(baseUrl: string) {
  const group = await fetchGMUIFiles(baseUrl)
  const contents: string[] = []
  group.entries().forEach(([name, item]) => {
    const { html = '', css = '', ts = '' } = item
    const content = `${ts}
      const container = document.createElement('vercel-web-script-${name}');
      container.innerHTML = \`<template><style>${css}</style>${html}</template>\`;
      document.body.appendChild(container);
    `

    contents.push(content)
  })

  const compiledContent = (() => {
    try {
      const combinedContent = contents.join('\n')
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
