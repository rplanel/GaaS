// https://nuxt.com/docs/api/configuration/nuxt-config
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))

export default defineNuxtConfig({
  extends: ['../packages/gaas-ui', '../packages/gaas-wiki'],

  compatibilityDate: '2024-11-01',
  future: {
    compatibilityVersion: 4,
  },
  css: [
    join(currentDir, './app/assets/css/main.css'),
    // './app/assets/css/main.css',
  ],
  devtools: { enabled: true },
  // build: {
  //   transpile: ['../packages/gaas-ui', '../packages/gaas-wiki'],
  // },
})
