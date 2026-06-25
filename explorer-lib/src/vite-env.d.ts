/** unplugin-icons ?raw: import MDI icon as raw SVG string (same as preset / editor-lib). */
declare module '~icons/*?raw' {
  const src: string
  export default src
}

declare module '*.css?raw' {
  const src: string
  export default src
}
