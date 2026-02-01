// ============================================================================
// Utility Functions
// ============================================================================

function GME_sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Creates a debounced function that delays invoking the provided function
 * until after the specified wait time has elapsed since the last invocation
 * @param fn The function to debounce
 * @param wait The number of milliseconds to delay
 * @returns A debounced version of the function
 */

function GME_debounce<T extends (...args: any[]) => any>(fn: T, wait: number): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return function debounced(...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      fn(...args)
      timeoutId = null
    }, wait)
  }
}

/**
 * Creates a throttled function that invokes the provided function at most once
 * per specified wait time period
 * @param fn The function to throttle
 * @param wait The number of milliseconds to wait between invocations
 * @returns A throttled version of the function
 */

function GME_throttle<T extends (...args: any[]) => any>(fn: T, wait: number): (...args: Parameters<T>) => void {
  let lastCallTime = 0
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return function throttled(...args: Parameters<T>) {
    const now = Date.now()
    const timeSinceLastCall = now - lastCallTime

    if (timeSinceLastCall >= wait) {
      lastCallTime = now
      fn(...args)
    } else {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      timeoutId = setTimeout(() => {
        lastCallTime = Date.now()
        fn(...args)
        timeoutId = null
      }, wait - timeSinceLastCall)
    }
  }
}

// ============================================================================
// Crypto / Hash Functions
// ============================================================================

async function GME_sha1(str: string) {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-1', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

function GME_uuid() {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export { GME_debounce, GME_sha1, GME_sleep, GME_throttle, GME_uuid }
