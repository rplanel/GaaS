// https://nuxt.com/docs/api/configuration/nuxt-config

import { createResolver } from '@nuxt/kit'

const { resolve } = createResolver(import.meta.url)

// import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  devtools: { enabled: true },
  future: {
    compatibilityVersion: 4,
  },
  alias: { '~gaasWiki': resolve('./') },

  modules: [
    '@nuxt/ui-pro',
    '@nuxt/test-utils/module',
    '@nuxt/eslint',
    '@nuxt/content',
  ],
  css: ['~gaasWiki/app/assets/css/main.css'],

})
