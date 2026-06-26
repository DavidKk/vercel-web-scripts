/** Matches `// filename.ts` markers emitted by the remote bundle compiler. */
export const REMOTE_MODULE_MARKER_RE = /^\s*\/\/\s+([\w./-]+\.(?:js|ts))\s*$/gm

/** One compiled script block inside an aggregate remote bundle. */
export interface RemoteBundleModule {
  file: string
  content: string
}

/**
 * Split an aggregate remote bundle into per-file modules.
 * @param content Full bundle body
 * @returns Modules in source order (empty when no markers)
 */
export function splitRemoteBundleModules(content: string): RemoteBundleModule[] {
  if (!content) {
    return []
  }

  const markers: Array<{ file: string; start: number }> = []
  const re = new RegExp(REMOTE_MODULE_MARKER_RE.source, 'gm')
  let match: RegExpExecArray | null
  while ((match = re.exec(content)) !== null) {
    markers.push({ file: match[1], start: match.index })
  }
  if (markers.length === 0) {
    return []
  }

  const modules: RemoteBundleModule[] = []
  for (let i = 0; i < markers.length; i++) {
    const { file, start } = markers[i]
    const end = i + 1 < markers.length ? markers[i + 1].start : content.length
    modules.push({ file, content: content.slice(start, end) })
  }
  return modules
}

/**
 * Join per-file modules back into one aggregate bundle body.
 * @param modules Modules in execution order
 * @returns Combined bundle text
 */
export function joinRemoteBundleModules(modules: RemoteBundleModule[]): string {
  if (!modules.length) {
    return ''
  }
  return modules
    .map((module) => module.content)
    .join('\n\n')
    .trim()
}
