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
  <AnalysisHistoryPanel v-if="analysisId" :analysis-id="analysisId" @close="router.push('/analyses')">
    <UContainer>
      <UAlert icon="mdi:message-alert" color="warning" variant="subtle" title="Not implemented" description="The result page is not implemented. This is not the function of this layer" class="my-3" />
    </UContainer>
  </AnalysisHistoryPanel>

  <ClientOnly>
    <USlideover v-if="isMobile" v-model:open="isOpen">
      <template #content>
        <AnalysisHistoryPanel v-if="analysisId" :analysis-id="analysisId" @close="router.push('/analyses')">
          <UContainer>
            <UAlert icon="mdi:message-alert" color="warning" variant="subtle" title="Not implemented" description="The result page is not implemented. This is not the function of this layer" class="my-3" />
          </UContainer>
        </AnalysisHistoryPanel>
      </template>
    </USlideover>
  </ClientOnly>
</template>
