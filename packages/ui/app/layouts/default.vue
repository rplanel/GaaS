<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem, NavigationMenuItem } from '@nuxt/ui'
// import type { PostgresFilterBuilder} from 'postgrest-js'
// import type { SupabaseTypes } from '#build/types/database'
import type { Database } from 'nuxt-galaxy'
import type { ShallowRef } from 'vue'
import type { OrderedNavigationMenuItem } from '../app.config'
import { useNavigationMenuItems } from '../composables/useNavigationMenuItems'
// import { SUPABASE_QUERY_KEYS, useSupabaseQuery } from '../composables/useSupabaseQuery'
import { analysesListQuery, datasetsCountQuery, workflowsListQuery } from '../utils/queries/supabase'

// type Database = SupabaseTypes.Database

const { gaasUi: { footerItems, name, navigationMenuItems: navigationMenuItemsFromConfig } } = useAppConfig()

const footerItemsRef: Ref<NavigationMenuItem[]> = toRef(footerItems)
const supabase = useSupabaseClient<Database>()
const { userRole } = useUserRole(supabase)
const { navigationMenuItems } = useNavigationMenuItems({ navigationMenuItems: navigationMenuItemsFromConfig, userRole })
const collapsed = ref(false)

const links: OrderedNavigationMenuItem[] = [{
  label: 'Home',
  icon: 'i-lucide-house',
  to: '/',
  order: 0,

}]

const isAdmin = computed(() => {
  const userRoleVal = toValue(userRole)
  if (!userRoleVal)
    return false
  return userRoleVal === 'admin'
})

const { data: analyses, refresh: refreshAnalyses } = useQuery(
  () => analysesListQuery({ supabase }),
)

const { data: datasetsCount, refresh: refreshDatasetsCount } = useQuery(
  () => datasetsCountQuery({ supabase }),
)

const { data: workflows } = useQuery(() => workflowsListQuery({ supabase }))

const sanitizedNavigationMenuItems = computed(() => {
  const analysesVal = toValue(analyses)
  const workflowsVal = toValue(workflows)
  const navigationMenuItemsVal = toValue(navigationMenuItems)
  if (!analysesVal)
    return navigationMenuItemsVal

  return navigationMenuItemsVal
    .map((item) => {
      if (item.label === 'Analyses') {
        return {
          ...item,
          defaultOpen: true,
          badge: analysesVal.length,

        }
      }
      if (item.label === 'Datasets') {
        return {
          ...item,
          badge: datasetsCount.value,
        }
      }
      if (item.label === 'Workflows') {
        return {
          ...item,
          badge: workflowsVal?.length ?? 0,
        }
      }
      return item
    })
})
const computedLinks = computed<OrderedNavigationMenuItem[][]>(() => {
  const itemsVal = toValue(sanitizedNavigationMenuItems)
  itemsVal.sort((a, b) => a.order - b.order)
  if (isAdmin.value) {
    return [
      [
        ...links,
        ...itemsVal,
      ].sort((a, b) => a.order - b.order),
      [...footerItemsRef.value],
    ]
  }
  return [itemsVal]
})

const analysesSearchGroups = computed<CommandPaletteGroup<CommandPaletteItem>>(() => {
  const analysesVal = toValue(analyses)
  const searchGroups: CommandPaletteGroup = {
    id: 'analyses',
    label: 'Analyses',
    items: [],
  }

  if (!analysesVal)
    return searchGroups

  return {
    ...searchGroups,
    items: analysesVal?.map(({ name, id }) => {
      return { label: name, to: `/analyses/${id}/results` }
    }) ?? [],
  }
})
const workflowsSearchGroups = computed<CommandPaletteGroup<CommandPaletteItem>>(() => {
  const workflowsVal = toValue(workflows)
  return {
    id: 'workflows',
    label: 'Workflows',
    items: workflowsVal
      ? workflowsVal?.map(({ name_key, version_key, id }) => {
          return { label: `${name_key} - ${version_key}`, to: `/workflows/${id}/run` }
        })
      : [],
  }
})
const searchGroups = computed(() => {
  return [analysesSearchGroups.value, workflowsSearchGroups.value]
})

export interface DatasetsCountProvide {
  datasetsCount: ShallowRef<number | undefined>
  refreshDatasetsCount: () => Promise<any>
}
export interface AnalysesListProvide {
  analysesList: Ref<typeof analyses.value>
  refreshAnalysesList: () => Promise<any>
}

provide<DatasetsCountProvide>('datasetsCount', {
  datasetsCount,
  refreshDatasetsCount,
})
provide('analysesList', {
  analysesList: analyses,
  refreshAnalysesList: refreshAnalyses,
})
</script>

<template>
  <UDashboardGroup>
    <!-- <UDashboardSearch v-if="searchGroups" :groups="searchGroups" /> -->
    <UDashboardSidebar
      v-model:collapsed="collapsed" collapsible resizable class="bg-(--ui-bg-elevated)/25"
      :ui="{ footer: 'lg:border-t lg:border-(--ui-border)' }"
    >
      <template #header>
        <div class="flex flex-row justify-between items-center gap-1 w-full h-(--ui-header-height)">
          <div class="truncate">
            <NuxtLink v-if="!collapsed" to="/" class="truncate">
              <h1 class="text-2xl antialiased font-bold font-mono truncate">
                {{ name }}
              </h1>
            </NuxtLink>
          </div>
          <div>
            <UButton
              :icon="collapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'" color="neutral"
              variant="ghost" @click="collapsed = !collapsed"
            />
          </div>
        </div>
        <!-- <UDashboardSidebarCollapse v-model="collapsed" variant="subtle" /> -->
      </template>

      <template #default>
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-(--ui-border)" />
        <!-- <UContentSearchButton :collapsed="false" /> -->
        <UNavigationMenu
          v-if="computedLinks?.[0]" :collapsed="collapsed" :items="computedLinks[0]"
          orientation="vertical"
        />

        <UNavigationMenu
          v-if="computedLinks?.[1]" :collapsed="collapsed" :items="computedLinks[1]" tooltip
          orientation="vertical" class="mt-auto"
        />
      </template>

      <template #footer>
        <UserMenu :collapsed="collapsed" :is-admin="isAdmin" />
      </template>
    </UDashboardSidebar>
    <UDashboardSearch :groups="searchGroups" />

    <slot />
  </UDashboardGroup>
</template>
