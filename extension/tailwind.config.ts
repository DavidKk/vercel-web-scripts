import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Config } from 'tailwindcss'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * MagickMonkey extension UI palette (warm stone shell + indigo accent).
 * `canvas` vs `surface` must stay clearly distinct for card legibility.
 */
const mmPalette = {
  /** Page / popup backdrop — warm greige, not blue-grey */
  canvas: '#E8E4DE',
  /** Cards, header, footer, inputs */
  surface: '#FFFCF9',
  /** Hover rows, section strips, badges */
  muted: '#F3F0EB',
  border: '#B8B0A6',
  'border-light': '#D4CDC4',
  /** Primary actions, switch on, focus rings */
  accent: '#4F46E5',
  'accent-hover': '#4338CA',
  'accent-soft': '#EEF2FF',
  ink: '#1C1917',
  secondary: '#44403C',
  'text-muted': '#78716C',
  label: '#A8A29E',
  icon: '#9C948A',
  danger: '#DC2626',
  'danger-soft': '#FEECEC',
  success: '#047857',
  'success-soft': '#ECFDF5',
} as const

export default {
  content: [path.join(__dirname, 'src/**/*.{ts,html}')],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        mm: { ...mmPalette },
      },
      boxShadow: {
        mm: '0 1px 2px rgba(28, 25, 23, 0.06), 0 4px 14px rgba(28, 25, 23, 0.08)',
        'mm-sm': '0 1px 3px rgba(28, 25, 23, 0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config
