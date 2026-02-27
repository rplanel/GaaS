<script setup lang="ts">
// import type { SupabaseTypes } from '#build/types/database'
import type { BreadcrumbItem } from '@nuxt/ui'

import type { Database } from 'nuxt-galaxy'

// type Database = SupabaseTypes.Database

const props = withDefaults(defineProps<Props>(), { breadcrumbsItems: undefined })

interface Props {
  breadcrumbsItems?: BreadcrumbItem[] | undefined
}
const breadcrumbsItems = toRef(() => props.breadcrumbsItems)
const supabase = useSupabaseClient<Database>()

const { userRole } = useUserRole(supabase)

const adminItems = ref([
  {
    title: 'Workflows',
    icon: 'i-lucide:workflow',
    id: 'workflows',
    description: 'Manage galaxy workflows',
    to: '/admin/workflows',
  },
  {
    title: 'Users',
    icon: 'i-lucide:users',
    id: 'users',
    description: 'Manage users of your application',
    to: '/admin/users',
  },
])

const pageHeaderProps = computed(() => {
  return {
    title: 'Admin panel',
    description: 'Manage your web application',
  }
})
</script>

<template>
  <div>
    <PageHeader :page-header-props :breadcrumbs-items />
    <UPageBody>
      <div v-if="userRole === 'admin'">
        <UPageGrid>
          <UPageCard v-for="(item, index) in adminItems" :key="index" v-bind="item" />
        </UPageGrid>
      </div>
      <div v-else class="my-5">
        <UAlert
          variant="subtle" color="error" title="Admin section"
          description="You don't have the admin permission"
        />
      </div>
    </UPageBody>
  </div>
</template>
