import type { Database } from '../types'

export function useNavigationMenuItems() {
  const { gaasUi: { navigationMenuItems: navigationMenuItemsFromConfig, wiki } } = useAppConfig()
  const supabase = useSupabaseClient<Database>()

  const { userRole } = useUserRole(supabase)
  const navigationMenuItemsRef = toRef(navigationMenuItemsFromConfig)

  const isAdmin = computed(() => {
    const userRoleVal = toValue(userRole)
    if (!userRoleVal)
      return false
    return userRoleVal === 'admin'
  })

  const navigationMenuItems = computed(() => {
    const navigationMenuItemsVal = toValue(navigationMenuItemsRef)
    return navigationMenuItemsVal
      .filter(item => item.label !== 'Admin' || isAdmin.value)
      .filter(item => item.label !== 'Wiki' || wiki)
      .sort((a, b) => a.order - b.order)
  })

  return {
    navigationMenuItems,
  }
}
