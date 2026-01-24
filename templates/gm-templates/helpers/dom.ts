/// <reference path="../editor-typings.d.ts" />

// ============================================================================
// DOM Query and Wait Functions
// ============================================================================

interface WaitForOptions {
  timeout?: boolean
  /**
   * Container element to observe for DOM changes
   * If not specified, defaults to document.body
   * @default document.body
   */
  container?: Node
  /**
   * MutationObserver options
   * If not specified, defaults to { subtree: true, childList: true }
   * @default { subtree: true, childList: true }
   */
  observerOptions?: MutationObserverInit
}

interface WatchForOptions {
  /**
   * Minimum interval in milliseconds between callback executions
   * Even if MutationObserver triggers frequently, callback will execute at most once per interval
   * @default undefined (no interval limit)
   */
  minInterval?: number
  /**
   * Container element to observe for DOM changes
   * If not specified, defaults to document.body
   * @default document.body
   */
  container?: Node
  /**
   * MutationObserver options
   * If not specified, defaults to { subtree: true, childList: true, characterData: true, attributes: true }
   * @default { subtree: true, childList: true, characterData: true, attributes: true }
   */
  observerOptions?: MutationObserverInit
}

interface PollForOptions {
  /**
   * Interval in milliseconds between each poll execution
   * @default 1000 (1 second)
   */
  interval?: number
  /**
   * Use requestIdleCallback for polling when available
   * This can help reduce CPU load on busy pages
   * @default false
   */
  useIdleCallback?: boolean
}

/**
 * AsyncQuery type is declared in editor-typings.d.ts
 * This file uses it but doesn't redeclare it to avoid duplicate identifier errors
 */

/**
 * Helper function to check if an element is a valid element (HTMLElement or SVGElement)
 * @param element The element to check
 * @returns True if the element is valid
 */
function isValidElement(element: any): element is HTMLElement | SVGElement {
  return element instanceof HTMLElement || element instanceof SVGElement
}

/**
 * Helper function to convert query result to array of valid elements (HTMLElement or SVGElement)
 * Filters out invalid nodes (null, undefined, not in DOM, etc.)
 * @param node The node(s) to process
 * @returns Array of valid elements, empty array if none found
 */
function toValidElementsArray(node: any): (HTMLElement | SVGElement)[] {
  if (!node) {
    return []
  }

  const validElements: (HTMLElement | SVGElement)[] = []

  // Handle single element
  if (isValidElement(node)) {
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
      if (isValidElement(element) && document.body.contains(element)) {
        validElements.push(element)
      }
    }
    return validElements
  }

  // Handle array
  if (Array.isArray(node)) {
    for (const element of node) {
      if (isValidElement(element) && document.body.contains(element)) {
        validElements.push(element)
      }
    }
    return validElements
  }

  // For other Element types, try to check directly
  if (node instanceof Element && document.body.contains(node)) {
    if (isValidElement(node)) {
      validElements.push(node)
    }
    return validElements
  }

  return []
}

/**
 * Cache for visibility check results
 * Key: element reference, Value: { result: boolean, timestamp: number }
 * Cache expires after 100ms to handle dynamic changes
 */
const visibilityCache = new WeakMap<Element, { result: boolean; timestamp: number }>()
const VISIBILITY_CACHE_TTL = 100 // 100ms cache TTL

/**
 * Checks if an element is visible in the viewport
 * Considers CSS properties like display, visibility, opacity, and viewport position
 * Results are cached for 100ms to reduce CPU usage on frequent checks
 * @param element The element to check
 * @returns True if the element is visible, false otherwise
 */
function GME_isVisible(element: Element | null | undefined): boolean {
  if (!element || !(element instanceof HTMLElement || element instanceof SVGElement)) {
    return false
  }

  // Check cache first
  const cached = visibilityCache.get(element)
  const now = Date.now()
  if (cached && now - cached.timestamp < VISIBILITY_CACHE_TTL) {
    return cached.result
  }

  // Check if element is in the DOM
  if (!document.body.contains(element)) {
    visibilityCache.set(element, { result: false, timestamp: now })
    return false
  }

  // Check computed styles
  const style = window.getComputedStyle(element)

  // Check display property
  if (style.display === 'none') {
    visibilityCache.set(element, { result: false, timestamp: now })
    return false
  }

  // Check visibility property
  if (style.visibility === 'hidden' || style.visibility === 'collapse') {
    visibilityCache.set(element, { result: false, timestamp: now })
    return false
  }

  // Check opacity property
  const opacity = parseFloat(style.opacity)
  if (isNaN(opacity) || opacity === 0) {
    visibilityCache.set(element, { result: false, timestamp: now })
    return false
  }

  // Check if element has dimensions
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    visibilityCache.set(element, { result: false, timestamp: now })
    return false
  }

  // Check if element is in viewport
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight

  // Element is visible if any part of it is in the viewport
  const isInViewport = rect.top < viewportHeight && rect.bottom > 0 && rect.left < viewportWidth && rect.right > 0

  if (!isInViewport) {
    visibilityCache.set(element, { result: false, timestamp: now })
    return false
  }

  // Check parent elements recursively
  let parent = element.parentElement
  while (parent && parent !== document.body) {
    const parentStyle = window.getComputedStyle(parent)

    if (parentStyle.display === 'none') {
      visibilityCache.set(element, { result: false, timestamp: now })
      return false
    }

    if (parentStyle.visibility === 'hidden' || parentStyle.visibility === 'collapse') {
      visibilityCache.set(element, { result: false, timestamp: now })
      return false
    }

    const parentOpacity = parseFloat(parentStyle.opacity)
    if (isNaN(parentOpacity) || parentOpacity === 0) {
      visibilityCache.set(element, { result: false, timestamp: now })
      return false
    }

    parent = parent.parentElement
  }

  const result = true
  visibilityCache.set(element, { result, timestamp: now })
  return result
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_waitFor<T extends AsyncQuery>(query: T, options?: WaitForOptions) {
  const { timeout: openTimeout, container = document.body, observerOptions = { subtree: true, childList: true } } = options || {}
  return new Promise<Awaited<ReturnType<T>>>((resolve, reject) => {
    let timerId: ReturnType<typeof setTimeout> | null = null
    let observer: MutationObserver | null = null
    let isResolved = false

    const cleanup = () => {
      if (timerId) {
        clearTimeout(timerId)
        timerId = null
      }
      if (observer) {
        observer.disconnect()
        observer = null
      }
    }

    const checkAndResolve = async () => {
      if (isResolved) {
        return false
      }

      try {
        const result = query()
        const node = result instanceof Promise ? await result : result
        if (node) {
          isResolved = true
          cleanup()
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

    // Set up timeout if needed
    if (openTimeout) {
      timerId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true
          cleanup()
          reject(new Error('Timeout'))
        }
      }, 3e3)
    }

    // Check immediately once
    checkAndResolve()
      .then((found) => {
        if (found || isResolved) {
          return
        }

        observer = new MutationObserver(() => {
          checkAndResolve()
        })

        observer.observe(container, observerOptions)
      })
      .catch((error) => {
        if (!isResolved) {
          isResolved = true
          cleanup()
          reject(error)
        }
      })
  })
}

/**
 * Watches for nodes to appear in the DOM, then calls the callback with valid elements
 * Filters out invalid nodes (null, undefined, not in DOM, etc.)
 * Only triggers callback when at least one valid element is found
 * @param query Function that returns the node(s) to watch for (can return single element or array/NodeList)
 * @param callback Function to call when valid node(s) are found, receives array of valid elements (HTMLElement or SVGElement)
 * @param options Optional configuration options
 * @returns Cleanup function to stop watching
 */
function GME_watchFor<T extends AsyncQuery>(query: T, callback: (nodes: (HTMLElement | SVGElement)[]) => void, options?: WatchForOptions) {
  const { minInterval, container = document.body, observerOptions = { subtree: true, childList: true, characterData: true, attributes: true } } = options || {}
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
        pendingTimeoutId = null
      }
      const remainingTime = minInterval - timeSinceLastCall
      pendingTimeoutId = setTimeout(() => {
        if (isActive) {
          pendingTimeoutId = null
          executeCallback()
        }
      }, remainingTime)
    }
  }

  // Check immediately once
  checkAndCallback()

  // Use MutationObserver to watch DOM changes
  observer = new MutationObserver(() => {
    checkAndCallback()
  })

  observer.observe(container, observerOptions)

  // Return cleanup function
  return () => {
    if (!isActive) {
      return
    }

    isActive = false
    if (observer) {
      observer.disconnect()
      observer = null
    }
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
 * @param callback Function to call when visible node(s) are found, receives array of visible elements (HTMLElement or SVGElement)
 * @param options Optional configuration options
 * @returns Cleanup function to stop watching
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_watchForVisible<T extends AsyncQuery>(query: T, callback: (nodes: (HTMLElement | SVGElement)[]) => void, options?: WatchForOptions) {
  // Wrap the callback to filter for visible elements
  const visibleCallback = (nodes: (HTMLElement | SVGElement)[]) => {
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
 * @param callback Function to call when valid node(s) are found, receives array of valid elements (HTMLElement or SVGElement)
 * @param options Optional configuration options
 * @returns Cleanup function to stop polling
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_pollFor<T extends AsyncQuery>(query: T, callback: (nodes: (HTMLElement | SVGElement)[]) => void, options?: PollForOptions) {
  const { interval = 1000, useIdleCallback = false } = options || {}
  let intervalId: ReturnType<typeof setInterval> | null = null
  let idleCallbackId: number | null = null
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

  const scheduleNext = () => {
    if (!isActive) {
      return
    }

    if (useIdleCallback && typeof window.requestIdleCallback === 'function') {
      idleCallbackId = window.requestIdleCallback(
        () => {
          idleCallbackId = null
          if (!isActive) {
            return
          }
          checkAndCallback()
          // Schedule next check, but ensure minimum interval
          setTimeout(() => {
            if (isActive) {
              scheduleNext()
            }
          }, interval)
        },
        { timeout: interval }
      )
    } else {
      // Fallback to setInterval if requestIdleCallback is not available
      intervalId = setInterval(() => {
        checkAndCallback()
      }, interval)
    }
  }

  // Check immediately once
  checkAndCallback()

  // Start polling
  scheduleNext()

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
    if (idleCallbackId !== null && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleCallbackId)
      idleCallbackId = null
    }
  }
}
