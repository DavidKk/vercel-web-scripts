/**
 * Type declarations for ?raw imports
 * Allows importing file contents as strings using webpack's asset/source loader
 */

declare module '*.ts?raw' {
  const content: string
  export default content
}

declare module '*.d.ts?raw' {
  const content: string
  export default content
}

declare module '*.js?raw' {
  const content: string
  export default content
}

declare module '*.html?raw' {
  const content: string
  export default content
}

declare module '*.css?raw' {
  const content: string
  export default content
}

declare module '*.json?raw' {
  const content: string
  export default content
}
