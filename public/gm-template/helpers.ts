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

interface WaitForOptions {
  timeout?: boolean
}

type AsyncQuery =
  | (() => HTMLElement[] | HTMLElement | NodeListOf<Element> | Element[] | any[] | null)
  | (() => Promise<HTMLElement[] | HTMLElement | NodeListOf<Element> | Element[] | any[] | null>)

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_watchFor<T extends AsyncQuery>(query: T, callback: (node: NonNullable<Awaited<ReturnType<T>>>) => void) {
  let observer: MutationObserver | null = null
  let isActive = true

  const checkAndCallback = async () => {
    if (!isActive) {
      return
    }

    try {
      const result = query()
      const node = result instanceof Promise ? await result : result
      if (node) {
        callback(node as NonNullable<Awaited<ReturnType<T>>>)
      }
    } catch (error) {
      // Silently handle errors in callback to prevent breaking the watcher
      // eslint-disable-next-line no-console
      console.error('Error in GME_watchFor callback:', error)
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
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function GME_sha1(str: string) {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-1', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
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

/**
 * Checks if an element is visible in the viewport
 * Considers CSS properties like display, visibility, opacity, and viewport position
 * @param element The element to check
 * @returns True if the element is visible, false otherwise
 */
function GME_isVisible(element: Element | null | undefined): boolean {
  if (!element || !(element instanceof HTMLElement)) {
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

/**
 * Helper function to check if a node or nodes contain any visible element
 * @param node The node(s) to check
 * @returns The first visible element, or null if none are visible
 */
function findVisibleNode(node: any): Element | null {
  if (!node) {
    return null
  }

  // Handle single element
  if (node instanceof HTMLElement) {
    return GME_isVisible(node) ? node : null
  }

  // Handle NodeList or array
  if (node instanceof NodeList || Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const element = node[i]
      if (element instanceof HTMLElement && GME_isVisible(element)) {
        return element
      }
    }
    return null
  }

  // For other types, try to check directly
  if (node instanceof Element) {
    return GME_isVisible(node) ? node : null
  }

  return null
}

/**
 * Watches for a node to appear and become visible, then calls the callback
 * Only triggers callback when the node is actually visible (not hidden by CSS, in viewport, etc.)
 * @param query Function that returns the node(s) to watch for
 * @param callback Function to call when a visible node is found
 * @param options Optional configuration options
 * @returns Cleanup function to stop watching
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_watchForVisible<T extends AsyncQuery>(query: T, callback: (node: NonNullable<Awaited<ReturnType<T>>>) => void) {
  let observer: MutationObserver | null = null
  let isActive = true

  const checkAndCallback = async () => {
    if (!isActive) {
      return
    }

    try {
      const result = query()
      const node = result instanceof Promise ? await result : result
      if (node) {
        const visibleNode = findVisibleNode(node)
        if (visibleNode) {
          callback(visibleNode as unknown as NonNullable<Awaited<ReturnType<T>>>)
        }
      }
    } catch (error) {
      // Silently handle errors in callback to prevent breaking the watcher
      // eslint-disable-next-line no-console
      console.error('Error in GME_watchForVisible callback:', error)
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

  // Also listen to scroll and resize events to detect visibility changes
  const handleVisibilityChange = () => {
    checkAndCallback()
  }

  window.addEventListener('scroll', handleVisibilityChange, true)
  window.addEventListener('resize', handleVisibilityChange)

  // Return cleanup function
  return () => {
    if (!isActive) {
      return
    }

    isActive = false
    observer?.disconnect()
    observer = null
    window.removeEventListener('scroll', handleVisibilityChange, true)
    window.removeEventListener('resize', handleVisibilityChange)
  }
}
