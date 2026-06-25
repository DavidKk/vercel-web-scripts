/**
 * Resolve caller label for node-selector UI (toolbar / marks)
 */
export function getNodeSelectorCallerLabel(explicit?: string): string {
  const trimmed = explicit?.trim()
  if (trimmed) return trimmed

  try {
    if (typeof GM_info !== 'undefined' && GM_info?.script?.name) {
      return GM_info.script.name
    }
  } catch {
    // ignore
  }

  return 'Unknown script'
}
