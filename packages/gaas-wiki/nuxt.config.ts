// https://nuxt.com/docs/api/configuration/nuxt-config
// import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  devtools: { enabled: true },
  future: {
    compatibilityVersion: 4,
  },
  modules: [
    '@nuxt/ui-pro',
    '@nuxt/test-utils/module',
    '@nuxt/eslint',
    '@nuxt/content',
  ],
  css: ['../app/assets/css/main.css', './app/assets/css/main.css'],

})
