import ts from 'typescript'

const files = ['helpers.ts', 'rules.ts', 'scripts.ts']

export function fetchTemplates(baseUrl: string) {
  const promises = files.map(async (file) => {
    const url = `${baseUrl}/gm-template/${file}`
    const repsonse = await fetch(url)
    if (!repsonse.ok) {
      throw new Error('Failed to fetch template')
    }

    return repsonse.text()
  })

  return Promise.all(promises)
}

export async function compileGMCore(baseUrl: string) {
  const contents = await fetchTemplates(baseUrl)
  const compiledContent = (() => {
    try {
      const result = ts.transpileModule(contents.join('\n'), {
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
