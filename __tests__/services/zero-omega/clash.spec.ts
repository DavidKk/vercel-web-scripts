import { convertToClashRules } from '@/services/zero-omega/clash'
import type { ZeroOmega } from '@/services/zero-omega/types'

describe('convertToClashRules', () => {
  it('should convert ZeroOmega rules to ClashStandardRule correctly', () => {
    const zeroOmega: ZeroOmega = {
      '+Auto': {
        rules: [
          {
            condition: {
              conditionType: 'HostWildcardCondition',
              pattern: '*.deepseek.com',
            },
            profileName: 'direct',
          },
          {
            condition: {
              conditionType: 'HostWildcardCondition',
              pattern: '*.sentry.io',
            },
            profileName: 'Proxy',
          },
          {
            condition: {
              conditionType: 'HostWildcardCondition',
              pattern: '192.168.1.1',
            },
            profileName: 'direct',
          },
        ],
      },
    }

    const expected = [
      { type: 'DOMAIN-SUFFIX', value: 'deepseek.com', action: 'DIRECT' },
      { type: 'DOMAIN-SUFFIX', value: 'sentry.io', action: 'Proxy' },
      { type: 'IP-CIDR', value: '192.168.1.1/32', action: 'DIRECT' },
    ]

    const result = convertToClashRules(zeroOmega)
    expect(result).toEqual(expected)
  })
})
