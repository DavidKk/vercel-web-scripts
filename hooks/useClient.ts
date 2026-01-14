import { useEffect, useState } from 'react'

export function useClient() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setReady(true)
  }, [])

  return ready
}

/**
 * Hook to show confirmation dialog when leaving page with unsaved changes
 * Only shows dialog if hasUnsavedChanges is true
 * @param hasUnsavedChanges Whether there are unsaved changes
 * @param message Message to show in the confirmation dialog
 */
export function useBeforeUnload(hasUnsavedChanges: boolean, message = 'You have unsaved changes. Are you sure you want to leave?') {
  useEffect(() => {
    // Only add listener if there are unsaved changes
    if (!hasUnsavedChanges) {
      return
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Only prevent default if there are unsaved changes
      if (hasUnsavedChanges) {
        event.preventDefault()
        // Modern browsers require returnValue to be set
        event.returnValue = message
        return message
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [hasUnsavedChanges, message])
}
