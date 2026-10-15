export default defineAppConfig({
  ui: {
    colors: {
      primary: 'indigo',
      neutral: 'zinc'
    }
  },
  header: {
    title: 'GaaS docs',
    to: '/',
    logo: {
      light: '/gaas-mark-light.svg',
      dark: '/gaas-mark-dark.svg',
      alt: 'GaaS',
      // The header shows the wordmark without its cloud: at 24 px the cloud
      // is invisible and would only pad the box.
      wordmark: {
        light: '/gaas-wordmark-plain-light.svg',
        dark: '/gaas-wordmark-plain-dark.svg'
      },
      display: 'wordmark'
    }
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
