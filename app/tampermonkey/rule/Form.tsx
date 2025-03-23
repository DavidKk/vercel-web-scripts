'use client'

import React, { useEffect, useRef } from 'react'
import ConfigManager, { type ConfigManagerReference } from '@/components/ConfigManager'
import { updateRules } from '@/app/actions/tampermonkey'
import type { RuleConfig } from '@/services/tampermonkey/types'
import { WildcardField, type WildcardFieldProps } from './WildcardField'
import { ScriptField, type ScriptFieldProps } from './ScriptField'
import { useSearchParams } from 'next/navigation'

export interface FormProps {
  rules: RuleConfig[]
  scripts: string[]
}

export default function Form(props: FormProps) {
  const { rules, scripts } = props
  const cfgManagerRef = useRef<ConfigManagerReference>(null)
  const url = useSearchParams().get('url') || ''

  useEffect(() => {
    if (!url) {
      return
    }

    cfgManagerRef.current?.prepend({
      wildcard: url,
      script: '',
    })
  }, [])

  const schema = {
    wildcard: (props: WildcardFieldProps) => <WildcardField {...props} required />,
    script: (props: Omit<ScriptFieldProps, 'scripts'>) => <ScriptField {...props} scripts={scripts} required />,
  }

  const filterSchema = {
    script: (props: Omit<ScriptFieldProps, 'scripts'>) => <ScriptField {...props} scripts={scripts} />,
  }

  const handleSubmit = async (configs: RuleConfig[]) => {
    updateRules(configs)
  }

  return <ConfigManager configs={rules} configSchema={schema} filterSchema={filterSchema} onSubmit={handleSubmit} ref={cfgManagerRef} />
}
