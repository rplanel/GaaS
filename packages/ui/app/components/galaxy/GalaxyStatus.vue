<script setup lang="ts">
import type { GalaxyState } from 'blendtype'

interface Props {
  state?: GalaxyState | undefined
  size?: number | string
}
const props = withDefaults(defineProps<Props>(), {
  state: undefined,
  size: '18',
})

const excludeStates = ['setting_metadata', 'failed_metadata'] as const

type ExcludeState = (typeof excludeStates)[number]

const state = toRef(() => props.state)
const size = toRef(() => props.size)

const galaxyStateToIcon: Record<
  Exclude<GalaxyState, ExcludeState>,
  { icon: string, color: string }
> = {
  running: { icon: 'i-svg-spinners:bars-scale', color: 'text-primary' },
  error: { icon: 'i-mdi:alert-circle', color: 'text-error' },
  ok: { icon: 'i-mdi:check-circle', color: 'text-success' },
  new: { icon: 'i-mdi:new-box', color: 'text-secondary' },
  queued: { icon: 'i-mdi:tray-full', color: 'text-primary' },
  cancelled: { icon: 'i-mdi:cancel', color: 'text-warning' },
  cancelling: { icon: 'i-mdi:cancel', color: 'text-warning' },
  deferred: { icon: '', color: '' },
  deleted: { icon: '', color: '' },
  deleting: { icon: '', color: '' },
  discarded: { icon: '', color: '' },
  empty: { icon: '', color: '' },
  failed: { icon: 'i-mdi:alert-circle', color: 'text-error' },
  paused: { icon: 'i-mdi:pause', color: 'text-primary' },
  ready: { icon: '', color: '' },
  resubmitted: { icon: '', color: '' },
  scheduled: {
    icon: 'material-symbols:schedule-send-outline',
    color: 'text-success',
  },
  skipped: { icon: '', color: '' },
  stop: { icon: '', color: '' },
  stopped: { icon: '', color: '' },
  upload: { icon: '', color: '' },
  waiting: { icon: '', color: '' },
}

const currentState = computed(() => {
  const galaxyStateToIconVal = toValue(galaxyStateToIcon)
  const stateVal = toValue(state)
  if (
    stateVal
    && excludeStates.find(exState => exState === stateVal) === undefined
  ) {
    const s = stateVal as Exclude<GalaxyState, ExcludeState>
    return galaxyStateToIconVal[s]
  }
  return undefined
})
</script>

<template>
  <div v-if="state">
    <span
      v-if="currentState"
      :class="currentState.color"
    >
      <UIcon
        :name="currentState.icon"
        :size
        variant="ghost"
      />
    </span>
    <span v-else>{{ state }}</span>
  </div>
</template>
