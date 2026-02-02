/**
 * Vite raw import types for preset UI HTML/CSS
 */
declare module '*.html?raw' {
  const src: string
  export default src
}
declare module '*.css?raw' {
  const src: string
  export default src
}

/** unplugin-icons ?raw: import icon as raw SVG string */
declare module '~icons/*?raw' {
  const src: string
  export default src
}
