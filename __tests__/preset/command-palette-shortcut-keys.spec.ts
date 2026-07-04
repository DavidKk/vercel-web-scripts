/**
 * @jest-environment jsdom
 */
import { isCommandPaletteBackquoteKey, isKeyboardEventInEditableTarget } from '../../preset/src/ui/command-palette/shortcut-keys'

describe('isCommandPaletteBackquoteKey', () => {
  it('should match US layout backtick via event.key', () => {
    expect(isCommandPaletteBackquoteKey({ code: 'Backquote', key: '`' })).toBe(true)
  })

  it('should match physical Backquote when event.key is middle dot on Chinese macOS', () => {
    expect(isCommandPaletteBackquoteKey({ code: 'Backquote', key: '·' })).toBe(true)
  })

  it('should match shifted tilde on US layout', () => {
    expect(isCommandPaletteBackquoteKey({ code: 'Backquote', key: '~' })).toBe(true)
  })

  it('should not match unrelated keys', () => {
    expect(isCommandPaletteBackquoteKey({ code: 'KeyQ', key: 'q' })).toBe(false)
  })
})

describe('isKeyboardEventInEditableTarget', () => {
  it('should detect input inside shadow root via composedPath', () => {
    const input = document.createElement('input')
    const host = document.createElement('div')
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.appendChild(input)

    const event = {
      target: host,
      composedPath: () => [input, shadow, host, document.body],
    } as unknown as KeyboardEvent

    expect(isKeyboardEventInEditableTarget(event)).toBe(true)
  })

  it('should return false for plain body target', () => {
    const body = document.body
    const event = {
      target: body,
      composedPath: () => [body, document.documentElement],
    } as unknown as KeyboardEvent

    expect(isKeyboardEventInEditableTarget(event)).toBe(false)
  })
})
