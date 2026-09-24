<script setup lang="ts">
import type { BadgeProps } from '@nuxt/ui'
import type { PinnedTool, WorkflowRow } from 'nuxt-galaxy'
import { galaxyRevisionNumber } from 'blendtype'
import { log } from 'evlog/client'

/**
 * The state of a version (ADR 0004, #76): whether it can still run, read
 * live from Galaxy once per version the admin page lists and cached for the
 * page's life. Runnable; tools missing, naming the tools Galaxy does not hold
 * at their pinned version; missing in Galaxy, when the stored workflow no
 * longer exists there; revision mismatch, when the revision Galaxy holds at
 * that index is not the one the version pinned. A reading, never stored, and
 * nothing is retired from it: the administrator reads the badge and decides,
 * retiring being the remedy. The details sit in a popover on the badge, and
 * the button beside it reads the state again, whatever the cache's age.
 */
const props = defineProps<{
  /** The version whose state is read, as the admin page lists it. */
  version: WorkflowRow
}>()

const { data: state, error, asyncStatus, refetch } = useQuery(() => versionStateQuery({ id: props.version.id }))
const { errorMessage } = useErrorMessage(error)

// a reading that failed is worth a log, at `warn`: the administrator can
// read it again, and Galaxy being down is the usual cause
watch(error, (failure) => {
  if (failure) {
    log.warn({
      action: 'workflow:state_failed',
      tag: 'admin/VersionStateBadge',
      versionId: props.version.id,
      status: toValue(useErrorStatus(failure).errorStatus),
      error: String(failure),
    })
  }
})

/** What the badge says, in the glossary's words, and what its details hold. */
interface Reading {
  label: string
  color: BadgeProps['color']
  icon: string
  /** One or two sentences under the badge's label, when there is something to add. */
  notes?: string[]
  /** The tools Galaxy does not hold at their pinned version. */
  tools?: PinnedTool[]
  /** The revision uuid the version pinned against the one Galaxy holds at that index. */
  uuids?: { pinned: string, galaxy: string | undefined }
}

const reading = computed<Reading>(() => {
  if (error.value) {
    return {
      label: 'not checked',
      color: 'neutral',
      icon: 'i-lucide-circle-help',
      notes: ['The state could not be read from Galaxy; nothing is known about this version until it is.', errorMessage.value],
    }
  }
  const current = state.value
  if (current === undefined) {
    return { label: 'checking', color: 'neutral', icon: 'i-lucide-loader-circle' }
  }
  if (current.state === 'runnable') {
    return { label: 'runnable', color: 'success', icon: 'i-lucide-circle-check' }
  }
  if (current.state === 'tools-missing') {
    return {
      label: 'tools missing',
      color: 'warning',
      icon: 'i-lucide-triangle-alert',
      notes: ['Galaxy does not hold these tools at their pinned version, so it would refuse to run this version. Install them, or retire the version.'],
      tools: current.missingTools,
    }
  }
  if (current.state === 'missing-in-galaxy') {
    return {
      label: 'missing in Galaxy',
      color: 'error',
      icon: 'i-lucide-circle-x',
      notes: ['Galaxy no longer has this stored workflow, so no analysis can run. Retiring the version keeps its analyses, their results views and its usage statistics.'],
    }
  }
  return {
    label: 'revision mismatch',
    color: 'error',
    icon: 'i-lucide-git-compare',
    notes: [
      current.galaxyRevisionUuid === undefined
        // Galaxy's number, index + 1, the one the editor shows
        ? `Galaxy holds no revision ${galaxyRevisionNumber(props.version.revision)} any more: the history was rewritten or shortened.`
        : `Revision ${galaxyRevisionNumber(props.version.revision)} in Galaxy is not the one this version pinned any more: the history was rewritten.`,
      'Retiring the version is the remedy; nothing is retired automatically.',
    ],
    uuids: { pinned: props.version.revision_uuid, galaxy: current.galaxyRevisionUuid },
  }
})

/** Whether the badge has details worth a popover. */
const hasDetails = computed(() => reading.value.notes !== undefined)
</script>

<template>
  <span class="inline-flex items-center gap-1">
    <UPopover v-if="hasDetails">
      <UBadge
        as="button"
        type="button"
        data-testid="version-state"
        :color="reading.color"
        :icon="reading.icon"
        :label="reading.label"
        variant="subtle"
        :aria-label="`State of version ${version.version_key}: ${reading.label}, details`"
      />
      <template #content>
        <div data-testid="version-state-details" class="max-w-sm space-y-2 p-3 text-sm">
          <p v-for="note in reading.notes" :key="note">
            {{ note }}
          </p>
          <ul v-if="reading.tools" class="list-disc pl-4">
            <li v-for="tool in reading.tools" :key="`${tool.toolId} ${tool.toolVersion}`">
              <code>{{ tool.toolId }}</code> {{ tool.toolVersion }}
            </li>
          </ul>
          <dl v-if="reading.uuids" class="grid grid-cols-[auto_1fr] gap-x-2">
            <dt class="text-muted">
              Pinned
            </dt>
            <dd><code>{{ reading.uuids.pinned }}</code></dd>
            <dt class="text-muted">
              Galaxy holds
            </dt>
            <dd>
              <code v-if="reading.uuids.galaxy">{{ reading.uuids.galaxy }}</code>
              <span v-else>no revision with that number</span>
            </dd>
          </dl>
        </div>
      </template>
    </UPopover>
    <UBadge
      v-else
      data-testid="version-state"
      :color="reading.color"
      :icon="reading.icon"
      :label="reading.label"
      variant="subtle"
    />
    <UButton
      data-testid="version-state-refresh"
      :aria-label="`Read the state of version ${version.version_key} again`"
      icon="i-lucide-refresh-cw"
      size="xs"
      color="neutral"
      variant="ghost"
      :loading="asyncStatus === 'loading'"
      @click="refetch()"
    />
  </span>
</template>
