import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Config } from 'tailwindcss'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** MagickMonkey extension UI palette (clean admin shell + bright magic accents). */
const mmPalette = {
  canvas: '#F6F8FB',
  surface: '#FFFFFF',
  muted: '#EEF3F8',
  border: '#B8C7D9',
  'border-light': '#DCE5EF',
  accent: '#2563EB',
  'accent-hover': '#1D4ED8',
  'accent-soft': '#EAF2FF',
  magic: '#8B5CF6',
  'magic-soft': '#F1ECFF',
  cyan: '#06B6D4',
  'cyan-soft': '#E6FAFD',
  ink: '#162033',
  secondary: '#334155',
  'text-muted': '#687589',
  label: '#8B9AAF',
  icon: '#7B8CA3',
  danger: '#EF4444',
  'danger-soft': '#FFF1F1',
  warn: '#F59E0B',
  'warn-hover': '#D97706',
  'warn-soft': '#FFFBEB',
  success: '#10B981',
  'success-soft': '#ECFDF5',
} as const

export default {
  content: [path.join(__dirname, 'src/**/*.{ts,html,ejs}')],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        mm: { ...mmPalette },
      },
      boxShadow: {
        mm: '0 1px 2px rgba(22, 32, 51, 0.05), 0 10px 26px rgba(22, 32, 51, 0.08)',
        'mm-sm': '0 1px 4px rgba(22, 32, 51, 0.09)',
        'mm-glow': '0 0 0 1px rgba(139, 92, 246, 0.08), 0 12px 30px rgba(37, 99, 235, 0.16)',
      },
    },
  },
  plugins: [],
} satisfies Config
