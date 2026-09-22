/**
 * Whether the application is served by the development server.
 *
 * `import.meta.dev` is replaced at build time, so a component reading it
 * directly runs in one mode only and cannot be tested in the other. Read
 * through this auto-import, a test replaces it with `mockNuxtImport`.
 */
export function isDevelopmentMode(): boolean {
  return import.meta.dev
}
