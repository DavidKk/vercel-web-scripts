import { fingerprintToolCall, fingerprintToolRound, hasRepeatingToolCycle, stableStringify } from '@ext/ui/sidepanel/agent-tool-loop-guard'

describe('agent-tool-loop-guard', () => {
  it('should stable-stringify objects with sorted keys', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }))
    expect(stableStringify({ nested: { z: true, a: false } })).toBe('{"nested":{"a":false,"z":true}}')
  })

  it('should fingerprint tool calls from name and normalized args', () => {
    const left = fingerprintToolCall('vws.page.snapshot', { selector: 'main', depth: 2 })
    const right = fingerprintToolCall('vws.page.snapshot', { depth: 2, selector: 'main' })
    expect(left).toBe(right)
    expect(left).not.toBe(fingerprintToolCall('vws.page.snapshot', { selector: 'aside', depth: 2 }))
  })

  it('should fingerprint a tool round in call order', () => {
    const sig = fingerprintToolRound([
      { name: 'A', args: { x: 1 } },
      { name: 'B', args: { y: 2 } },
    ])
    expect(sig).toBe(`${fingerprintToolCall('A', { x: 1 })}\n${fingerprintToolCall('B', { y: 2 })}`)
  })

  it('should allow two identical rounds (legitimate re-read) but flag three', () => {
    const a = fingerprintToolRound([{ name: 'snap', args: { path: '/' } }])
    expect(hasRepeatingToolCycle([a, a])).toBe(false)
    expect(hasRepeatingToolCycle([a, a, a])).toBe(true)
  })

  it('should detect A,B,A,B style cycles', () => {
    const a = fingerprintToolRound([{ name: 'A', args: { v: 1 } }])
    const b = fingerprintToolRound([{ name: 'B', args: { v: 2 } }])
    expect(hasRepeatingToolCycle([a, b])).toBe(false)
    expect(hasRepeatingToolCycle([a, b, a])).toBe(false)
    expect(hasRepeatingToolCycle([a, b, a, b])).toBe(true)
  })

  it('should detect longer ABCABC cycles', () => {
    const a = 'A'
    const b = 'B'
    const c = 'C'
    expect(hasRepeatingToolCycle([a, b, c, a, b, c])).toBe(true)
    expect(hasRepeatingToolCycle([a, b, c, a, b])).toBe(false)
  })

  it('should not treat a growing unique sequence as a cycle', () => {
    const rounds = Array.from({ length: 20 }, (_, i) => fingerprintToolRound([{ name: 'read', args: { i } }]))
    expect(hasRepeatingToolCycle(rounds)).toBe(false)
  })
})
