<script setup lang="ts">
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'

interface Props {
  analysisId?: number | undefined
}
withDefaults(defineProps<Props>(), { analysisId: undefined })
const router = useRouter()

// definePageMeta({
//   middleware: 'auth',
// })
const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('lg')
const isOpen = ref(true)
</script>

<template>
  <AnalysisHistoryPanel v-if="analysisId" :analysis-id="analysisId" @close="router.push('/analyses')" />
  <ClientOnly>
    <USlideover v-if="isMobile" v-model:open="isOpen">
      <template #content>
        <AnalysisHistoryPanel v-if="analysisId" :analysis-id="analysisId" @close="router.push('/analyses')" />
      </template>
    </USlideover>
  </ClientOnly>
</template>
