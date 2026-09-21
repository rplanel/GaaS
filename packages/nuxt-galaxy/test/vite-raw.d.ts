/**
 * Vite's `?raw` suffix, which a few tests use to read a source file as text.
 * `vite/client` declares it, but this package's generated tsconfig sets
 * `types: []` and never references it, so it is spelled out here.
 */
declare module '*?raw' {
  const content: string
  export default content
}
