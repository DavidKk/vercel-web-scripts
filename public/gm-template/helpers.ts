/// <reference path="./stackblitz/typings.d.ts" />

// Type declarations for this file (types from stackblitz/typings.d.ts)
// __BASE_URL__ is declared in stackblitz/typings.d.ts
declare interface GMXMLHttpRequestResponse {
  finalUrl: string
  readyState: number
  responseHeaders: string
  response: any
  responseText: string
  responseXML: Document | null
  status: number
  statusText: string
}
declare interface GMXMLHttpRequestError {
  error: string
  message?: string
}
declare interface GMXMLHttpRequestDetails {
  method: string
  url: string
  headers?: Record<string, string>
  data?: string | Document | Blob | FormData | ArrayBuffer | URLSearchParams
  responseType?: 'arraybuffer' | 'blob' | 'json' | 'stream' | 'text'
  body?: any
  timeout?: number
  onload?: (response: GMXMLHttpRequestResponse) => void
  onerror?: (error: GMXMLHttpRequestError) => void
  onabort?: (error: GMXMLHttpRequestError) => void
  ontimeout?: (error: GMXMLHttpRequestError) => void
  onprogress?: (event: ProgressEvent) => void
}
declare function GM_xmlhttpRequest(details: GMXMLHttpRequestDetails): void

// ============================================================================
// HTTP / Network Functions
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_curl(content: string) {
  if (!content) {
    throw new Error('Missing content')
  }

  return new Promise<any>((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'POST',
      url: __BASE_URL__ + '/api/curl',
      headers: {
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
      data: JSON.stringify({ content }),
      onload: function (response: GMXMLHttpRequestResponse) {
        if (response.readyState !== 4) {
          return
        }

        if (!(200 <= response.status && response.status < 400)) {
          throw new Error('Failed to request:' + response.statusText)
        }

        resolve(response.response)
      },
      onerror: function (error: GMXMLHttpRequestError) {
        reject(new Error('Failed to request:' + error.message))
      },
    })
  })
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_preview(file: string, content: string) {
  if (!file || !content) {
    throw new Error('Missing file or content')
  }

  const form = document.createElement('form')
  form.method = 'POST'
  form.action = __BASE_URL__ + '/api/preview'
  form.target = '_blank'

  const fileInput = document.createElement('input')
  fileInput.type = 'hidden'
  fileInput.name = 'file'
  fileInput.value = file
  form.appendChild(fileInput)

  const contentInput = document.createElement('input')
  contentInput.type = 'hidden'
  contentInput.name = 'content'
  contentInput.value = content
  form.appendChild(contentInput)

  document.body.appendChild(form)
  form.submit()

  document.body.removeChild(form)
}

// ============================================================================
// DOM Query and Wait Functions
// ============================================================================

interface WaitForOptions {
  timeout?: boolean
}

interface WatchForOptions {
  /**
   * Minimum interval in milliseconds between callback executions
   * Even if MutationObserver triggers frequently, callback will execute at most once per interval
   * @default undefined (no interval limit)
   */
  minInterval?: number
}

interface PollForOptions {
  /**
   * Interval in milliseconds between each poll execution
   * @default 1000 (1 second)
   */
  interval?: number
}

type AsyncQuery =
  | (() => HTMLElement[] | HTMLElement | NodeListOf<Element> | Element[] | any[] | null)
  | (() => Promise<HTMLElement[] | HTMLElement | NodeListOf<Element> | Element[] | any[] | null>)

/**
 * Helper function to convert query result to array of valid HTMLElements
 * Filters out invalid nodes (null, undefined, not in DOM, etc.)
 * @param node The node(s) to process
 * @returns Array of valid HTMLElements, empty array if none found
 */
function toValidElementsArray(node: any): HTMLElement[] {
  if (!node) {
    return []
  }

  const validElements: HTMLElement[] = []

  // Handle single element
  if (node instanceof HTMLElement) {
    // Check if element is in DOM
    if (document.body.contains(node)) {
      validElements.push(node)
    }
    return validElements
  }

  // Handle NodeList
  if (node instanceof NodeList) {
    for (let i = 0; i < node.length; i++) {
      const element = node[i]
      if (element instanceof HTMLElement && document.body.contains(element)) {
        validElements.push(element)
      }
    }
    return validElements
  }

  // Handle array
  if (Array.isArray(node)) {
    for (const element of node) {
      if (element instanceof HTMLElement && document.body.contains(element)) {
        validElements.push(element)
      }
    }
    return validElements
  }

  // For other Element types, try to check directly
  if (node instanceof Element && document.body.contains(node)) {
    if (node instanceof HTMLElement) {
      validElements.push(node)
    }
    return validElements
  }

  return []
}

/**
 * Checks if an element is visible in the viewport
 * Considers CSS properties like display, visibility, opacity, and viewport position
 * @param element The element to check
 * @returns True if the element is visible, false otherwise
 */
function GME_isVisible(element: Element | null | undefined): boolean {
  if (
    !element ||
    !(
      element instanceof HTMLElement ||
      element instanceof SVGElement ||
      element instanceof SVGPathElement ||
      element instanceof SVGLineElement ||
      element instanceof SVGPolylineElement ||
      element instanceof SVGPolygonElement
    )
  ) {
    return false
  }

  // Check if element is in the DOM
  if (!document.body.contains(element)) {
    return false
  }

  // Check computed styles
  const style = window.getComputedStyle(element)

  // Check display property
  if (style.display === 'none') {
    return false
  }

  // Check visibility property
  if (style.visibility === 'hidden' || style.visibility === 'collapse') {
    return false
  }

  // Check opacity property
  const opacity = parseFloat(style.opacity)
  if (isNaN(opacity) || opacity === 0) {
    return false
  }

  // Check if element has dimensions
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    return false
  }

  // Check if element is in viewport
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight

  // Element is visible if any part of it is in the viewport
  const isInViewport = rect.top < viewportHeight && rect.bottom > 0 && rect.left < viewportWidth && rect.right > 0

  if (!isInViewport) {
    return false
  }

  // Check parent elements recursively
  let parent = element.parentElement
  while (parent && parent !== document.body) {
    const parentStyle = window.getComputedStyle(parent)

    if (parentStyle.display === 'none') {
      return false
    }

    if (parentStyle.visibility === 'hidden' || parentStyle.visibility === 'collapse') {
      return false
    }

    const parentOpacity = parseFloat(parentStyle.opacity)
    if (isNaN(parentOpacity) || parentOpacity === 0) {
      return false
    }

    parent = parent.parentElement
  }

  return true
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_waitFor<T extends AsyncQuery>(query: T, options?: WaitForOptions) {
  const { timeout: openTimeout } = options || {}
  return new Promise<Awaited<ReturnType<T>>>((resolve, reject) => {
    const timerId =
      openTimeout &&
      setTimeout(() => {
        observer?.disconnect()
        reject(new Error('Timeout'))
      }, 3e3)

    let observer: MutationObserver | null = null

    const checkAndResolve = async () => {
      try {
        const result = query()
        const node = result instanceof Promise ? await result : result
        if (node) {
          timerId && clearTimeout(timerId)
          observer?.disconnect()
          resolve(node as Awaited<ReturnType<T>>)
          return true
        }
      } catch (error) {
        // Silently handle errors in query to prevent breaking the watcher
        // eslint-disable-next-line no-console
        console.error('Error in GME_waitFor query:', error)
      }
      return false
    }

    // Check immediately once
    checkAndResolve().then((found) => {
      if (found) {
        return
      }

      observer = new MutationObserver(() => {
        checkAndResolve()
      })

      observer.observe(document.body, {
        subtree: true,
        childList: true,
      })
    })
  })
}

/**
 * Watches for nodes to appear in the DOM, then calls the callback with valid elements
 * Filters out invalid nodes (null, undefined, not in DOM, etc.)
 * Only triggers callback when at least one valid element is found
 * @param query Function that returns the node(s) to watch for (can return single element or array/NodeList)
 * @param callback Function to call when valid node(s) are found, receives array of valid HTMLElements
 * @param options Optional configuration options
 * @returns Cleanup function to stop watching
 */
function GME_watchFor<T extends AsyncQuery>(query: T, callback: (nodes: HTMLElement[]) => void, options?: WatchForOptions) {
  const { minInterval } = options || {}
  let observer: MutationObserver | null = null
  let isActive = true
  let lastCallTime = 0
  let pendingTimeoutId: ReturnType<typeof setTimeout> | null = null

  const executeCallback = async () => {
    if (!isActive) {
      return
    }

    try {
      const result = query()
      const node = result instanceof Promise ? await result : result
      if (node) {
        const validElements = toValidElementsArray(node)
        if (validElements.length > 0) {
          callback(validElements)
          lastCallTime = Date.now()
        }
      }
    } catch (error) {
      // Silently handle errors in callback to prevent breaking the watcher
      // eslint-disable-next-line no-console
      console.error('Error in GME_watchFor callback:', error)
    }
  }

  const checkAndCallback = () => {
    if (!isActive) {
      return
    }

    // If no interval limit, execute immediately
    if (!minInterval) {
      executeCallback()
      return
    }

    const now = Date.now()
    const timeSinceLastCall = now - lastCallTime

    // If enough time has passed, execute immediately
    if (timeSinceLastCall >= minInterval) {
      if (pendingTimeoutId) {
        clearTimeout(pendingTimeoutId)
        pendingTimeoutId = null
      }
      executeCallback()
    } else {
      // Cancel any pending timeout and schedule a new one
      if (pendingTimeoutId) {
        clearTimeout(pendingTimeoutId)
      }
      const remainingTime = minInterval - timeSinceLastCall
      pendingTimeoutId = setTimeout(() => {
        pendingTimeoutId = null
        executeCallback()
      }, remainingTime)
    }
  }

  // Check immediately once
  checkAndCallback()

  // Use MutationObserver to watch DOM changes
  observer = new MutationObserver(() => {
    checkAndCallback()
  })

  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  })

  // Return cleanup function
  return () => {
    if (!isActive) {
      return
    }

    isActive = false
    observer?.disconnect()
    observer = null
    if (pendingTimeoutId) {
      clearTimeout(pendingTimeoutId)
      pendingTimeoutId = null
    }
  }
}

/**
 * Watches for a node to appear and become visible, then calls the callback
 * Only triggers callback when the node(s) are actually visible (not hidden by CSS, in viewport, etc.)
 * This function is based on GME_watchFor but filters for visible elements only
 * @param query Function that returns the node(s) to watch for (can return single element or array/NodeList)
 * @param callback Function to call when visible node(s) are found, receives array of visible HTMLElements
 * @param options Optional configuration options
 * @returns Cleanup function to stop watching
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_watchForVisible<T extends AsyncQuery>(query: T, callback: (nodes: HTMLElement[]) => void, options?: WatchForOptions) {
  // Wrap the callback to filter for visible elements
  const visibleCallback = (nodes: HTMLElement[]) => {
    const visibleElements = nodes.filter((element) => GME_isVisible(element))
    if (visibleElements.length > 0) {
      callback(visibleElements)
    }
  }

  // Use GME_watchFor with the wrapped callback
  return GME_watchFor(query, visibleCallback, options)
}

/**
 * Polls for nodes at regular intervals, then calls the callback with valid elements
 * Useful for pages where nodes change frequently and MutationObserver would trigger too often
 * Filters out invalid nodes (null, undefined, not in DOM, etc.)
 * Only triggers callback when at least one valid element is found
 * @param query Function that returns the node(s) to poll for (can return single element or array/NodeList)
 * @param callback Function to call when valid node(s) are found, receives array of valid HTMLElements
 * @param options Optional configuration options
 * @returns Cleanup function to stop polling
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_pollFor<T extends AsyncQuery>(query: T, callback: (nodes: HTMLElement[]) => void, options?: PollForOptions) {
  const { interval = 1000 } = options || {}
  let intervalId: ReturnType<typeof setInterval> | null = null
  let isActive = true

  const checkAndCallback = async () => {
    if (!isActive) {
      return
    }

    try {
      const result = query()
      const node = result instanceof Promise ? await result : result
      if (node) {
        const validElements = toValidElementsArray(node)
        if (validElements.length > 0) {
          callback(validElements)
        }
      }
    } catch (error) {
      // Silently handle errors in callback to prevent breaking the poller
      // eslint-disable-next-line no-console
      console.error('Error in GME_pollFor callback:', error)
    }
  }

  // Check immediately once
  checkAndCallback()

  // Start polling at regular intervals
  intervalId = setInterval(() => {
    checkAndCallback()
  }, interval)

  // Return cleanup function
  return () => {
    if (!isActive) {
      return
    }

    isActive = false
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function GME_sha1(str: string) {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-1', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

// ============================================================================
// Logging Functions
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_ok(...contents: any[]) {
  // eslint-disable-next-line no-console
  console.log('%c✔ [OK]', 'color:#28a745;font-weight:700;', ...contents)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_info(...contents: any[]) {
  // eslint-disable-next-line no-console
  console.log('%cℹ [INFO]', 'color:#17a2b8;font-weight:700;', ...contents)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_fail(...contents: any[]) {
  // eslint-disable-next-line no-console
  console.log('%c✘ [FAIL]', 'color:#dc3545;font-weight:700;', ...contents)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_warn(...contents: any[]) {
  // eslint-disable-next-line no-console
  console.log('%c⚠ [WARN]', 'color:#ffc107;font-weight:700;', ...contents)
}
