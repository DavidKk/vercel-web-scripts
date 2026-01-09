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

/**
 * Fetch-like function using GM_xmlhttpRequest
 * Compatible with standard fetch API but uses Tampermonkey's GM_xmlhttpRequest
 * @param input Request URL or Request object
 * @param init Optional request options (method, headers, body, etc.)
 * @returns Promise that resolves to a Response-like object
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function GME_fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // Convert input to URL string
  let url: string
  if (typeof input === 'string') {
    url = input
  } else if (input instanceof URL) {
    url = input.toString()
  } else if (input instanceof Request) {
    url = input.url
    // Merge Request's init with provided init
    const requestInit: RequestInit = {
      method: input.method,
      headers: input.headers,
      body: input.body,
      mode: input.mode,
      credentials: input.credentials,
      cache: input.cache,
      redirect: input.redirect,
      referrer: input.referrer,
      referrerPolicy: input.referrerPolicy,
      integrity: input.integrity,
      keepalive: input.keepalive,
      signal: input.signal,
      ...init,
    }
    init = requestInit
  } else {
    throw new TypeError('Invalid input type for GME_fetch')
  }

  const method = (init?.method || 'GET').toUpperCase()
  const headers: Record<string, string> = {}

  // Convert Headers object to plain object
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        headers[key] = value
      })
    } else if (Array.isArray(init.headers)) {
      init.headers.forEach(([key, value]) => {
        headers[key] = value
      })
    } else {
      Object.assign(headers, init.headers)
    }
  }

  // Determine response type based on Accept header or default to text
  let responseType: 'arraybuffer' | 'blob' | 'json' | 'stream' | 'text' = 'text'
  const acceptHeader = headers['Accept'] || headers['accept'] || ''
  if (acceptHeader.includes('application/json')) {
    responseType = 'json'
  } else if (acceptHeader.includes('application/octet-stream') || acceptHeader.includes('*/*')) {
    responseType = 'arraybuffer'
  }

  // Convert body to string
  let bodyData: string | undefined
  if (init?.body) {
    if (typeof init.body === 'string') {
      bodyData = init.body
    } else if (init.body instanceof FormData) {
      // FormData needs special handling - convert to multipart/form-data format
      // For simplicity, convert to URLSearchParams format (only works for simple key-value pairs)
      const formData = new URLSearchParams()
      init.body.forEach((value, key) => {
        if (typeof value === 'string') {
          formData.append(key, value)
        } else if (value instanceof File) {
          // For File objects, we can't easily convert, so use JSON fallback
          // In practice, FormData with files should be handled differently
          formData.append(key, value.name)
        }
      })
      bodyData = formData.toString()
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
      }
    } else if (init.body instanceof URLSearchParams) {
      bodyData = init.body.toString()
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
      }
    } else if (init.body instanceof Blob) {
      // For Blob, we need to read it as text
      bodyData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsText(init.body as Blob)
      })
    } else if (init.body instanceof ArrayBuffer) {
      // Convert ArrayBuffer to string (base64 or text)
      const uint8Array = new Uint8Array(init.body)
      bodyData = Array.from(uint8Array)
        .map((b) => String.fromCharCode(b))
        .join('')
    } else {
      // Try to stringify as JSON
      bodyData = JSON.stringify(init.body)
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json'
      }
    }
  }

  return new Promise<Response>((resolve, reject) => {
    const requestDetails: GMXMLHttpRequestDetails = {
      method,
      url,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      data: bodyData,
      responseType,
      timeout: init?.signal ? undefined : undefined, // Timeout handling would need signal support
    }

    GM_xmlhttpRequest({
      ...requestDetails,
      onload: function (response: GMXMLHttpRequestResponse) {
        if (response.readyState !== 4) {
          return
        }

        // Create Response-like object
        const responseHeaders = new Headers()
        if (response.responseHeaders) {
          const headerLines = response.responseHeaders.split('\r\n')
          for (const line of headerLines) {
            const colonIndex = line.indexOf(':')
            if (colonIndex > 0) {
              const key = line.slice(0, colonIndex).trim()
              const value = line.slice(colonIndex + 1).trim()
              responseHeaders.append(key, value)
            }
          }
        }

        // Create a Response-like object
        const responseBody = response.response || response.responseText || ''
        const responseObj = {
          ok: response.status >= 200 && response.status < 300,
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          url: response.finalUrl || url,
          redirected: response.finalUrl !== url,
          type: 'basic' as ResponseType,
          body: null as ReadableStream | null,
          bodyUsed: false,
          clone: function () {
            throw new Error('Response.clone() is not supported in GME_fetch')
          },
          arrayBuffer: async function (): Promise<ArrayBuffer> {
            if (this.bodyUsed) {
              throw new TypeError('Body has already been consumed')
            }
            this.bodyUsed = true
            if (responseType === 'arraybuffer' && response.response instanceof ArrayBuffer) {
              return response.response
            }
            // Convert text to ArrayBuffer
            const encoder = new TextEncoder()
            const text = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)
            const uint8Array = encoder.encode(text)
            // Create a new ArrayBuffer to ensure correct type
            return uint8Array.buffer.slice(0) as ArrayBuffer
          },
          blob: async function (): Promise<Blob> {
            if (this.bodyUsed) {
              throw new TypeError('Body has already been consumed')
            }
            this.bodyUsed = true
            const mimeType = responseHeaders.get('content-type') || 'application/octet-stream'
            if (response.response instanceof Blob) {
              return response.response
            }
            const text = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)
            return new Blob([text], { type: mimeType })
          },
          text: async function (): Promise<string> {
            if (this.bodyUsed) {
              throw new TypeError('Body has already been consumed')
            }
            this.bodyUsed = true
            if (typeof responseBody === 'string') {
              return responseBody
            }
            return response.responseText || JSON.stringify(responseBody)
          },
          json: async function (): Promise<any> {
            if (this.bodyUsed) {
              throw new TypeError('Body has already been consumed')
            }
            this.bodyUsed = true
            if (responseType === 'json' && typeof responseBody === 'object') {
              return responseBody
            }
            const text = typeof responseBody === 'string' ? responseBody : response.responseText
            try {
              return JSON.parse(text)
            } catch (error) {
              throw new SyntaxError('Unexpected end of JSON input')
            }
          },
          formData: async function (): Promise<FormData> {
            if (this.bodyUsed) {
              throw new TypeError('Body has already been consumed')
            }
            this.bodyUsed = true
            const text = typeof responseBody === 'string' ? responseBody : response.responseText
            const formData = new FormData()
            const params = new URLSearchParams(text)
            params.forEach((value, key) => {
              formData.append(key, value)
            })
            return formData
          },
        }

        // Always resolve, even for error status codes (consistent with fetch API)
        resolve(responseObj as unknown as Response)
      },
      onerror: function (error: GMXMLHttpRequestError) {
        reject(new TypeError(`Failed to fetch: ${error.message || error.error}`))
      },
      ontimeout: function () {
        reject(new TypeError('Network request timeout'))
      },
      onabort: function () {
        reject(new DOMException('The operation was aborted.', 'AbortError'))
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

type AsyncQuery =
  | (() => (HTMLElement | SVGElement)[] | HTMLElement | SVGElement | NodeListOf<Element> | Element[] | any[] | null)
  | (() => Promise<(HTMLElement | SVGElement)[] | HTMLElement | SVGElement | NodeListOf<Element> | Element[] | any[] | null>)

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

/**
 * Convert HTML-like tags to %c styling format
 * Supports common tags: <b>, <i>, <u>, <s>, and color tags like <red>, <green>, etc.
 * @param text Text containing HTML-like tags
 * @returns Object with converted text and styles array
 */
function convertTagsToStyles(text: string): { text: string; styles: string[] } {
  // Color tag mappings (common color names)
  const colorMap: Record<string, string> = {
    red: '#dc3545',
    green: '#28a745',
    blue: '#007bff',
    yellow: '#ffc107',
    orange: '#fd7e14',
    purple: '#6f42c1',
    pink: '#e83e8c',
    cyan: '#17a2b8',
    gray: '#6c757d',
    grey: '#6c757d',
    black: '#000000',
    white: '#ffffff',
  }

  // Tag style mappings
  const tagStyleMap: Record<string, string> = {
    b: 'font-weight:bold',
    i: 'font-style:italic',
    u: 'text-decoration:underline',
    s: 'text-decoration:line-through',
  }

  // Combine all tag patterns (color tags + style tags)
  const allTags = [...Object.keys(colorMap), ...Object.keys(tagStyleMap)]
  const tagPattern = allTags.join('|')

  // Process tags from innermost to outermost
  let result = text
  const styleStack: string[] = []

  // Keep processing until no more tags
  let changed = true
  while (changed) {
    changed = false
    // Match innermost tags (tags that don't contain other tags)
    const regex = new RegExp(`<(${tagPattern})>([^<]*)</\\1>`, 'gi')
    result = result.replace(regex, (match, tagName, content) => {
      changed = true
      const tag = tagName.toLowerCase()
      const style = colorMap[tag] ? `color:${colorMap[tag]}` : tagStyleMap[tag] || ''

      // If content already has %c, preserve it and wrap with our style
      if (content.includes('%c')) {
        // Content has nested styles, wrap with our style
        styleStack.push(style, '')
        return `%c${content}%c`
      } else {
        // Simple case: wrap content with %c...%c
        styleStack.push(style, '')
        return `%c${content}%c`
      }
    })
  }

  return { text: result, styles: styleStack }
}

/**
 * Process log contents to support %c styling like console.log and HTML-like tags
 * Merges prefix style with user-provided styles in contents
 * Supports both %c syntax and HTML-like tags (<b>, <i>, <u>, <s>, <red>, etc.)
 * Can be used together: HTML tags are converted first, then %c syntax is processed
 * Note: For best results when mixing, place HTML tags before user %c in the string
 * @param prefixText Text prefix with %c placeholder (e.g., '%c✔ [OK]')
 * @param prefixStyle Style for the prefix
 * @param contents User-provided contents (may contain %c, styles, or HTML-like tags)
 * @returns Array of processed arguments for console.log
 */
function processLogContents(prefixText: string, prefixStyle: string, ...contents: any[]): any[] {
  if (contents.length === 0) {
    return [prefixText, prefixStyle]
  }

  // Check if first content is a string
  const firstContent = contents[0]
  if (typeof firstContent !== 'string') {
    // No %c in contents, just append contents after prefix
    return [prefixText, prefixStyle, ...contents]
  }

  // Step 1: Convert HTML-like tags to %c syntax first (if any)
  const tagRegex = /<(b|i|u|s|red|green|blue|yellow|orange|purple|pink|cyan|gray|grey|black|white)>(.*?)<\/\1>/gi
  let processedText = firstContent
  let tagStyles: string[] = []

  if (tagRegex.test(firstContent)) {
    // Convert tags to %c syntax
    const converted = convertTagsToStyles(firstContent)
    processedText = converted.text
    tagStyles = converted.styles
  }

  // Step 2: Process %c syntax (either from user or from converted tags)
  if (processedText.includes('%c')) {
    // Count how many %c were in the original text (user-provided, before tag conversion)
    const originalPercentCCount = (firstContent.match(/%c/g) || []).length
    const userProvidedStyleCount = originalPercentCCount

    // Extract user-provided styles from contents
    const userStyles: string[] = []
    const otherContents: any[] = []

    // Extract user-provided styles
    let userStyleIndex = 0
    for (let i = 1; i < contents.length; i++) {
      if (
        userStyleIndex < userProvidedStyleCount &&
        typeof contents[i] === 'string' &&
        (contents[i].includes('color:') || contents[i].includes('background:') || contents[i].includes('font-'))
      ) {
        userStyles.push(contents[i])
        userStyleIndex++
      } else {
        otherContents.push(contents[i])
      }
    }

    // Merge styles: Since HTML tags are converted first, tagStyles come first in the array
    // Then userStyles follow. This works correctly when HTML tags appear before user %c in the string.
    // Note: For best results, use HTML tags and %c separately, or ensure HTML tags come before user %c
    const allStyles = [...tagStyles, ...userStyles]

    // Combine prefix with processed text
    const combinedString = `${prefixText} ${processedText}`
    const combinedStyles = [prefixStyle, ...allStyles]

    return [combinedString, ...combinedStyles, ...otherContents]
  }

  // If we have tagStyles but no %c in final text (shouldn't happen, but handle it)
  if (tagStyles.length > 0) {
    const combinedString = `${prefixText} ${processedText}`
    const combinedStyles = [prefixStyle, ...tagStyles]
    return [combinedString, ...combinedStyles, ...contents.slice(1)]
  }

  // No %c or tags in contents, just append contents after prefix
  return [prefixText, prefixStyle, ...contents]
}

/**
 * Create logging functions with a module prefix
 * @param prefix Prefix to add to log messages (e.g., module name)
 * @returns Object containing logging functions with module prefix
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function createGMELogger(prefix?: string) {
  const modulePrefix = prefix && prefix.trim() ? `[${prefix.trim()}]` : ''

  return {
    /**
     * Log success message with module prefix
     * Supports %c styling and HTML-like tags in contents
     * @example
     * GME_ok('User:', '%cJohn', 'color: blue')
     * GME_ok('User: <b>John</b>')
     * GME_ok('Status: <green>Active</green>')
     * @param contents Messages to log (can include %c for styling or HTML-like tags like <b>, <i>, <red>, etc.)
     */
    GME_ok(...contents: any[]) {
      const args = processLogContents(`%c✔ [OK]${modulePrefix}`, 'color:#28a745;font-weight:700;', ...contents)
      // eslint-disable-next-line no-console
      console.log(...args)
    },

    /**
     * Log info message with module prefix
     * Supports %c styling and HTML-like tags in contents
     * @example
     * GME_info('Status:', '%cActive', 'color: green')
     * GME_info('Status: <b>Active</b>')
     * @param contents Messages to log (can include %c for styling or HTML-like tags like <b>, <i>, <red>, etc.)
     */
    GME_info(...contents: any[]) {
      const args = processLogContents(`%cℹ [INFO]${modulePrefix}`, 'color:#17a2b8;font-weight:700;', ...contents)
      // eslint-disable-next-line no-console
      console.log(...args)
    },

    /**
     * Log error message with module prefix
     * Supports %c styling and HTML-like tags in contents
     * @example
     * GME_fail('Error:', '%cFailed', 'color: red; font-weight: bold')
     * GME_fail('Error: <red>Failed</red>')
     * @param contents Messages to log (can include %c for styling or HTML-like tags like <b>, <i>, <red>, etc.)
     */
    GME_fail(...contents: any[]) {
      const args = processLogContents(`%c✘ [FAIL]${modulePrefix}`, 'color:#dc3545;font-weight:700;', ...contents)
      // eslint-disable-next-line no-console
      console.log(...args)
    },

    /**
     * Log warning message with module prefix
     * Supports %c styling and HTML-like tags in contents
     * @example
     * GME_warn('Warning:', '%cDeprecated', 'color: orange')
     * GME_warn('Warning: <yellow>Deprecated</yellow>')
     * @param contents Messages to log (can include %c for styling or HTML-like tags like <b>, <i>, <red>, etc.)
     */
    GME_warn(...contents: any[]) {
      const args = processLogContents(`%c⚠ [WARN]${modulePrefix}`, 'color:#ffc107;font-weight:700;', ...contents)
      // eslint-disable-next-line no-console
      console.log(...args)
    },
  }
}

// Default logging functions (for backward compatibility and core scripts)
/**
 * Log success message
 * Supports %c styling and HTML-like tags in contents
 * @example
 * GME_ok('User:', '%cJohn', 'color: blue')
 * GME_ok('User: <b>John</b>')
 * @param contents Messages to log (can include %c for styling or HTML-like tags like <b>, <i>, <red>, etc.)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_ok(...contents: any[]) {
  const args = processLogContents('%c✔ [OK]', 'color:#28a745;font-weight:700;', ...contents)
  // eslint-disable-next-line no-console
  console.log(...args)
}

/**
 * Log info message
 * Supports %c styling and HTML-like tags in contents
 * @example
 * GME_info('Status:', '%cActive', 'color: green')
 * GME_info('Status: <green>Active</green>')
 * @param contents Messages to log (can include %c for styling or HTML-like tags like <b>, <i>, <red>, etc.)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_info(...contents: any[]) {
  const args = processLogContents('%cℹ [INFO]', 'color:#17a2b8;font-weight:700;', ...contents)
  // eslint-disable-next-line no-console
  console.log(...args)
}

/**
 * Log error message
 * Supports %c styling and HTML-like tags in contents
 * @example
 * GME_fail('Error:', '%cFailed', 'color: red; font-weight: bold')
 * GME_fail('Error: <red>Failed</red>')
 * @param contents Messages to log (can include %c for styling or HTML-like tags like <b>, <i>, <red>, etc.)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_fail(...contents: any[]) {
  const args = processLogContents('%c✘ [FAIL]', 'color:#dc3545;font-weight:700;', ...contents)
  // eslint-disable-next-line no-console
  console.log(...args)
}

/**
 * Log warning message
 * Supports %c styling and HTML-like tags in contents
 * @example
 * GME_warn('Warning:', '%cDeprecated', 'color: orange')
 * GME_warn('Warning: <yellow>Deprecated</yellow>')
 * @param contents Messages to log (can include %c for styling or HTML-like tags like <b>, <i>, <red>, etc.)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_warn(...contents: any[]) {
  const args = processLogContents('%c⚠ [WARN]', 'color:#ffc107;font-weight:700;', ...contents)
  // eslint-disable-next-line no-console
  console.log(...args)
}
