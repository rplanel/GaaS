<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { GalaxyWorkflowsItem } from 'blendtype'
import type { WorkflowRow } from 'nuxt-galaxy'
import type { PublishFailure } from '../../utils/publishFailure'
import { getWorkflowTagName, getWorkflowTagVersion } from 'blendtype'
import { log } from 'evlog/client'
import * as z from 'zod'
import { describePublishFailure } from '../../utils/publishFailure'

/**
 * The dialog an administrator publishes a version from (ADR 0004): one
 * Galaxy stored workflow, a name and a label, for the latest revision.
 *
 * The name is the lineage: once the stored workflow has a version it is
 * locked to that version's name, otherwise it is pre-filled from the `name:`
 * tag when there is one, otherwise typed. The label is pre-filled from the
 * `version:` tag, otherwise typed. Galaxy's display name is never a pre-fill,
 * since it usually cannot name a directory. Every refusal the server answers
 * is a sentence, shown here next to the fields it is about; nothing closes
 * until the server has said yes.
 */
const props = defineProps<{
  /** The stored workflow, as Galaxy lists it. */
  workflow: GalaxyWorkflowsItem
  /** The name the stored workflow's versions carry, once it has one; the new version keeps it. */
  lineageName?: string
}>()

const emit = defineEmits<{
  /** The server said yes: the version row as it was written. */
  published: [version: WorkflowRow]
}>()

const open = defineModel<boolean>('open', { default: false })

const nameLocked = computed(() => props.lineageName !== undefined)

// The directory rule (ADR 0003) is the server's to state, in its own
// sentence; the form only refuses what could not be sent at all.
const schema = z.object({
  name: z.string('Type a name').min(1, 'Type a name'),
  label: z.string('Type a label').min(1, 'Type a label'),
})
type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  name: props.lineageName ?? getWorkflowTagName(props.workflow.tags) ?? undefined,
  label: getWorkflowTagVersion(props.workflow.tags) ?? undefined,
})

const refusal = ref<PublishFailure | undefined>()
const publishing = ref(false)

async function onSubmit(event: FormSubmitEvent<Schema>) {
  refusal.value = undefined
  publishing.value = true
  try {
    const version = await $fetch<WorkflowRow>('/api/db/workflows', {
      method: 'POST',
      body: {
        galaxyId: props.workflow.id,
        name: event.data.name,
        label: event.data.label,
      },
    })
    // only once the server has said yes does the dialog close
    emit('published', version)
    open.value = false
  }
  catch (error) {
    // a refusal names what to change, so the administrator reads it here,
    // next to the fields, rather than on the error page; the cause itself is
    // only ever worth a log, at `warn` when the administrator can fix it by
    // retyping and at `error` when the server could not say why
    const status = toValue(useErrorStatus(error).errorStatus)
    const recoverable = status !== undefined && status >= 400 && status < 500
    log[recoverable ? 'warn' : 'error']({
      action: 'workflow:publish_failed',
      tag: 'admin/PublishVersionModal',
      status,
      error: String(error),
    })
    refusal.value = describePublishFailure(error)
  }
  finally {
    publishing.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Publish a version"
    :description="`Give the latest revision of ${workflow.name} a name and a label.`"
  >
    <template #body>
      <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField
          label="Name"
          name="name"
          :description="nameLocked ? 'Every version of this workflow keeps this name.' : 'The name a results view directory is found by.'"
        >
          <UInput v-model="state.name" name="name" :disabled="nameLocked" class="w-full" />
        </UFormField>

        <UFormField label="Label" name="label" description="The version label users see beside the name.">
          <UInput v-model="state.label" name="label" class="w-full" />
        </UFormField>

        <UFormField label="Revision" description="Choosing another revision is coming later.">
          <p data-testid="publish-revision" class="text-sm">
            Latest, as saved in Galaxy now.
          </p>
        </UFormField>

        <UAlert
          v-if="refusal"
          data-testid="publish-refusal"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-x"
          :title="refusal.title"
          :description="refusal.description"
        />

        <div class="flex justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="subtle" @click="open = false" />
          <UButton type="submit" label="Publish" data-testid="publish-submit" :loading="publishing" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
