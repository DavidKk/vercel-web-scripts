// Import template resources from unified templates index
import { getCoreScriptsSource, getMainScriptSource, getUIModules } from '@templates/index'
import ts from 'typescript'

/**
 * Get core scripts from templates
 * Delegates to templates/index.ts for centralized resource management
 * @returns Array of core script file contents, in order
 */
export { getCoreScriptsSource, getMainScriptSource }

/**
 * Load UI resources from templates at build time
 * @param tsOnly Whether to load only TypeScript files
 * @returns Array of UI file contents, in order
 */
export function loadCoreUIsInline(tsOnly = false): string[] {
  const contents: string[] = []

  /**
   * Helper function to safely append element to document.body
   * Waits for document.body to be available before appending
   * This is necessary because scripts run at @run-at document-start
   * when document.body may not exist yet
   */
  const safeAppendToBody = `;(function(container) {
    if (document.body) {
      document.body.appendChild(container);
    } else {
      const observer = new MutationObserver(function(mutations, obs) {
        if (document.body) {
          obs.disconnect();
          document.body.appendChild(container);
        }
      });

      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  })`

  // Get UI modules from centralized templates index
  const UI_MODULES = getUIModules()

  for (const module of UI_MODULES) {
    const content = tsOnly
      ? module.ts
      : `${module.ts}
      ;(function() {
        if (!document.querySelector('${module.elementName}')) {
          const container = document.createElement('${module.elementName}');
          // Set innerHTML before appending to DOM to ensure template is available in connectedCallback
          container.innerHTML = \`<template><style>${module.css}</style>${module.html}</template>\`;
          // Use requestAnimationFrame to ensure innerHTML is processed before appending
          requestAnimationFrame(function() {
            ${safeAppendToBody}(container);
          });
        }
      })();
    `
    contents.push(content)
  }

  return contents
}

/**
 * Compile TypeScript content to JavaScript
 * @param contents Array of file contents to compile, in order
 * @returns Compiled JavaScript content
 */
export function compileScripts(contents: string[]): string {
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
          removeComments: true,
        },
        fileName: 'gm-core.ts',
      })

      return result.outputText
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Compiling gm script failed:`, error)
      throw error
    }
  })()

  return compiledContent
}

/**
 * Compile main script with injected variables
 * @param content Main script content
 * @param variables Variables to inject into the script
 * @returns Compiled script content
 */
export function compileMainScript(
  content: string,
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
): string {
  const variableDeclarations = `
const __BASE_URL__ = ${JSON.stringify(variables.__BASE_URL__)};
const __RULE_API_URL__ = ${JSON.stringify(variables.__RULE_API_URL__)};
const __RULE_MANAGER_URL__ = ${JSON.stringify(variables.__RULE_MANAGER_URL__)};
const __EDITOR_URL__ = ${JSON.stringify(variables.__EDITOR_URL__)};
const __HMK_URL__ = ${JSON.stringify(variables.__HMK_URL__)};
const __SCRIPT_URL__ = ${JSON.stringify(variables.__SCRIPT_URL__)};
const __IS_DEVELOP_MODE__ = ${variables.__IS_DEVELOP_MODE__};
const __HOSTNAME_PORT__ = ${JSON.stringify(variables.__HOSTNAME_PORT__)};
const __GRANTS_STRING__ = ${JSON.stringify(variables.__GRANTS_STRING__)};
`
  const fullContent = variableDeclarations + content

  const compiledContent = (() => {
    try {
      const result = ts.transpileModule(fullContent, {
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
