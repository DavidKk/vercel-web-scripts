export interface RuleConfig {
  id: string
  wildcard: string
  script: string
}

export function isRuleConfig(rule: any): rule is RuleConfig {
  if (!rule) {
    return false
  }

  return typeof rule.id === 'string' && typeof rule.wildcard === 'string' && typeof rule.script === 'string'
}
