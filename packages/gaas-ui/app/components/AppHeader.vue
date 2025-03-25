<script setup lang="ts">
import type { OrderedNavigationMenuItem } from '../app.config'
import type { Database } from '../types'

const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()
const { userRole } = useUserRole(supabase)
const { gaasUi: { navigationMenuItems, name } } = useAppConfig()
const navigationMenuItemsRef = toRef(navigationMenuItems)
const computedItems = computed<OrderedNavigationMenuItem[]>(() => {
  const userRoleVal = toValue(userRole)
  const itemsVal = toValue(navigationMenuItemsRef)
  if (userRoleVal === 'admin') {
    return [
      ...itemsVal,
      {
        label: 'Admin',
        icon: 'i-material-symbols:admin-panel-settings',
        to: '/admin',
        order: itemsVal.length + 1,
        children: [
          {
            icon: 'i-lucide:workflow',
            label: 'Workflows',
            description: 'Manage workflows',
            to: '/admin/workflows',
          },
          {
            label: 'User',
            icon: 'i-lucide:user',
            description: 'Manage users and roles',
            to: '/admin/users',
          },
        ],
      },
    ].sort((a, b) => a.order - b.order)
  }
  return itemsVal.sort((a, b) => a.order - b.order)
})
async function logout() {
  const { error } = await supabase.auth.signOut()
  if (error) {
    throw createError({ statusMessage: getErrorMessage(error), statusCode: getStatusCode(error) })
  }

  await navigateTo('/login')
}
const userItems = ref([
  {
    label: 'Logout',
    icon: 'lucide:log-out',
    onSelect: logout,
  },
])
</script>

<template>
  <UHeader :ui="{ left: 'min-w-0', toggle: '-mr-1.5' }" mode="drawer" :menu="{ shouldScaleBackground: true }">
    <template #left>
      <NuxtLink
        to="/"
        class="flex items-end gap-2 font-bold text-xl text-[var(--ui-text-highlighted)] min-w-0 focus-visible:outline-[var(--ui-primary)] shrink-0"
        aria-label="Gass"
      >
        {{ name }}
      </NuxtLink>
    </template>
    <UNavigationMenu :items="computedItems" variant="link" />

    <template #right>
      <UColorModeButton />
      <template v-if="!user">
        <UButton
          label="Sign in"
          color="neutral"
          variant="ghost"
          to="/login"
        />
        <UButton
          label="Sign up"
          color="neutral"
          trailing-icon="i-lucide-arrow-right"
          class="hidden lg:flex"
          to="/signup"
        />
      </template>
      <template v-else>
        <UDropdownMenu
          :items="userItems"
        >
          <UUser
            :name="user.email"
            :avatar="{
              icon: 'i-lucide-user',
            }"
          />
        </UDropdownMenu>
      </template>
    </template>
    <template #content>
      <UNavigationMenu orientation="vertical" :items="computedItems" class="-mx-2.5" />
    </template>
  </UHeader>
</template>
