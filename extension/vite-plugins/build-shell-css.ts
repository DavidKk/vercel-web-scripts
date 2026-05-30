import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'

import { build, type UserConfig } from 'vite'

/**
 * Build extension page stylesheet (Tailwind → shell.css) into {@link outDir}.
 */
export async function buildShellCss(extensionRoot: string, outDir: string): Promise<void> {
  const distDir = path.resolve(extensionRoot, outDir)
  const sharedCss: UserConfig['css'] = {
    postcss: path.resolve(extensionRoot, 'postcss.config.mjs'),
  }

  await build({
    configFile: false,
    root: extensionRoot,
    build: {
      outDir: distDir,
      emptyOutDir: false,
      rollupOptions: {
        input: path.resolve(extensionRoot, 'src/ui/document-css-entry.ts'),
        output: {
          entryFileNames: '_document-css.js',
          assetFileNames: 'shell.css',
        },
      },
      target: 'esnext',
      minify: false,
    },
    css: sharedCss,
  })

  rmSync(path.join(distDir, '_document-css.js'), { force: true })
  rmSync(path.join(distDir, '_document-css.js.map'), { force: true })
}

export function shellCssPath(extensionRoot: string, outDir = 'dist'): string {
  return path.join(extensionRoot, outDir, 'shell.css')
}

export async function ensureShellCss(extensionRoot: string, outDir = 'dist'): Promise<string> {
  const file = shellCssPath(extensionRoot, outDir)
  if (!existsSync(file)) {
    await buildShellCss(extensionRoot, outDir)
  }
  return file
}
