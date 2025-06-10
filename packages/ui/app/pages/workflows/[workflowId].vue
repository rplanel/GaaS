<script setup lang="ts">
// import type { SupabaseTypes } from '#build/types/database'
import type { BreadcrumbItem } from '@nuxt/ui'

withDefaults(defineProps<Props>(), { breadcrumbsItems: undefined })

// type Database = SupabaseTypes.Database

interface Props {
  breadcrumbsItems?: BreadcrumbItem[] | undefined
  // workflowId: number
}
const route = useRoute()
// const user = useSupabaseUser()
// const supabase = useSupabaseClient<Database>()

const workflowId = computed(() => {
  if (route?.params && 'workflowId' in route.params) {
    const workflowId = route.params.workflowId
    if (Array.isArray(workflowId))
      return 0
    if (workflowId) {
      return Number.parseInt(workflowId)
    }
    return workflowId
  }
  return undefined
})

// const { data: dbWorkflow } = await useAsyncData('workflow-db', async () => {
//   const userVal = toValue(user)
//   let workflowIdVal = toValue(workflowId)

//   if (!userVal) {
//     throw createError({
//       statusCode: 401,
//       statusMessage: 'Unauthorized: User not found',
//     })
//   }
//   if (!workflowIdVal) {
//     throw createError({
//       statusCode: 404,
//       statusMessage: 'Not Found: workflow not found',
//     })
//   }
//   if (typeof workflowIdVal === 'string') {
//     workflowIdVal = Number.parseInt(workflowIdVal)
//   }
//   const { data } = await supabase
//     .schema('galaxy')
//     .from('workflows')
//     .select('id, name, galaxy_id')
//     .eq('id', workflowIdVal)
//     .limit(1)
//     .single()
//   return data
// })

// const computedBreadcrumbsItems = computed(() => {
//   const workflowVal = toValue(dbWorkflow)
//   const breadcrumbsItemsVal = toValue(breadcrumbsItems)
//   if (workflowVal && breadcrumbsItemsVal) {
//     return [
//       ...breadcrumbsItemsVal.map(b => ({ ...b, disabled: false })),
//       {
//         label: workflowVal.name,
//         disabled: true,
//       },
//     ]
//   }
//   return toValue(breadcrumbsItems)
// })
</script>

<template>
  <NuxtPage :workflow-id />
</template>
