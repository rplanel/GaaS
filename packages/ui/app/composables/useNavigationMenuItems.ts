import type { MaybeRef } from 'vue'
import type { OrderedNavigationMenuItem } from '../types/navigation'
import { computed, toValue } from 'vue'

interface NavigationMenuItemParameters {
  navigationMenuItems: OrderedNavigationMenuItem[]
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
      .filter(item => item?.label !== 'Admin' || toValue(isAdmin))
      .sort((a, b) => a.order - b.order)
  })

  return {
    navigationMenuItems: computedNavigationMenuItems,
  }
}
