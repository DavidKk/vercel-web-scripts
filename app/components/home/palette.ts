/**
 * Homepage design tokens — aligned with the editor / login shell palette.
 *
 * Canvas: #111318 · Surface: #171a21 / #1b1f27 · Border: #2a303a · Brand: #3b82f6
 */
export const homePalette = {
  canvas: '#111318',
  surface: '#171a21',
  surfaceRaised: '#1b1f27',
  border: '#2a303a',
  brand: '#3b82f6',
  brandHover: '#2563eb',
  brandSoft: '#60a5fa',
  accentViolet: '#8b5cf6',
  accentVioletSoft: '#a78bfa',
  textPrimary: '#e6eaf0',
  textSecondary: '#9aa4b2',
  textMuted: '#6f7a8a',
} as const

/** Tailwind class bundles — keep as static strings for JIT. */
export const homeUi = {
  canvas: 'bg-[#111318] text-[#e6eaf0]',
  header: 'border-[#2a303a]/70 bg-[#111318]/80',
  eyebrow: 'text-[11px] font-medium uppercase tracking-[0.14em] text-[#60a5fa] sm:text-xs',
  titleGradient: 'bg-gradient-to-r from-[#e6eaf0] via-[#dbeafe] to-[#60a5fa] bg-clip-text text-transparent',
  btnPrimary: 'rounded-lg bg-[#3b82f6] text-white shadow-[0_8px_24px_-8px_rgba(59,130,246,0.42)] transition hover:bg-[#2563eb]',
  btnSecondary: 'rounded-lg border border-[#2a303a] bg-[#1b1f27] text-[#e6eaf0] transition hover:border-[#3f4a5c] hover:bg-[#171a21]',
  sectionPanel: 'rounded-2xl border border-[#2a303a]/60 bg-[#111318]/80',
  cardInner: 'rounded-xl border border-[#2a303a]/90 bg-[#111318]/70',
  link: 'text-[#60a5fa] transition hover:text-[#93c5fd]',
  heading: 'font-semibold tracking-tight text-[#e6eaf0]',
  body: 'text-[#9aa4b2]',
  muted: 'text-[#6f7a8a]',
} as const

export const pillarAccentStyles = {
  blue: {
    icon: 'bg-[#3b82f6]/10 text-[#60a5fa] ring-[#3b82f6]/20',
    dot: 'bg-[#60a5fa]',
    hover: 'hover:border-[#3b82f6]/30 hover:shadow-[#3b82f6]/5',
  },
  violet: {
    icon: 'bg-[#8b5cf6]/10 text-[#a78bfa] ring-[#8b5cf6]/20',
    dot: 'bg-[#a78bfa]',
    hover: 'hover:border-[#8b5cf6]/30 hover:shadow-[#8b5cf6]/5',
  },
  indigo: {
    icon: 'bg-indigo-500/10 text-indigo-400 ring-indigo-500/20',
    dot: 'bg-indigo-400',
    hover: 'hover:border-indigo-500/30 hover:shadow-indigo-500/5',
  },
} as const
