import type { GFWRule } from '@/services/gfwlist/parse'
import { parseGFWList } from '@/services/gfwlist/parse'

describe('parseGFWList', () => {
  it('应正确解析注释行', () => {
    const input = `
      ! 普通注释
      # 另一种注释
      !-- 多行注释
    `

    const expected: GFWRule[] = [
      { type: 'comment', value: '普通注释', raw: '! 普通注释' },
      { type: 'comment', value: '另一种注释', raw: '# 另一种注释' },
      { type: 'comment', value: '多行注释', raw: '!-- 多行注释' },
    ]

    const result = parseGFWList(input, { ignoreComments: false, sortComparator: false })
    expect(result).toEqual(expect.arrayContaining(expected))
  })

  it('应正确解析白名单规则', () => {
    const input = `
      @@||whitelist.com
      @@|https://exact.whitelist.com/path
      @@*.wildcard.whitelist.com
    `

    const expected: GFWRule[] = [
      { type: 'whitelist', value: 'whitelist.com', raw: '@@||whitelist.com' },
      { type: 'whitelist', value: 'exact.whitelist.com', raw: '@@|https://exact.whitelist.com/path' },
      { type: 'whitelist', value: '*.wildcard.whitelist.com', raw: '@@*.wildcard.whitelist.com' },
    ]

    const result = parseGFWList(input, { sortComparator: false })
    expect(result).toEqual(expected)
  })

  it('应正确解析域名匹配规则', () => {
    const input = `
      ||example.com^
      ||.example.org/
      ||sub.example.net:8080
    `

    const expected: GFWRule[] = [
      { type: 'domain', value: 'example.com', raw: '||example.com^' },
      { type: 'domain', value: 'example.org', raw: '||.example.org/' },
      { type: 'domain', value: 'sub.example.net:8080', raw: '||sub.example.net:8080' },
    ]

    const result = parseGFWList(input, { sortComparator: false })
    expect(result).toEqual(expected)
  })

  it('应正确解析正则表达式规则', () => {
    const input = `
      /^https?:\\/\\/.*\\.google\\.com\\//
      /http:\\/\\/192\\.168\\.d+\\.d+/
    `

    const expected: GFWRule[] = [
      { type: 'regex', value: '^https?:\\/\\/.*\\.google\\.com\\/', raw: '/^https?:\\/\\/.*\\.google\\.com\\//' },
      { type: 'regex', value: 'http:\\/\\/192\\.168\\.d+\\.d+', raw: '/http:\\/\\/192\\.168\\.d+\\.d+/' },
    ]

    const result = parseGFWList(input, { sortComparator: false })
    expect(result).toEqual(expected)
  })

  it('应正确解析通配符规则', () => {
    const input = `
      *.google.com
      *.*.double-wildcard.com
    `

    const expected: GFWRule[] = [
      { type: 'wildcard', value: '*.google.com', raw: '*.google.com' },
      { type: 'wildcard', value: '*.*.double-wildcard.com', raw: '*.*.double-wildcard.com' },
    ]

    const result = parseGFWList(input, { sortComparator: false })
    expect(result).toEqual(expected)
  })

  it('应正确解析路径规则', () => {
    const input = `
      example.com/path
      sub.example.org:8080/api/v1
    `

    const expected: GFWRule[] = [
      { type: 'path', value: 'example.com/path', raw: 'example.com/path' },
      { type: 'path', value: 'sub.example.org:8080/api/v1', raw: 'sub.example.org:8080/api/v1' },
    ]

    const result = parseGFWList(input, { sortComparator: false })
    expect(result).toEqual(expected)
  })

  it('应正确解析边界匹配规则', () => {
    const input = `
      ^start-with.com
      end-with.com$
      ^full-match.com$
    `

    const expected: GFWRule[] = [
      { type: 'start_with', value: 'start-with.com', raw: '^start-with.com' },
      { type: 'end_with', value: 'end-with.com', raw: 'end-with.com$' },
      { type: 'full_match', value: 'full-match.com', raw: '^full-match.com$' },
    ]

    const result = parseGFWList(input, { sortComparator: false })
    expect(result).toEqual(expected)
  })

  it('应正确处理无效输入', () => {
    const input = `
      invalid_domain
      http://
      ...test.com
    `

    const expected: GFWRule[] = []
    const result = parseGFWList(input, { sortComparator: false })
    expect(result).toEqual(expected)
  })

  it('应正确去重和排序', () => {
    const input = `
      ||duplicate.com
      # 注释
      ||duplicate.com
      *.duplicate.com
    `

    const expected: GFWRule[] = [
      { type: 'comment', value: '注释', raw: '# 注释' },
      { type: 'domain', value: 'duplicate.com', raw: '||duplicate.com' },
      { type: 'wildcard', value: '*.duplicate.com', raw: '*.duplicate.com' },
    ]

    const result = parseGFWList(input, { ignoreComments: false })
    expect(result).toEqual(expected)
  })

  it('应处理复杂混合规则', () => {
    const input = `
      ! 测试混合规则
      @@|https://whitelist.com:8443/path
      ||example.com^
      /^https?:\\/\\/.*\\.test\\.com\\//
      *.wildcard.org
      sub.example.net/api
      ^start.match
      end.match$
    `

    const expected: GFWRule[] = [
      { type: 'comment', value: '测试混合规则', raw: '! 测试混合规则' },
      { type: 'whitelist', value: 'whitelist.com', raw: '@@|https://whitelist.com:8443/path' },
      { type: 'domain', value: 'example.com', raw: '||example.com^' },
      { type: 'regex', value: '^https?:\\/\\/.*\\.test\\.com\\/', raw: '/^https?:\\/\\/.*\\.test\\.com\\//' },
      { type: 'wildcard', value: '*.wildcard.org', raw: '*.wildcard.org' },
      { type: 'path', value: 'sub.example.net/api', raw: 'sub.example.net/api' },
      { type: 'start_with', value: 'start.match', raw: '^start.match' },
      { type: 'end_with', value: 'end.match', raw: 'end.match$' },
    ]

    const result = parseGFWList(input, { ignoreComments: false, sortComparator: false })
    expect(result).toEqual(expected)
  })
})
