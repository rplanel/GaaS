import type { NavigationMenuItem } from '@nuxt/ui'
import type { MaybeRef } from 'vue'
import { computed, toValue } from 'vue'

interface NavigationMenuItemParameters {
  navigationMenuItems: NavigationMenuItem[]
  userRole: MaybeRef<string | undefined>
}

export function useNavigationMenuItems(parameters: NavigationMenuItemParameters) {
  const { navigationMenuItems, userRole } = parameters
  const isAdmin = computed(() => {
    const userRoleVal = toValue(userRole)
    if (!userRoleVal)
      return false
    return userRoleVal === 'admin'
  })

  const computedNavigationMenuItems = computed(() => {
    return navigationMenuItems
      .filter(item => item?.label !== 'Admin' || isAdmin)
      .sort((a, b) => a.order - b.order)
  })

  return {
    navigationMenuItems: computedNavigationMenuItems,
  }
}
