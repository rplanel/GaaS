<script setup lang="ts">
import type { FormSubmitEvent, RadioGroupItem } from '@nuxt/ui'
import type { GalaxyWorkflowRevision, GalaxyWorkflowsItem } from 'blendtype'
import type { WorkflowRow } from 'nuxt-galaxy'
import type { PublishFailure } from '../../utils/publishFailure'
import { getWorkflowTagName, getWorkflowTagVersion } from 'blendtype'
import { log } from 'evlog/client'
import * as z from 'zod'
import { describePublishFailure } from '../../utils/publishFailure'

/**
 * The dialog an administrator publishes a version from (ADR 0004): one
 * revision of one Galaxy stored workflow, a name and a label.
 *
 * The revisions are listed as Galaxy indexes them, each with its index, save
 * time and step count; the latest is selected by default, the ones already
 * published are disabled and show their label, and any other can be chosen,
 * an older one included, since labels are not ordered (#73). The name is the
 * lineage: once the stored workflow has a version it is locked to that
 * version's name, otherwise it is pre-filled from the `name:` tag when there
 * is one, otherwise typed. The label is pre-filled from the `version:` tag,
 * otherwise typed. Galaxy's display name is never a pre-fill, since it usually
 * cannot name a directory. Every refusal the server answers is a sentence,
 * shown here next to the fields it is about; nothing closes until the server
 * has said yes.
 */
const props = withDefaults(defineProps<{
  /** The stored workflow, as Galaxy lists it. */
  workflow: GalaxyWorkflowsItem
  /** The name the stored workflow's versions carry, once it has one; the new version keeps it. */
  lineageName?: string
  /** The versions already published for this stored workflow, each pinning one revision under its label. */
  publishedVersions?: { revision: number, label: string }[]
}>(), {
  lineageName: undefined,
  publishedVersions: () => [],
})

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

// The revisions Galaxy holds for this stored workflow, asked for when the
// dialog opens: the dialog is keyed on the stored workflow, so it is one list
// per opening.
const { data: revisions, error: revisionsError } = useQuery(() =>
  galaxyWorkflowRevisionsQuery({ workflowId: props.workflow.id }),
)
const { errorMessage: revisionsErrorMessage } = useErrorMessage(revisionsError)

watch(revisionsError, (error) => {
  if (error) {
    log.warn({
      action: 'workflow:revisions_failed',
      tag: 'admin/PublishVersionModal',
      workflowId: props.workflow.id,
      error: String(error),
    })
  }
})

/** The label each published revision carries, by its index. */
const publishedLabel = computed(() => new Map(props.publishedVersions.map(version => [version.revision, version.label])))

/** The revision with the highest index among `listed`, or none when there is none. */
function newestOf(listed: GalaxyWorkflowRevision[]): number | undefined {
  if (listed.length === 0)
    return undefined
  return listed.reduce((newest, candidate) => (candidate.version > newest.version ? candidate : newest)).version
}

/**
 * The latest revision Galaxy lists. Read off the entries' `version`, the
 * 0-based index Galaxy indexes a revision by, never off their position.
 */
const latestRevision = computed(() => newestOf(revisions.value ?? []))

/**
 * The revision selected when the list arrives: the latest (ADR 0004) unless
 * it already carries a label, in which case the newest one that does not. A
 * published revision is disabled in the picker, so selecting it by default
 * would leave the administrator with nothing to do but read a 409.
 */
const defaultRevision = computed(() => newestOf((revisions.value ?? []).filter(revision => !publishedLabel.value.has(revision.version))))

/** The revision the version will pin, once the list is there and until another is chosen. */
const chosenRevision = ref<number | undefined>()
watch(defaultRevision, (fallback) => {
  if (chosenRevision.value === undefined)
    chosenRevision.value = fallback
}, { immediate: true })

/** When a revision was saved, in the words the admin page uses for a stored workflow's create time. */
function savedAt(updateTime: string) {
  return new Date(updateTime).toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const revisionItems = computed<RadioGroupItem[]>(() => (revisions.value ?? []).map((revision) => {
  const label = publishedLabel.value.get(revision.version)
  const facts = [
    savedAt(revision.update_time),
    `${revision.steps} step${revision.steps === 1 ? '' : 's'}`,
    ...(label === undefined ? [] : [`published as ${label}`]),
  ]
  return {
    value: revision.version,
    label: revision.version === latestRevision.value ? `Revision ${revision.version}, the latest` : `Revision ${revision.version}`,
    description: facts.join(' · '),
    disabled: label !== undefined,
  }
}))

/** What the administrator reads under the picker: which revision the version will pin. */
const revisionSummary = computed(() => {
  if (revisionsError.value)
    return 'The revisions could not be listed, so nothing can be published from here.'
  const listed = revisions.value
  if (listed === undefined)
    return 'Listing the revisions saved in Galaxy; the latest is selected unless you choose another.'
  if (listed.length === 0)
    return 'Galaxy lists no revision for this workflow.'
  const chosen = chosenRevision.value
  if (chosen === undefined)
    return 'Every revision is published already.'
  if (chosen === latestRevision.value)
    return `Revision ${chosen}, the latest saved in Galaxy.`
  return `Revision ${chosen}, older than the latest (${latestRevision.value}).`
})

/**
 * Whether there is something to publish. While the list is on its way the
 * latest can be published, as this dialog always did; once it is there a
 * revision has to be chosen; and when it could not be listed nothing can be
 * reviewed, so nothing is published.
 */
const canPublish = computed(() => {
  if (revisionsError.value)
    return false
  if (revisions.value === undefined)
    return true
  return chosenRevision.value !== undefined
})

const refusal = ref<PublishFailure | undefined>()
const publishing = ref(false)

async function onSubmit(event: FormSubmitEvent<Schema>) {
  refusal.value = undefined
  publishing.value = true
  try {
    // the revision on screen is the one the body names, the latest included:
    // a save in Galaxy between listing and publishing would otherwise move
    // "latest" under the administrator, and the row would pin a revision
    // nobody chose. Only a publish before the list arrived names none, and
    // then the server publishes the latest, as this dialog always did
    const chosen = chosenRevision.value
    const version = await $fetch<WorkflowRow>('/api/db/workflows', {
      method: 'POST',
      body: {
        galaxyId: props.workflow.id,
        name: event.data.name,
        label: event.data.label,
        ...(chosen === undefined ? {} : { revision: chosen }),
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
    :description="`Give one revision of ${workflow.name} a name and a label.`"
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

        <UFormField
          label="Revision"
          description="The save of the workflow in Galaxy this version pins. A revision already published carries its label and cannot take a second."
        >
          <UAlert
            v-if="revisionsError"
            data-testid="publish-revisions-error"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-x"
            title="The revisions could not be listed"
            :description="revisionsErrorMessage"
          />
          <URadioGroup
            v-else-if="revisions !== undefined"
            v-model="chosenRevision"
            data-testid="publish-revisions"
            :items="revisionItems"
            variant="table"
            size="sm"
          />
          <p data-testid="publish-revision" class="text-sm text-muted mt-2">
            {{ revisionSummary }}
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
          <UButton type="submit" label="Publish" data-testid="publish-submit" :loading="publishing" :disabled="!canPublish" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
