<script setup lang="ts">
import type { GalaxyState, InvocationState } from 'blendtype'
import { galaxyStateLook } from '../../utils/galaxyStateLook'
import { uiColorVar } from '../../utils/stateLook'

/**
 * One state, drawn: the icon the analyses list and the jobs accordion both
 * show.
 *
 * Every state is drawn as **something**. Twelve of them used to be drawn as
 * nothing — the map answered `{ icon: '', color: '' }` for `skipped`,
 * `stopped`, `waiting`, `deleted`, `deleting`, `stop`, `resubmitted`,
 * `upload`, `empty`, `deferred`, `discarded` and `ready`, and since that
 * object is truthy the branch meant to say something instead never ran, so
 * an `<UIcon name="">` reached the page. A skipped job and a job the list
 * knew nothing about looked identical (#90).
 *
 * The state is **labelled in words**, not only coloured: a reader who
 * cannot tell the colours apart, and a reader hovering the icon, both get
 * the same answer — and the answer is the glossary's word, never Galaxy's
 * identifier. `setting_metadata` used to reach the screen verbatim.
 *
 * What the colours and icons are is `galaxyStateLook`'s, not this
 * component's, because a job state has to be drawn here exactly as the
 * canvas draws it on the node beside it.
 */

const props = withDefaults(defineProps<{
  state?: GalaxyState | InvocationState | undefined
  size?: number | string
}>(), {
  state: undefined,
  size: '18',
})

const look = computed(() => (props.state === undefined ? undefined : galaxyStateLook(props.state)))
</script>

<template>
  <!--
    Nothing at all when there is no state, which is a row whose job has not
    arrived — not a state worth inventing an icon for.
  -->
  <div
    v-if="look"
    role="img"
    :aria-label="look.word"
    :title="look.word"
    :data-state="state"
    data-testid="galaxy-status"
  >
    <span :style="{ color: uiColorVar(look.color) }">
      <UIcon :name="look.icon" :size />
    </span>
  </div>
</template>
