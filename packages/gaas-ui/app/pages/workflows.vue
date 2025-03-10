<script setup lang="ts">
import type { Database, GalaxyWorkflowExportSchema, RowWorkflow, SanitizedWorkflowDbItem } from '../types'
import { galaxyWorkflowExportSchema } from 'blendtype'
import { z } from 'zod'
import { fromError } from 'zod-validation-error'

const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()

const { userRole } = useUserRole(supabase)

const { data: dbWorkflows } = await useAsyncData('workflows-auth', async () => {
  const userVal = toValue(user)
  if (!userVal) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized: User not found',
    })
  }

  const { data, error } = await supabase
    .schema('galaxy')
    .from('workflows')
    .select()
    .returns<RowWorkflow[]>()

  if (data === null) {
    throw createError({ statusMessage: 'No uploaded dataset found', statusCode: 404 })
  }
  if (error) {
    throw createError({ statusCode: getStatusCode(error), statusMessage: getErrorMessage(error) })
  }

  return data
})

const sanitizedDbWorkflows = computed<SanitizedWorkflowDbItem[] | null>(() => {
  const dbWorkflowsVal = toValue(dbWorkflows)
  if (dbWorkflowsVal) {
    return dbWorkflowsVal.map<SanitizedWorkflowDbItem>((wf) => {
      try {
        const definition: GalaxyWorkflowExportSchema = galaxyWorkflowExportSchema.passthrough().parse(wf.definition)
        return { ...wf, definition }
      }
      catch (err) {
        if (err instanceof z.ZodError) {
          const sanitizedErr = fromError(err)
          throw createError({ statusMessage: sanitizedErr.message, cause: sanitizedErr.cause, stack: sanitizedErr.stack, name: sanitizedErr.name })
        }
        throw createError({
          statusCode: getStatusCode(err),
          statusMessage: getErrorMessage(err),
        })
      }
    })
  }
  return null
})
</script>

<template>
  <UDashboardPanel id="workflows-list-panel" title="Workflows" :default-size="25" :min-size="20" :max-size="35" resizable>
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
