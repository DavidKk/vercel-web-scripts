import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('postcss-load-config').Config} */
export default {
  plugins: {
    // Tailwind v4: config is referenced from CSS via `@config` (see src/ui/tailwind.css).
    '@tailwindcss/postcss': {
      base: __dirname,
    },
  },
}
