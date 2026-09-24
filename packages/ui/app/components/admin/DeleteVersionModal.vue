<script setup lang="ts">
import type { WorkflowRow } from 'nuxt-galaxy'
import type { DeleteVersionFailure } from '../../utils/deleteVersionFailure'
import { log } from 'evlog/client'
import { describeDeleteVersionFailure } from '../../utils/deleteVersionFailure'

/**
 * The confirmation an administrator deletes a version from (ADR 0004, #72):
 * the mistaken publish, a wrong label or a wrong revision.
 *
 * The version is named by its name and its label before anything is deleted,
 * and the dialog says what the alternative is: a version with analyses cannot
 * be deleted, since the foreign key from its analyses refuses, and retiring
 * keeps everything it has. Nothing is deleted until Delete is clicked; a
 * refusal is read here, as the server wrote it, and the dialog stays open on
 * it. Once the row is gone its revision can be published again under another
 * label.
 */
const props = defineProps<{
  /** The version to delete, as the admin page lists it. */
  version: WorkflowRow
}>()

const emit = defineEmits<{
  /** The server said yes: the version row that is gone. */
  deleted: [version: WorkflowRow]
}>()

const open = defineModel<boolean>('open', { default: false })

const refusal = ref<DeleteVersionFailure | undefined>()
const deleting = ref(false)

async function onConfirm() {
  refusal.value = undefined
  deleting.value = true
  try {
    const deleted = await $fetch<WorkflowRow>(`/api/db/workflows/${props.version.id}`, {
      method: 'DELETE',
    })
    // only once the server has said yes does the dialog close
    emit('deleted', deleted)
    open.value = false
  }
  catch (error) {
    // a refusal names what to do instead, so the administrator reads it here
    // rather than on the error page; the cause itself is only ever worth a
    // log, at `warn` when the administrator can act on it and at `error` when
    // the server could not say why
    const status = toValue(useErrorStatus(error).errorStatus)
    const recoverable = status !== undefined && status >= 400 && status < 500
    log[recoverable ? 'warn' : 'error']({
      action: 'workflow:delete_failed',
      tag: 'admin/DeleteVersionModal',
      versionId: props.version.id,
      status,
      error: String(error),
    })
    refusal.value = describeDeleteVersionFailure(error)
  }
  finally {
    deleting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Delete a version"
    :description="`Delete ${version.name_key} ${version.version_key}?`"
  >
    <template #body>
      <div class="space-y-4">
        <p class="text-sm">
          The version is removed and revision {{ version.revision }} of the Galaxy workflow can be published again under another label.
          A version that has analyses cannot be deleted: retire it instead, which keeps its analyses, their results views and its usage statistics.
        </p>

        <UAlert
          v-if="refusal"
          data-testid="delete-refusal"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-x"
          :title="refusal.title"
          :description="refusal.description"
        />

        <div class="flex justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="subtle" data-testid="delete-cancel" @click="open = false" />
          <UButton label="Delete" color="error" icon="i-lucide-trash-2" data-testid="delete-confirm" :loading="deleting" @click="onConfirm" />
        </div>
      </div>
    </template>
  </UModal>
</template>
