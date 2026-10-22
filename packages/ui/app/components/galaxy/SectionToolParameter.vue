<script setup lang="ts">
import type { GalaxySectionToolParameter, WorkflowConditionalParametersValue, WorkflowParameterValue } from 'blendtype'
import { parameterGroupValue, parameterGroupWithChild, parametersSavedIn } from '#imports'
import { useGalaxyToolInputComponent } from '../../composables/galaxy/useGalaxyToolInputComponent'

export interface GalaxySectionToolParameterProps
  extends GalaxySectionToolParameter {
  /**
   * The bag the revision saved under this section's name — `settings`, and
   * then `settings.attc_settings` one level in.
   *
   * `WorkflowParameterValue` rather than the bag itself, because that is what
   * really arrives: `Step.vue` renders every widget through `<component :is>`,
   * whose props Vue does not typecheck, so a declaration narrower than the
   * saved-value type would be one nothing enforces and nothing corrects
   * (#111). What a section is *handed* is decided by the step's saved state,
   * and nothing guarantees a section's name holds an object there.
   */
  modelValue: WorkflowParameterValue
  variant?: 'form' | 'display'
}

const props = withDefaults(defineProps<GalaxySectionToolParameterProps>(), {
  variant: 'form',
})

const emit = defineEmits<{ 'update:modelValue': [value: WorkflowConditionalParametersValue] }>()

/**
 * The bag the section saved, and the write of one child back as a new bag:
 * `nuxt-galaxy`'s rules, which say why anything else reads as empty and why
 * a nested section has to hand its parent a new value (#166).
 */
const saved = computed(() => parameterGroupValue(props.modelValue))

const { inputComponentsObject } = useGalaxyToolInputComponent(toRef(() => props.inputs))

function setChild(name: string, value: WorkflowParameterValue) {
  emit('update:modelValue', parameterGroupWithChild(props.modelValue, name, value))
}

const { hint } = useGalaxyHint(props.help)
</script>

<template>
  <div class="w-full" :data-testid="`section-${name}`">
    <div class="flex flex-row items-center gap-2 mx-2">
      <UIcon
        size="22"
        name="i-lucide:folder"
        class="text-[var(--ui-color-info-300)]"
      />
      <USeparator orientation="vertical" />
      <div class="font-medium text-wrap">
        {{ title ?? name }}
      </div>
    </div>
    <!--
      Always on screen, `expanded` notwithstanding. It is a presentation hint
      and all four recorded sections declare it `false`, so honouring it would
      put every parameter #101 exists to reveal behind a click — including,
      in the read-only panel, values whose whole purpose is to be read.
    -->
    <p v-if="hint" class="text-sm opacity-60 mx-2 mt-1 text-wrap">
      {{ hint }}
    </p>
    <div class="ms-4 ps-2 border-s border-[var(--ui-border)] mt-2">
      <!--
        Only the parameters the section's bag names, as `Step.vue` and the
        repeat offer theirs: `nuxt-galaxy`'s rule (#167).
      -->
      <div
        v-for="input in parametersSavedIn(inputs, saved)"
        :key="input.name"
        class="border-b border-[var(--ui-border)] last:border-none px-2 py-3 w-full"
      >
        <component
          :is="inputComponentsObject?.[input.name]?.component"
          :model-value="saved[input.name]"
          :variant
          v-bind="input"
          @update:model-value="setChild(input.name, $event)"
        />
      </div>
    </div>
  </div>
</template>
