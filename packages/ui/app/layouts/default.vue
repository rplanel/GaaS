<script setup lang="ts">
import type { SupabaseTypes } from '#build/types/database'

import type { CommandPaletteGroup, CommandPaletteItem, NavigationMenuItem } from '@nuxt/ui'
import type { OrderedNavigationMenuItem } from '../app.config'
import { useAsyncData } from 'nuxt/app'
import { useNavigationMenuItems } from '../composables/useNavigationMenuItems'

type Database = SupabaseTypes.Database

const { gaasUi: { footerItems, name, navigationMenuItems: navigationMenuItemsFromConfig } } = useAppConfig()

const footerItemsRef: Ref<NavigationMenuItem[]> = toRef(footerItems)
const supabase = useSupabaseClient<Database>()
const { userRole } = useUserRole(supabase)
const { navigationMenuItems } = useNavigationMenuItems({ navigationMenuItems: navigationMenuItemsFromConfig, userRole })

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

const { data: analyses, refresh: refreshAnalyses } = await useAsyncData('search-analyses', async () => {
  const { data } = await supabase
    .schema('galaxy')
    .from('analyses')
    .select('id, name')
  if (data === null) {
    throw createError({ statusMessage: 'No analysis found', statusCode: 404 })
  }
  return data
})

const { data: datasetsCount, refresh: refreshDatasetsCount } = await useAsyncData('datasets-count', async () => {
  const { count } = await supabase
    .schema('galaxy')
    .from('uploaded_datasets')
    .select('*', { count: 'exact', head: true })
  if (count === null) {
    throw createError({ statusMessage: 'No datasets found', statusCode: 404 })
  }
  return count
})

const { data: workfows } = await useAsyncData('search-workflows', async () => {
  const { data } = await supabase
    .schema('galaxy')
    .from('workflows')
    .select('id, name_key, version_key')
  if (data === null) {
    throw createError({ statusMessage: 'No workflows found', statusCode: 404 })
  }
  return data
})

const sanitizedNavigationMenuItems = computed<OrderedNavigationMenuItem[]>(() => {
  const analysesVal = toValue(analyses)
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
  return {
    id: 'analyses',
    label: 'Analyses',
    items: analysesVal
      ? analysesVal?.map(({ name, id }) => {
          return { label: name, to: `/analyses/${id}/results` }
        })
      : [],
  }
})
const workflowsSearchGroups = computed<CommandPaletteGroup<CommandPaletteItem>>(() => {
  const workflowsVal = toValue(workfows)
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
  datasetsCount: Ref<number | null | undefined>
  refreshDatasetsCount: () => Promise<void>
}
export interface AnalysesListProvide {
  analysesList: Ref<typeof analyses.value>
  refreshAnalysesList: () => Promise<void>
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
      collapsible resizable class="bg-(--ui-bg-elevated)/25"
      :ui="{ footer: 'lg:border-t lg:border-(--ui-border)' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink v-if="!collapsed" to="/" class="truncate">
          <h1 class="text-2xl antialiased font-bold font-mono truncate">
            {{ name }}
          </h1>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-(--ui-border)" />
        <!-- <UContentSearchButton :collapsed="false" /> -->
        <UNavigationMenu
          v-if="computedLinks?.[0]" :collapsed="collapsed" :items="computedLinks[0]"
          orientation="vertical"
        />

        <UNavigationMenu
          v-if="computedLinks?.[1]" :collapsed="collapsed" :items="computedLinks[1]"
          orientation="vertical" class="mt-auto"
        />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" :is-admin="isAdmin" />
      </template>
    </UDashboardSidebar>
    <UDashboardSearch :groups="searchGroups" />

    <slot />
  </UDashboardGroup>
</template>
