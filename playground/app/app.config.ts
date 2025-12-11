export default defineAppConfig({
  toaster: {
    position: 'bottom-right' as const,
    expand: true,
    duration: 5000,
  },
  gaasUi: {
    name: 'GaaS Playground',
    navigationMenuItems: [
      {
        label: 'Test',
        icon: 'mdi:flask',
        exact: true,
        to: '/test',
        order: 6,
      },
    ],
  },
})
