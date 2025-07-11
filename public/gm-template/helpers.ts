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
      onload: function (response) {
        if (response.readyState !== 4) {
          return
        }

        if (!(200 <= response.status && response.status < 400)) {
          throw new Error('Failed to request:' + response.statusText)
        }

        resolve(response.response)
      },
      onerror: function (error) {
        reject(new Error('Failed to request:' + error.message))
      },
    })
  })
}

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

type Query = () => HTMLElement[] | HTMLElement | NodeListOf<Element> | Element[] | any[] | null

interface WaitForOptions {
  timeout?: boolean
}

function GME_waitFor<T extends Query>(query: T, options?: WaitForOptions) {
  const { timeout: openTimeout } = options || {}
  return new Promise<ReturnType<T>>((resolve, reject) => {
    const timerId =
      openTimeout &&
      setTimeout(() => {
        observer?.disconnect()
        reject(new Error('Timeout'))
      }, 3e3)

    let observer: MutationObserver | null = null

    const checkAndResolve = () => {
      const node = query()
      if (node) {
        timerId && clearTimeout(timerId)
        observer?.disconnect()
        resolve(node as ReturnType<T>)
        return true
      }
      return false
    }

    if (checkAndResolve()) {
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
}

function GME_sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
