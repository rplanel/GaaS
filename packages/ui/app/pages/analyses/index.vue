<script setup lang="ts">
import type { Database } from 'nuxt-galaxy'

// import type { Database } from '../../types'

export type ListAnalysis = Pick<
  Database['galaxy']['Tables']['analyses']['Row'],
  'id' | 'name' | 'state' | 'is_sync'
>
export interface ListAnalysisWithWorkflow extends ListAnalysis {
  workflows: Database['galaxy']['Tables']['workflows']['Row']
  histories: Pick<
    Database['galaxy']['Tables']['histories']['Row'],
    'state' | 'is_sync'
  >
}

export interface SanitizedAnalysis extends ListAnalysis {
  workflows: {
    name: string
    version: string
  }
}
</script>

<template>
  <div class="hidden lg:flex flex-1 items-center justify-center">
    <UIcon name="i-streamline:code-analysis" class="size-32 text-dimmed" />
  </div>
</template>
