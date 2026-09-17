// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({

  extends: ['docus'],

  modules: [
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxt/ui',
    '@nuxt/content',
    '@nuxt/test-utils'
  ],

  devtools: {
    enabled: true
  },

  future: {
    compatibilityVersion: 4
  },
  compatibilityDate: '2024-07-11',

  nitro: {
    prerender: {
      routes: ['/'],
      crawlLinks: true
    }
  },

  typescript: {
    tsConfig: {
      compilerOptions: {
        skipLibCheck: true
      },
      exclude: [
        '../../node_modules/.pnpm/docus@*/node_modules/docus/app/composables/useSeo.ts',
        '../../node_modules/.pnpm/docus@*/node_modules/docus/app/plugins/i18n.ts',
        '../../node_modules/.pnpm/docus@*/node_modules/docus/modules/assistant/runtime/composables/useAssistant.ts',
        '../../node_modules/.pnpm/@nuxt+image@*/node_modules/@nuxt/image/dist/runtime/components/NuxtPicture.vue'
      ]
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  icon: {
    provider: 'iconify'
  }
})
