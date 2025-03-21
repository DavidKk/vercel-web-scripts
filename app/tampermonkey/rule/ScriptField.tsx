'use client'

import React from 'react'
import ClearableSelect from '@/components/ClearableSelect'

export interface ScriptFieldProps {
  value: string
  onChange: (value: string) => void
  scripts: string[]
}

export const ScriptField: React.FC<ScriptFieldProps> = (props) => {
  const { value, onChange, scripts } = props
  return (
    <ClearableSelect
      value={value}
      onChange={(value) => onChange(value)}
      options={scripts.map((script) => ({ label: script, value: script }))}
      placeholder="Please select a script"
    />
  )
}
