export default defineAppConfig({
  gaasUi: {
    navigationMenuItems: [
      {
        label: 'Wiki',
        icon: 'mdi:wikipedia',
        to: '/wiki',
        order: 4,
      },
    ],
  },

  gaasWiki: {
    name: 'GaaS Wiki',
    seo: {
      title: 'GaaS Wiki',
      titleTemplate: '%s - GaaS Wiki',
    },
    navigationMenuItems: [
      {
        label: 'Wiki',
        icon: 'mdi:wikipedia',
        to: '/wiki',
        order: 4,
      },
    ],
  },
})

// declare module '@nuxt/schema' {
//   interface AppConfigInput {
//     myLayer?: {
//       /** Project name */
//       name?: string
//     }
//   }
// }
