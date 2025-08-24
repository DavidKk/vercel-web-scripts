import ts from 'typescript'
import { Project } from 'ts-morph'

const SCRIPT_FILES = ['gm.d.ts', 'helpers.ts', 'rules.ts', 'scripts.ts']
const UI_NAMES = ['corner-widget', 'notification']
const UI_FILES = ['index.html', 'index.ts', 'index.css'] as const

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

export async function compileScriptTypings(contents: Record<string, string>) {
  const compiledContent = (() => {
    try {
      // Create a new ts-morph project
      const project = new Project({
        compilerOptions: {
          target: ts.ScriptTarget.Latest,
          module: ts.ModuleKind.None,
          declaration: true,
          emitDeclarationOnly: true,
          skipLibCheck: true,
          noEmitOnError: false,
          esModuleInterop: true,
          allowJs: true,
          checkJs: false,
        },
      })

      // Add all template files to the project
      Object.entries(contents).forEach(([fileName, content]) => {
        project.createSourceFile(fileName, content)
      })

      // Collect all type declarations
      const typeDeclarations: string[] = []

      // Process each source file
      project.getSourceFiles().forEach((sourceFile) => {
        // Extract interface declarations
        sourceFile.getInterfaces().forEach((interfaceDecl) => {
          // 将 interface 声明改为 declare interface
          const text = interfaceDecl.getText()
          if (text.startsWith('interface ')) {
            typeDeclarations.push('declare ' + text)
          } else {
            typeDeclarations.push(text)
          }
        })

        // Extract type alias declarations
        sourceFile.getTypeAliases().forEach((typeAlias) => {
          typeDeclarations.push(typeAlias.getText())
        })

        // Extract function declarations (all functions in non-module environment are global)
        sourceFile.getFunctions().forEach((funcDecl) => {
          // Extract only function signature without implementation
          const functionName = funcDecl.getName()
          if (!functionName) {
            return
          }

          // Get parameters
          const parameters = funcDecl.getParameters()
          const paramText = parameters.map((param) => {
            let paramTypeText = 'any'
            try {
              // 优先使用类型节点文本（如 MenuItem），否则回退到类型文本
              if (typeof param.getTypeNode === 'function') {
                paramTypeText = param.getTypeNode()?.getText() ?? 'any'
              } else if (typeof param.getType === 'function' && param.getType()) {
                const paramType = param.getType()
                paramTypeText = typeof paramType.getText === 'function' ? paramType.getText() : 'any'
              }
            } catch {
              paramTypeText = 'any'
            }
            const isOptional = typeof param.hasQuestionToken === 'function' ? param.hasQuestionToken() : false
            const paramName = typeof param.getName === 'function' ? param.getName() : ''
            return `${paramName}${isOptional ? '?' : ''}: ${paramTypeText}`
          })

          let returnTypeText = 'any'
          try {
            const returnType = funcDecl.getReturnType?.()
            returnTypeText = returnType && typeof returnType.getText === 'function' ? returnType.getText() : 'any'
          } catch {
            returnTypeText = 'any'
          }
          const signatureText = `declare function ${functionName}(${paramText.join(', ')}): ${returnTypeText}`
          typeDeclarations.push(signatureText)
        })

        // Extract variable statements that contain declarations
        sourceFile.getVariableStatements().forEach((varStmt) => {
          const text = varStmt.getText()
          if (text.includes('declare') || text.includes('const') || text.includes('let') || text.includes('var')) {
            // Extract only the declaration part, not the assignment
            const declarations = varStmt.getDeclarations()
            declarations.forEach((decl) => {
              const name = decl.getName()
              const type = decl.getType()
              if (name && type) {
                const typeText = type.getText()
                const declarationText = `declare const ${name}: ${typeText}`
                typeDeclarations.push(declarationText)
              }
            })
          }
        })
      })

      // Combine all type declarations from the template files
      return typeDeclarations.join('\n\n')
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Compiling gm script failed:`, error)
      return ''
    }
  })()

  return compiledContent
}
