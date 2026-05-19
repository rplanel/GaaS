import type { NavigationMenuItem } from '@nuxt/ui'

/**
 * Navigation menu item with explicit ordering.
 * Extends the base @nuxt/ui NavigationMenuItem with an `order` property
 * for deterministic sorting.
 */
export interface OrderedNavigationMenuItem extends NavigationMenuItem {
  order: number
}
