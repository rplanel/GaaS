// https://nuxt.com/docs/api/configuration/nuxt-config
// import { defineNuxtConfig } from 'nuxt/config'

import type { FileAfterParseHook } from '@nuxt/content'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { searchContentRef } from './app/utils/content/search.js'

const currentDir = dirname(fileURLToPath(import.meta.url))

export default defineNuxtConfig({
  extends: ['@gaas/ui'],
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
  css: [
    join(currentDir, './app/assets/css/main.css'),
    // '~gaasWiki/app/assets/css/main.css'
  ],
  hooks: {
    'content:file:afterParse': function (ctx: FileAfterParseHook) {
      if (ctx.file.id === 'content/wiki/satellites/1.p4.md') {
        // const t = ctx.content
        console.log('Parsed content:', ctx.file.id)
        const dois = []
        for (const block of ctx.content.body.value) {
          dois.push(...searchContentRef(block))
        }
        const uniqueDois = new Set(
          dois.flatMap((doi: string) => doi
            .split(',')
            .map((doi: string) => doi.trim()),
          ),
        )

        // Add bibliography section to content
        ctx.content.body.value.push(
          ['bibliography-section', { ':dois': JSON.stringify(Array.from(uniqueDois)) }],
        )

        // Add bibliography section to table of contents

        ctx.content.body.toc.links.push({ depth: 2, text: 'Bibliography', id: 'bibliography' })
      }

      // console.log('Parsed content:', ctx.content.value)
    },
  },

})
