// Import core scripts using ?raw to inline file content at build time
import helpersSource from '@templates/helpers.ts?raw'
import mainSource from '@templates/main.ts?raw'
import rulesSource from '@templates/rules.ts?raw'
import scriptsSource from '@templates/scripts.ts?raw'
import cornerWidgetCss from '@templates/ui/corner-widget/index.css?raw'
import cornerWidgetHtml from '@templates/ui/corner-widget/index.html?raw'
import cornerWidgetTs from '@templates/ui/corner-widget/index.ts?raw'
import notificationCss from '@templates/ui/notification/index.css?raw'
import notificationHtml from '@templates/ui/notification/index.html?raw'
import notificationTs from '@templates/ui/notification/index.ts?raw'
import ts from 'typescript'

/**
 * UI module configuration interface
 * Each module defines its name, TypeScript source, CSS, HTML, and custom element name
 */
interface UIModuleConfig {
  /** Module name used as key in the returned object */
  name: string
  /** TypeScript source code */
  ts: string
  /** CSS styles */
  css: string
  /** HTML template */
  html: string
  /** Custom element name for DOM insertion */
  elementName: string
}

/**
 * UI module configuration
 * To add a new UI module, simply add a new entry to this array
 */
const UI_MODULES: UIModuleConfig[] = [
  {
    name: 'corner-widget',
    ts: cornerWidgetTs,
    css: cornerWidgetCss,
    html: cornerWidgetHtml,
    elementName: 'vercel-web-script-corner-widget',
  },
  {
    name: 'notification',
    ts: notificationTs,
    css: notificationCss,
    html: notificationHtml,
    elementName: 'vercel-web-script-notification',
  },
]

/**
 * Get core scripts from templates
 * Loaded at build time using ?raw imports
 * Works in both Node.js and Edge Runtime (no filesystem access needed)
 * @returns Object containing all core script file contents
 */
export function getCoreScriptsSource(): Record<string, string> {
  return {
    'helpers.ts': helpersSource,
    'rules.ts': rulesSource,
    'scripts.ts': scriptsSource,
  }
}

/**
 * Get main script content from templates
 * Loaded at build time using ?raw import
 * @returns Main script content
 */
export function getMainScriptSource(): string {
  return mainSource
}

/**
 * Load UI resources from templates at build time
 * @param tsOnly Whether to load only TypeScript files
 * @returns Object containing all UI file contents
 */
export function loadCoreUIsInline(tsOnly = false): Record<string, string> {
  const contents: Record<string, string> = {}

  /**
   * Helper function to safely append element to document.body
   * Waits for document.body to be available before appending
   * This is necessary because scripts run at @run-at document-start
   * when document.body may not exist yet
   */
  const safeAppendToBody = `(function(container) {
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

  for (const module of UI_MODULES) {
    const content = tsOnly
      ? module.ts
      : `${module.ts}
      (function() {
        if (!document.querySelector('${module.elementName}')) {
          const container = document.createElement('${module.elementName}');
          container.innerHTML = \`<template><style>${module.css}</style>${module.html}</template>\`;
          ${safeAppendToBody}(container);
        }
      })();
    `
    contents[module.name] = content
  }

  return contents
}

/**
 * Compile TypeScript content to JavaScript
 * @param contents Record of file contents to compile
 * @returns Compiled JavaScript content
 */
export function compileScripts(contents: Record<string, string>): string {
  const compiledContent = (() => {
    try {
      const sortedKeys = Object.keys(contents).sort()
      const combinedContent = sortedKeys.map((key) => contents[key]).join('\n')
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
