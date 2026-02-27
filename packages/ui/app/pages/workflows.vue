<script setup lang="ts">
import type { Database } from 'nuxt-galaxy'

import type { GalaxyWorkflowExportSchema, SanitizedWorkflowDbItem } from '../types'
import * as bt from 'blendtype'
import { galaxyWorkflowExportSchema } from 'blendtype'
import * as z from 'zod'
import { fromError } from 'zod-validation-error'
import { workflowsListQuery } from '../utils/queries/supabase'

const supabase = useSupabaseClient<Database>()

const { userRole } = useUserRole(supabase)

const { data: dbWorkflows } = useQuery(() => workflowsListQuery({ supabase }))

const sanitizedDbWorkflows = computed<SanitizedWorkflowDbItem[] | null>(() => {
  const dbWorkflowsVal = toValue(dbWorkflows)
  if (dbWorkflowsVal) {
    return dbWorkflowsVal.map<SanitizedWorkflowDbItem>((wf) => {
      try {
        const definition: GalaxyWorkflowExportSchema = galaxyWorkflowExportSchema.loose().parse(wf.definition)
        return { ...wf, definition }
      }
      catch (err) {
        if (err instanceof z.ZodError) {
          const sanitizedErr = fromError(err)
          throw createError({ statusMessage: sanitizedErr.message, cause: sanitizedErr.cause, stack: sanitizedErr.stack, name: sanitizedErr.name })
        }
        throw createError({
          statusCode: bt.getStatusCode(err),
          statusMessage: bt.getErrorMessage(err),
        })
      }
    })
  }
  return null
})
</script>

<template>
  <UDashboardPanel
    id="workflows-list-panel" title="Workflows" :default-size="25" :min-size="20" :max-size="35"
    resizable
  >
    <UDashboardNavbar title="Workflows">
      <template #leading>
        <UDashboardSidebarCollapse />
      </template>
      <template #trailing>
        <UBadge :label="sanitizedDbWorkflows?.length ?? 0" variant="subtle" />
      </template>
      <template v-if="userRole === 'admin'" #right>
        <UButton icon="i-lucide-plus" size="md" class="rounded-full" to="/admin/workflows" />
      </template>
    </UDashboardNavbar>
    <WorkflowListPanel :workflows="sanitizedDbWorkflows" />
  </UDashboardPanel>
  <NuxtPage />
</template>
