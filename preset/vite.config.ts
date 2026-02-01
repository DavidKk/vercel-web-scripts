import path from 'path'
import { defineConfig } from 'vite'

/**
 * Vite config for preset (gm-templates migrated as ES modules).
 * Entry: preset/src/entry.ts
 * Output: preset/dist/ipreset.js
 * Target: Chrome, ESNext.
 */
export default defineConfig({
  root: __dirname,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, 'src/entry.ts'),
      name: 'GME',
      fileName: () => 'preset.js',
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
    target: 'esnext',
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
