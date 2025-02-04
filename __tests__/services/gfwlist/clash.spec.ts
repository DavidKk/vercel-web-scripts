import { convertToClashRules } from '@/services/gfwlist/clash'
import type { GFWRule } from '@/services/gfwlist/parse'
import type { ClashStandardRule } from '@/services/clash/types'

describe('convertToClashRules', () => {
  it('should correctly convert domain rules', () => {
    const input: GFWRule[] = [{ type: 'domain', value: 'example.com', raw: '||example.com^' }]

    const expected: ClashStandardRule[] = [{ type: 'DOMAIN', value: 'example.com', action: 'Proxy' }]

    const result = convertToClashRules(input)
    expect(result).toEqual(expected)
  })

  it('should correctly convert wildcard rules', () => {
    const input: GFWRule[] = [{ type: 'wildcard', value: '*.example.com', raw: '*.example.com' }]

    const expected: ClashStandardRule[] = [{ type: 'DOMAIN-SUFFIX', value: 'example.com', action: 'Proxy' }]

    const result = convertToClashRules(input)
    expect(result).toEqual(expected)
  })

  it('should correctly convert exact_url rules', () => {
    const input: GFWRule[] = [{ type: 'exact_url', value: 'http://example.com/path', raw: '|http://example.com/path' }]

    const expected: ClashStandardRule[] = [{ type: 'DOMAIN', value: 'example.com', action: 'Proxy' }]

    const result = convertToClashRules(input)
    expect(result).toEqual(expected)
  })

  it('should correctly convert start_with rules', () => {
    const input: GFWRule[] = [{ type: 'start_with', value: 'example.com', raw: '^example.com' }]

    const expected: ClashStandardRule[] = [{ type: 'DOMAIN', value: 'example.com', action: 'Proxy' }]

    const result = convertToClashRules(input)
    expect(result).toEqual(expected)
  })

  it('should correctly convert end_with rules', () => {
    const input: GFWRule[] = [{ type: 'end_with', value: 'example.com', raw: 'example.com$' }]

    const expected: ClashStandardRule[] = [{ type: 'DOMAIN-SUFFIX', value: 'example.com', action: 'Proxy' }]

    const result = convertToClashRules(input)
    expect(result).toEqual(expected)
  })

  it('should correctly convert full_match rules', () => {
    const input: GFWRule[] = [{ type: 'full_match', value: 'example.com', raw: '^example.com$' }]

    const expected: ClashStandardRule[] = [{ type: 'DOMAIN', value: 'example.com', action: 'Proxy' }]

    const result = convertToClashRules(input)
    expect(result).toEqual(expected)
  })

  it('should correctly convert domain_keyword rules', () => {
    const input: GFWRule[] = [{ type: 'domain_keyword', value: 'keyword', raw: 'keyword' }]

    const expected: ClashStandardRule[] = [{ type: 'DOMAIN-KEYWORD', value: 'keyword', action: 'Proxy' }]

    const result = convertToClashRules(input)
    expect(result).toEqual(expected)
  })

  it('should correctly convert path rules', () => {
    const input: GFWRule[] = [{ type: 'path', value: 'http://example.com/path', raw: 'example.com/path' }]

    const expected: ClashStandardRule[] = [{ type: 'DOMAIN', value: 'example.com', action: 'Proxy' }]

    const result = convertToClashRules(input)
    expect(result).toEqual(expected)
  })

  it('should ignore invalid path rules', () => {
    const input: GFWRule[] = [{ type: 'path', value: 'invalid_path', raw: 'invalid_path' }]

    const expected: ClashStandardRule[] = []

    const result = convertToClashRules(input)
    expect(result).toEqual(expected)
  })
})
