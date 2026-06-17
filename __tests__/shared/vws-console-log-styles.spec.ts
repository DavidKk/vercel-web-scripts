import { buildVwsConsoleLogArgs, buildVwsConsoleMeta, buildVwsConsolePrefix, countVwsConsoleFormatSpecifiers, formatVwsConsolePlainText } from '@shared/vws-console-log-styles'

describe('vws-console-log-styles', () => {
  it('styles tier 1 badge and tier 2 level/scope (color only, no background)', () => {
    const { format, styles } = buildVwsConsolePrefix('Launcher', 'info')
    expect(format).toBe('%cVWS%c %cINFO%c %cLauncher%c')
    expect(styles).toHaveLength(6)
    expect(styles[0]).toContain('background:#4f46e5')
    expect(styles[2]).toContain('color:#0891b2')
    expect(styles[4]).toContain('color:#7c3aed')
  })

  it('does not append a trailing space to the format string (single space before message)', () => {
    const { format } = buildVwsConsolePrefix('Launcher', 'info')
    expect(format.endsWith(' ')).toBe(false)
    expect(countVwsConsoleFormatSpecifiers(format)).toBe(6)
  })

  it('passes tier-3 message as separate args after six styles', () => {
    const args = buildVwsConsoleLogArgs('Launcher', 'info', '[ModuleLoad] load:start', 'network=on')
    expect(args).toHaveLength(1 + 6 + 2)
    expect(args[0]).toBe('%cVWS%c %cINFO%c %cLauncher%c')
    expect(args.slice(7)).toEqual(['[ModuleLoad] load:start', 'network=on'])
  })

  it('formats plain preview with single spaces between tiers', () => {
    expect(formatVwsConsolePlainText('Preset', 'ok', 'Remote script ready.')).toBe('VWS OK Preset Remote script ready.')
    expect(formatVwsConsolePlainText('Launcher', 'info', '[ModuleLoad] load:start')).toBe('VWS INFO Launcher [ModuleLoad] load:start')
  })

  it('builds meta with one space between level and scope', () => {
    expect(buildVwsConsoleMeta('Launcher', 'info')).toBe('INFO Launcher')
  })
})
