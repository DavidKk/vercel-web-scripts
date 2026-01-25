import type { FileNode } from './types'

/**
 * Build tree structure from flat file paths
 * @param files Array of file paths
 * @returns Root file node
 */
export function buildFileTree(files: string[]): FileNode {
  const root: FileNode = {
    name: '',
    path: '',
    isDirectory: true,
    children: new Map(),
  }

  files.forEach((filePath) => {
    const parts = filePath.split('/')
    let current = root

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1
      const path = parts.slice(0, index + 1).join('/')

      if (!current.children.has(path)) {
        current.children.set(path, {
          name: part,
          path,
          isDirectory: !isLast,
          children: new Map(),
        })
      }

      if (!isLast) {
        current = current.children.get(path)!
      }
    })
  })

  return root
}

/**
 * Find a node by path in the file tree
 * @param root Root node of the tree
 * @param path Path to find
 * @returns Found node or null
 */
export function findNodeByPath(root: FileNode, path: string): FileNode | null {
  function searchNode(node: FileNode): FileNode | null {
    if (node.path === path) {
      return node
    }

    for (const child of node.children.values()) {
      const found = searchNode(child)
      if (found) {
        return found
      }
    }

    return null
  }

  return searchNode(root)
}
