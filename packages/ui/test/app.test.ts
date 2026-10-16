/**
 * The one `app.vue` every GaaS app renders through (#157, ADR 0008).
 *
 * Two copies used to exist, ui's and the wiki's, and the wiki's won in every
 * app that extended it. It had drifted: it dropped ui's `twitter:card`,
 * `og:site_name` and site-name title template, so each app on the wiki lost
 * them without anything failing. With the wiki folded into ui there is one
 * file again, and this suite holds both halves of it: ui's social tags, and
 * the wiki's navigation and search over the `content` collection.
 *
 * The router's page is stubbed. What the app owes a page is its title
 * template and the `navigation` it provides, and a stub that sets a title and
 * reads the navigation observes both without rendering a real route.
 */

import type { ContentNavigationItem } from '@nuxt/content'
import type { Ref } from 'vue'
import { updateAppConfig, useAppConfig, useHead } from '#imports'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, inject, ref } from 'vue'
import App from '../app/app.vue'

/** The `content` collection's navigation, as @nuxt/content would build it from an app's `content/wiki/`. */
const WIKI_NAVIGATION: ContentNavigationItem[] = [
  {
    title: 'Wiki',
    path: '/wiki',
    stem: 'wiki',
    children: [
      { title: 'Restriction-modification', path: '/wiki/restriction-modification', stem: 'wiki/restriction-modification' },
    ],
  },
]

const { queryCollectionNavigation, queryCollectionSearchSections } = vi.hoisted(() => ({
  // Answers for the `content` collection only, so reading any other
  // collection leaves the page with nothing to show.
  queryCollectionNavigation: vi.fn(async (collection: string) => collection === 'content' ? WIKI_NAVIGATION : []),
  queryCollectionSearchSections: vi.fn(async (_collection: string) => []),
}))

mockNuxtImport('queryCollectionNavigation', () => queryCollectionNavigation)
mockNuxtImport('queryCollectionSearchSections', () => queryCollectionSearchSections)
mockNuxtImport('useUserRole', () => () => ({ userRole: ref('user') }))
mockNuxtImport('useSupabaseClient', () => () => ({} as never))

/** Stands in for the page the router would render: it names itself, as a page does, and lists the navigation the app provides. */
const PageStub = defineComponent({
  name: 'PageStub',
  setup() {
    useHead({ title: 'Restriction-modification' })
    const navigation = inject<Ref<ContentNavigationItem[] | undefined>>('navigation')
    return () => h('ul', { 'data-testid': 'navigation' }, (navigation?.value ?? []).flatMap(item => [
      h('li', item.title),
      ...(item.children ?? []).map(child => h('li', child.title)),
    ]))
  },
})

/** Renders its slot alone, so the page stub is all the router contributes. */
const LayoutStub = defineComponent({
  name: 'LayoutStub',
  setup(_, { slots }) {
    return () => slots.default?.()
  },
})

let mounted: { unmount: () => void } | undefined

// Unmounted after each test, so a previous mount's head entries cannot
// answer for the next one's.
afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

async function mountApp() {
  const wrapper = await mountSuspended(App, {
    global: { stubs: { NuxtPage: PageStub, NuxtLayout: LayoutStub } },
  })
  mounted = wrapper
  return wrapper
}

describe('app.vue', () => {
  it('provides the content collection\'s navigation to the page it renders', async () => {
    const wrapper = await mountApp()

    const navigation = wrapper.get('[data-testid="navigation"]')
    expect(navigation.text()).toContain('Wiki')
    expect(navigation.text()).toContain('Restriction-modification')
  })

  it('searches the content collection', async () => {
    // Cleared first, so an earlier test's mount cannot answer for this one.
    queryCollectionSearchSections.mockClear()
    await mountApp()

    await vi.waitFor(() => expect(queryCollectionSearchSections).toHaveBeenCalledWith('content'))
  })

  it('titles a page after the app\'s site name and tags it for social cards', async () => {
    // An app names its site and keeps ui's `titleTemplate`, which names
    // GaaS. The title has to follow the site name, not that template.
    const siteName = useAppConfig().gaasUi.seo.siteName
    updateAppConfig({ gaasUi: { seo: { siteName: 'DefenseFinder' } } })
    try {
      await mountApp()

      await vi.waitFor(() => expect(document.title).toBe('Restriction-modification - DefenseFinder'))
      expect(document.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe('summary_large_image')
      expect(document.querySelector('meta[property="og:site_name"]')?.getAttribute('content')).toBe('DefenseFinder')
    }
    finally {
      updateAppConfig({ gaasUi: { seo: { siteName } } })
    }
  })
})
