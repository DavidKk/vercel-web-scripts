const OPEN_TAG = `// == MEATA START ==`
const CLOSE_TAG = `// == MEATA END ==`

export function extractMeta(content: string) {
  const openTagIndex = content.indexOf(OPEN_TAG)
  const closeTagIndex = content.indexOf(CLOSE_TAG)

  if (openTagIndex === -1 || closeTagIndex === -1) {
    return {}
  }

  const metaContent = content.slice(openTagIndex + OPEN_TAG.length, closeTagIndex).trim()

  const meta: Record<string, string | string[]> = {}
  for (const line of metaContent.split('\n')) {
    const content = line.trim().replace(/^\/\//, '').trim()
    const [key, value] = content.split(/\s+/)
    if (key.charAt(0) !== '@') {
      continue
    }

    const name = key.slice(1).trim()
    const text = value.trim()

    if (meta[name]) {
      meta[name] = Array.isArray(meta[name]) ? [...meta[name], text] : [meta[name], text]
      continue
    }

    meta[name] = text
  }

  return meta
}

export function prependMeta(content: string, info: Record<string, string | string[]>) {
  const remarks = Object.entries(info).map(([key, value]) => {
    if (Array.isArray(value)) {
      return value.map((v) => `// @${key} ${v}`).join('\n')
    }

    return `// @${key} ${value}`
  })

  if (!Array.isArray(remarks) || remarks.length === 0) {
    return content
  }

  return [OPEN_TAG, ...remarks, CLOSE_TAG, '', clearMeta(content)].join('\n')
}

export function clearMeta(content: string) {
  while (true) {
    const openTagIndex = content.indexOf(OPEN_TAG)
    const closeTagIndex = content.indexOf(CLOSE_TAG)

    if (openTagIndex === -1 || closeTagIndex === -1) {
      break
    }

    content = content.slice(0, openTagIndex) + content.slice(closeTagIndex + CLOSE_TAG.length)
  }

  return content.trim()
}
