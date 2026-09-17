// https://nuxt.com/docs/api/configuration/nuxt-config
// import { defineNuxtConfig } from 'nuxt/config'

import type { FileAfterParseHook } from '@nuxt/content'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { logger } from '@nuxt/kit'
import { searchContentRef } from './app/utils/content/search'

const currentDir = dirname(fileURLToPath(import.meta.url))
const log = logger.withTag('@gaas/wiki')

export default defineNuxtConfig({
  extends: ['@gaas/ui'],
  devtools: { enabled: true },
  $meta: {
    name: '@gaas/wiki',
  },
  future: {
    compatibilityVersion: 4,
  },

  modules: [
    '@nuxt/ui',
    '@nuxt/test-utils/module',
    '@nuxt/eslint',
    '@nuxt/content',
    'nuxt-studio',
    'evlog/nuxt',
  ],
  css: [
    join(currentDir, './app/assets/css/main.css'),
  ],
  hooks: {
    'content:file:afterParse': function (ctx: FileAfterParseHook) {
      if (ctx.file.id.startsWith('content/wiki/')) {
        log.info(`Parsed content: ${ctx.file.id}`)
        const body = ctx.content.body as {
          value: unknown[]
          toc: { links: { depth: number, id: string, text: string }[] }
        }
        const dois = []
        for (const block of body.value) {
          dois.push(...searchContentRef(block))
        }
        const uniqueDois = new Set(
          dois.flatMap((doi: string) => doi
            .split(',')
            .map((doi: string) => doi.trim()),
          ),
        )

        if (uniqueDois.size === 0) {
          return
        }

        // Add bibliography section to content
        body.value.push(
          ['bibliography-section', { ':dois': JSON.stringify(Array.from(uniqueDois)) }],
        )
        // Add bibliography section to table of contents
        body.toc.links.push({ depth: 2, text: 'Bibliography', id: 'bibliography' })
      }
    },
  },
  supabase: {
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      include: [],
      exclude: ['/', '/login', '/signup', '/confirm'],
      saveRedirectToCookie: true,

    },
  },
  evlog: {
    env: { service: 'wiki' },
  },

})
