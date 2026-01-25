'use client'

import React, { useEffect, useRef, useState } from 'react'
import { FiGlobe, FiX } from 'react-icons/fi'

import { SCRIPTS_FILE_EXTENSION } from '@/constants/file'
import type { RuleConfig } from '@/services/tampermonkey/types'

export interface RulePanelProps {
  /** All rules from the rule file */
  allRules: RuleConfig[]
  /** Current selected file path */
  selectedFile: string | null
  /** Callback when rules are updated */
  onRulesChange: (rules: RuleConfig[]) => void
}

/**
 * Rule panel component for managing rules in the editor
 * Displays rules filtered by the currently selected file
 */
export function RulePanel(props: RulePanelProps) {
  const { allRules, selectedFile, onRulesChange } = props
  const [rules, setRules] = useState<RuleConfig[]>([])
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  /**
   * Check if selected file is a script file (TS/JS)
   * @param filePath File path to check
   * @returns True if file is a script file
   */
  function isScriptFile(filePath: string | null): boolean {
    if (!filePath) {
      return false
    }
    return SCRIPTS_FILE_EXTENSION.some((ext) => filePath.endsWith(ext))
  }

  const isScript = isScriptFile(selectedFile)

  // Update local rules when allRules or selectedFile changes
  useEffect(() => {
    if (!selectedFile || !isScript) {
      setRules([])
      return
    }

    // Filter rules by selected file
    const filteredRules = allRules.filter((rule) => rule.script === selectedFile)
    setRules(filteredRules)
  }, [allRules, selectedFile, isScript])

  /**
   * Handle wildcard change for a rule
   * @param id Rule ID
   * @param wildcard New wildcard value
   */
  function handleWildcardChange(id: string, wildcard: string) {
    if (!selectedFile) return

    const updatedRules = rules.map((rule) => (rule.id === id ? { ...rule, wildcard } : rule))
    setRules(updatedRules)

    // Merge with other rules and notify parent
    const otherRules = allRules.filter((rule) => rule.script !== selectedFile)
    onRulesChange([...otherRules, ...updatedRules])
  }

  /**
   * Handle add new rule
   */
  function handleAddRule() {
    if (!selectedFile) return

    const newRule: RuleConfig = {
      id: crypto.randomUUID(),
      wildcard: '',
      script: selectedFile,
    }

    const updatedRules = [...rules, newRule]
    setRules(updatedRules)

    // Merge with other rules and notify parent
    const otherRules = allRules.filter((rule) => rule.script !== selectedFile)
    onRulesChange([...otherRules, ...updatedRules])

    // Focus on the new input after a short delay
    setTimeout(() => {
      const input = inputRefs.current[newRule.id]
      if (input) {
        input.focus()
      }
    }, 0)
  }

  /**
   * Handle add multiple rules at once
   */
  function handleAddMultiple() {
    if (!selectedFile) return

    // Add 3 empty rules at once
    const newRules: RuleConfig[] = Array.from({ length: 3 }, () => ({
      id: crypto.randomUUID(),
      wildcard: '',
      script: selectedFile,
    }))

    const updatedRules = [...rules, ...newRules]
    setRules(updatedRules)

    // Merge with other rules and notify parent
    const otherRules = allRules.filter((rule) => rule.script !== selectedFile)
    onRulesChange([...otherRules, ...updatedRules])

    // Focus on the first new input
    setTimeout(() => {
      const firstNewId = newRules[0]?.id
      if (firstNewId) {
        const input = inputRefs.current[firstNewId]
        if (input) {
          input.focus()
        }
      }
    }, 0)
  }

  /**
   * Handle delete rule
   * @param id Rule ID to delete
   */
  function handleDeleteRule(id: string) {
    if (!selectedFile) return

    const updatedRules = rules.filter((rule) => rule.id !== id)
    setRules(updatedRules)

    // Merge with other rules and notify parent
    const otherRules = allRules.filter((rule) => rule.script !== selectedFile)
    onRulesChange([...otherRules, ...updatedRules])
  }

  /**
   * Handle key down on input
   * @param e Keyboard event
   * @param id Rule ID
   */
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, id: string) {
    if (e.key === 'Enter') {
      e.preventDefault()
      // If current input has value, add a new rule
      const currentRule = rules.find((r) => r.id === id)
      if (currentRule && currentRule.wildcard.trim()) {
        handleAddRule()
      }
    } else if (e.key === 'Tab' && !e.shiftKey) {
      // Handle Tab key: move to next input, skip delete button
      e.preventDefault()
      const currentIndex = rules.findIndex((r) => r.id === id)
      if (currentIndex >= 0 && currentIndex < rules.length - 1) {
        // Move to next input
        const nextRule = rules[currentIndex + 1]
        const nextInput = inputRefs.current[nextRule.id]
        if (nextInput) {
          nextInput.focus()
        }
      }
    } else if (e.key === 'Tab' && e.shiftKey) {
      // Handle Shift+Tab: move to previous input
      e.preventDefault()
      const currentIndex = rules.findIndex((r) => r.id === id)
      if (currentIndex > 0) {
        // Move to previous input
        const prevRule = rules[currentIndex - 1]
        const prevInput = inputRefs.current[prevRule.id]
        if (prevInput) {
          prevInput.focus()
        }
      }
    }
  }

  if (!selectedFile) {
    return (
      <div className="h-full flex items-center justify-center bg-[#1e1e1e] text-[#858585]">
        <div className="text-center">
          <p className="text-sm">No file selected</p>
          <p className="text-xs mt-1">Select a script file to manage its rules</p>
        </div>
      </div>
    )
  }

  if (!isScript) {
    return (
      <div className="h-full flex flex-col bg-[#1e1e1e] border-l border-[#2d2d2d] overflow-hidden">
        {/* Header */}
        <div className="h-[33px] px-3 text-xs font-semibold text-[#cccccc] uppercase border-b border-[#2d2d2d] bg-[#1e1e1e] sticky top-0 z-10 flex items-center">
          <div className="flex items-center gap-2">
            <FiGlobe className="w-3.5 h-3.5 text-[#007acc]" />
            <span>URL Rules</span>
          </div>
        </div>

        {/* Description */}
        <div className="px-3 py-2 border-b border-[#2d2d2d] bg-[#252526]">
          <p className="text-xs text-[#858585]">Configure which URLs this script runs on</p>
        </div>

        {/* Not supported message */}
        <div className="flex-1 flex items-center justify-center text-[#858585] px-4">
          <div className="text-center">
            <p className="text-sm mb-1">Rules are only available for script files</p>
            <p className="text-xs text-[#6a6a6a]">Please select a TypeScript (.ts) or JavaScript (.js) file</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] border-l border-[#2d2d2d] overflow-hidden">
      {/* Header */}
      <div className="h-[33px] px-3 text-xs font-semibold text-[#cccccc] uppercase border-b border-[#2d2d2d] bg-[#1e1e1e] sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>URL Rules</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="px-1.5 py-0.5 text-xs hover:bg-[#3e3e42] rounded text-gray-400 hover:text-white transition-colors"
            onClick={handleAddMultiple}
            title="Add Multiple Rules (3 at once)"
            type="button"
          >
            +3
          </button>
          <button className="p-1 hover:bg-[#3e3e42] rounded text-gray-400 hover:text-white transition-colors" onClick={handleAddRule} title="Add Rule" type="button">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Description */}
      <div className="px-3 py-2 border-b border-[#2d2d2d] bg-[#252526]">
        <p className="text-xs text-[#858585]">Configure which URLs this script runs on</p>
      </div>

      {/* Rules List */}
      <div className="flex-1 overflow-auto">
        {rules.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[#858585] px-4">
            <p className="text-sm mb-1">No URL rules</p>
            <p className="text-xs text-[#6a6a6a] mb-4">Add rules to specify where this script runs</p>
            <div className="text-xs text-[#6a6a6a] space-y-1">
              <p className="font-mono text-[#858585]">Example:</p>
              <p className="font-mono">*://*.example.com/*</p>
              <p className="font-mono">*://github.com/*</p>
            </div>
          </div>
        ) : (
          <div className="py-1">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-2 px-2 py-1 hover:bg-[#2a2d2e] transition-colors border-b border-[#2d2d2d] last:border-b-0">
                <input
                  ref={(el) => {
                    inputRefs.current[rule.id] = el
                  }}
                  type="text"
                  value={rule.wildcard}
                  onChange={(e) => handleWildcardChange(rule.id, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, rule.id)}
                  placeholder="*://*.example.com/*"
                  className="flex-1 h-5 px-1.5 text-xs bg-transparent border-none text-[#cccccc] placeholder:text-[#6a6a6a] focus:outline-none focus:bg-[#1e1e1e] focus:ring-1 focus:ring-[#007acc] rounded"
                />
                <button
                  onClick={() => handleDeleteRule(rule.id)}
                  className="p-0.5 hover:bg-[#3e3e42] rounded text-gray-400 hover:text-red-400 transition-colors flex-shrink-0"
                  title="Delete Rule"
                  type="button"
                  tabIndex={-1}
                >
                  <FiX className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
