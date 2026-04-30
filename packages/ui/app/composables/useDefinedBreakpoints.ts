import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'

const breakpoints = useBreakpoints(breakpointsTailwind)

export function useDefinedBreakpoints() {
  return {
    isMobile: breakpoints.smaller('md'),
    isSmallDesktopOrMobile: breakpoints.smaller('lg'),
    isDesktop: breakpoints.greaterOrEqual('md'),
  }
}
