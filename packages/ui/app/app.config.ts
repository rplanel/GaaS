import type { NavigationMenuItem } from '@nuxt/ui'

export default defineAppConfig({
  gaasUi: {
    name: 'GaaS UI',
    seo: {
      siteName: 'GaaS',
      title: 'GaaS',
      titleTemplate: '%s - GaaS',
    },
    navigationMenuItems: [
      {
        label: 'Datasets',
        icon: 'i-lucide-files',
        to: '/datasets',
        order: 1,
      },
      {
        label: 'Workflows',
        icon: 'i-lucide:workflow',
        to: '/workflows',
        order: 2,
      },
      {
        label: 'Analyses',
        icon: 'i-streamline:code-analysis',
        to: '/analyses',
        order: 3,
        children: [],
      },
      {
        label: 'Admin',
        icon: 'i-material-symbols:admin-panel-settings',
        to: '/admin',
        order: 5,
        children: [
          {
            icon: 'i-lucide:workflow',
            label: 'Workflows',
            description: 'Manage workflows',
            to: '/admin/workflows',
          },
          {
            label: 'User',
            icon: 'i-lucide:user',
            description: 'Manage users and roles',
            to: '/admin/users',
          },
        ],
      },

    ],
    analyisParametersMenuItems: {
      label: 'Analysis parameters',
      icon: 'mdi:tools',
      exact: true,
    },
    resultsMenuItems: { } as Record<string, Record<string, unknown>>,
    footerItems: [
      {
        label: 'Issues',
        to: 'https://github.com/rplanel/gaas/issues',
        target: '_blank',
        trailingIcon: 'octicon:issue-opened-24',
      },
      { label: 'Code', trailingIcon: 'i-simple-icons-github', to: 'https://github.com/rplanel/gaas', target: '_blank' },
    ],
  },
  toaster: {
    position: 'bottom-right' as const,
    expand: true,
    duration: 5000,
  },
  ui: {
    colors: {
      primary: 'indigo',
      neutral: 'zinc',
    },
  },
  meilisearch: {
    hostUrl: 'http://my-meilisearch-server.domain.com', // reqired
    searchApiKey: '<your_search_key>', // reqired
  },
})

// should use extends NavigationMenuItem
// from @nuxt/ui but it is not working right now
export interface OrderedNavigationMenuItem extends NavigationMenuItem {
  order: number
}
// declare module '@nuxt/schema' {
//   interface AppConfigInput {
//     gaasUi?: {
//       /** Project name */
//       name?: string
//       navigationMenuItems?: OrderedNavigationMenuItem[]
//       footerItems?: NavigationMenuItem[]
//       seo: UseSeoMetaInput
//     }
//     toaster: {
//       position: string
//       expand: boolean
//       duration: number
//     }
//   }
// }
// export {}
