export default defineNuxtConfig({
  modules: ['../src/module'],
  devtools: { enabled: true },
  // The module sets no sign-in redirects (#162), and this playground has no
  // sign-in pages to send anyone to, so its one page stays reachable signed
  // out, as it was when the module made `/` a public page.
  supabase: {
    redirect: false,
  },
  compatibilityDate: '2025-01-03',
})
