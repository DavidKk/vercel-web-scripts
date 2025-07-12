import ts from 'typescript'
import { Project } from 'ts-morph'

const SCRIPT_FILES = ['gm.d.ts', 'helpers.ts', 'rules.ts', 'scripts.ts']

export async function fetchTemplates(baseUrl: string) {
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

export async function compileGMCore(baseUrl: string) {
  const fileContents = await fetchTemplates(baseUrl)
  const compiledContent = (() => {
    try {
      const combinedContent = Object.values(fileContents).join('\n')
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

export async function compileGMCoreTypings(baseUrl: string) {
  const fileContents = await fetchTemplates(baseUrl)
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
      Object.entries(fileContents).forEach(([fileName, content]) => {
        project.createSourceFile(fileName, content)
      })

      // Collect all type declarations
      const typeDeclarations: string[] = []

      // Process each source file
      project.getSourceFiles().forEach((sourceFile) => {
        // Extract interface declarations
        sourceFile.getInterfaces().forEach((interfaceDecl) => {
          typeDeclarations.push(interfaceDecl.getText())
        })

        // Extract type alias declarations
        sourceFile.getTypeAliases().forEach((typeAlias) => {
          typeDeclarations.push(typeAlias.getText())
        })

        // Extract function declarations (all functions in non-module environment are global)
        sourceFile.getFunctions().forEach((funcDecl) => {
          // Extract only function signature without implementation
          const functionName = funcDecl.getName()
          if (functionName) {
            // Get parameters
            const parameters = funcDecl.getParameters()
            const paramText = parameters
              .map((param) => {
                const paramType = param.getType()
                const isOptional = param.hasQuestionToken()
                const paramName = param.getName()
                return `${paramName}${isOptional ? '?' : ''}: ${paramType.getText()}`
              })
              .join(', ')

            // Get return type
            const returnType = funcDecl.getReturnType()
            const returnTypeText = returnType.getText()

            const signatureText = `declare function ${functionName}(${paramText}): ${returnTypeText}`
            typeDeclarations.push(signatureText)
          }
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
