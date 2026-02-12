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
const router = useRouter()
const supabase = useSupabaseClient<Database>()

const { userRole } = useUserRole(supabase)

const adminItems = ref([
  {
    label: 'Workflows',
    icon: 'i-lucide:workflow',
    id: 'workflows',
    description: 'Manage galaxy workflows',
  },
])

function goToAdminPanel(name: string) {
  router.push(`/admin/${name}`)
}

const pageHeaderProps = computed(() => {
  return {
    title: 'Admin panel',
    description: 'Manage your web application',
  }
})
</script>

<template>
  <div>
    <div v-if="userRole === 'admin'">
      <PageHeader
        :page-header-props
        :breadcrumbs-items
      />

      <div class="grid grid-flow-col gap-5 p-2">
        <UCard
          v-for="item in adminItems" :key="item.id"
          class="hover:bg-elevated divide-y-0 border-l-6 border-primary"
          @click="goToAdminPanel(item.id)"
        >
          <template #header>
            {{ item.label }}
          </template>
          {{ item.description }}
          <!-- <template #footer>
            <UButton color="primary" variant="subtle" icon="i-lucide:eye"></UButton>
          </template> -->
        </UCard>
      </div>
    </div>
    <div v-else class="my-5">
      <UAlert variant="subtle" color="error" title="Admin section" description="You don't have the admin permission" />
    </div>
  </div>
</template>
