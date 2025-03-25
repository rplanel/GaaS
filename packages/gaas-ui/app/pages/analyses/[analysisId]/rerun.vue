<script setup lang="ts">
// import type { SupabaseTypes } from '#build/types/database'
// import type { GalaxyTypes } from '#build/types/nuxt-galaxy'
// import type { BreadcrumbItem } from '@nuxt/ui'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'

interface Props {
  analysisId: number
  workflowId: number
}
// type Database = SupabaseTypes.Database
// type AnalysisDetail = GalaxyTypes.AnalysisDetail
const props = withDefaults(defineProps<Props>(), {
})

// definePageMeta({
//   middleware: 'auth',
// })

const { analysisId, workflowId } = toRefs(props)
// const supabase = useSupabaseClient<Database>()
// const user = useSupabaseUser()
// const workflowInputsModel = ref<undefined | Record<string, any>>({})

// const { data: analysis } = await useAsyncData(
//   `analysis-${toValue(analysisId)}`,
//   async () => {
//     const userVal = toValue(user)
//     const analysisIdVal = toValue(analysisId)
//     if (userVal && analysisIdVal) {
//       const { data, error } = await supabase
//         .schema('galaxy')
//         .from('analyses')
//         .select(
//           `
//         *,
//         workflows(*)`,
//         )
//         .eq('id', analysisIdVal)
//         .limit(1)
//         .returns<AnalysisDetail[]>()

//       if (error) {
//         throw createError({
//           statusMessage: error.message,
//           statusCode: Number.parseInt(error.code),
//         })
//       }
//       workflowInputsModel.value = data[0]?.analysis_inputs
//       return data ? data[0] : data
//     }
//   },
// )

// const workflowId = computed(() => {
//   const analysisVal = toValue(analysis)
//   return analysisVal?.workflows.id
// })

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('lg')
const isWorkflowRunPanelOpen = ref(true)
const router = useRouter()
</script>

<template>
  <WorkflowRunPanel v-if="workflowId" :workflow-id="workflowId" :analysis-id="analysisId" @close="router.push('/analyses')" />
  <ClientOnly>
    <USlideover v-if="isMobile" v-model:open="isWorkflowRunPanelOpen">
      <template #content>
        <WorkflowRunPanel v-if="workflowId" :workflow-id="workflowId" :analysis-id="analysisId" @close="router.push('/analyses')" />
      </template>
    </USlideover>
  </ClientOnly>
</template>
