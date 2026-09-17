export default defineAppConfig({
  ui: {
    colors: {
      primary: 'indigo',
      neutral: 'zinc'
    }
  },
  header: {
    title: 'GaaS docs',
    to: '/'
  },
  footer: {
    credits: `Copyright © ${new Date().getFullYear()}`
  },
  github: {
    url: 'https://github.com/rplanel/GaaS',
    branch: 'monitoring-analyses',
    rootDir: 'docs'
  },
  toc: {
    title: 'Table of Contents',
    bottom: {
      title: 'Community',
      links: [{
        icon: 'i-lucide-star',
        label: 'Star on GitHub',
        to: 'https://github.com/rplanel/GaaS',
        target: '_blank'
      }]
    }
  }
})
