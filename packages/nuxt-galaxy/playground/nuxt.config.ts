// The second UI (ADR 0009). Its rules are in nuxt-galaxy's AGENTS.md.
export default defineNuxtConfig({
  modules: ['../src/module'],
  devtools: { enabled: true },
  // The module sets no sign-in redirects (#162). These two are
  // @nuxtjs/supabase's defaults, written out because they name this
  // playground's pages. A password sign-in never comes back through the
  // callback, so nothing is served at /confirm.
  supabase: {
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
    },
  },
  compatibilityDate: '2025-01-03',
})
