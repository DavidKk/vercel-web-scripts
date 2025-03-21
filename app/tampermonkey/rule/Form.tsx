'use client'

import React from 'react'
import ConfigManager from '@/components/ConfigManager'
import { updateRules } from '@/app/actions/tampermonkey'
import type { RuleConfig } from '@/services/tampermonkey/types'
import { WildcardField } from './WildcardField'
import { ScriptField, type ScriptFieldProps } from './ScriptField'

export interface FormProps {
  rules: RuleConfig[]
  scripts: string[]
}

export default function Form(props: FormProps) {
  const { rules, scripts } = props

  const schema = {
    wildcard: WildcardField,
    script: (props: Omit<ScriptFieldProps, 'scripts'>) => <ScriptField {...props} scripts={scripts} />,
  }

  const filterSchema = {
    script: (props: Omit<ScriptFieldProps, 'scripts'>) => <ScriptField {...props} scripts={scripts} />,
  }

  const handleSubmit = async (configs: RuleConfig[]) => {
    updateRules(configs)
  }

  return <ConfigManager configs={rules} configSchema={schema} filterSchema={filterSchema} onSubmit={handleSubmit} />
}
