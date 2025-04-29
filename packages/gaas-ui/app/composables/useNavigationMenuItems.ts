import type { NavigationMenuItem } from '@nuxt/ui'
import type { MaybeRef } from 'vue'
import { computed, toValue } from 'vue'

interface NavigationMenuItemParameters {
  wiki: boolean
  navigationMenuItems: NavigationMenuItem[]
  userRole: MaybeRef<string | undefined>
}

export function useNavigationMenuItems(parameters: NavigationMenuItemParameters) {
  const { wiki, navigationMenuItems, userRole } = parameters
  // const { gaasUi: { navigationMenuItems: navigationMenuItemsFromConfig, wiki } } = useAppConfig()
  // const supabase = useSupabaseClient<Database>()

  // const { userRole } = useUserRole(supabase)

  const isAdmin = computed(() => {
    const userRoleVal = toValue(userRole)
    if (!userRoleVal)
      return false
    return userRoleVal === 'admin'
  })

  const computedNavigationMenuItems = computed(() => {
    return navigationMenuItems
      .filter(item => item?.label !== 'Admin' || isAdmin)
      .filter(item => item?.label !== 'Wiki' || wiki)
      .sort((a, b) => a.order - b.order)
  })

  return {
    navigationMenuItems: computedNavigationMenuItems,
  }
}
