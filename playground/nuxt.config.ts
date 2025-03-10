// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  extends: ['../packages/gaas-ui'],

  compatibilityDate: '2024-11-01',
  future: {
    compatibilityVersion: 4,
  },
  css: ['./app/assets/css/main.css'],
  devtools: { enabled: true },
})
