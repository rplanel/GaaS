import type { NavigationMenuItem } from '@nuxt/ui'

export default defineAppConfig({
  gaasUi: {
    name: 'GaaS',
    seo: {
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

})

// should use extends NavigationMenuItem from @nuxt/ui but it is not working right now
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
