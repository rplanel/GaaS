<script setup lang="ts">
import type { GalaxyBooleanToolParameter, WorkflowParameterValue } from 'blendtype'
import { booleanParameterSpelling, isBooleanParameterTrue } from '#imports'

export interface GalaxyBooleanToolParameterProps
  extends GalaxyBooleanToolParameter {
  /**
   * What the revision saved for this parameter, which is one value of
   * `DescribedStep.tool_inputs` — so `WorkflowParameterValue` and not a
   * string (#111).
   *
   * Declared `string` until this ticket, and it really received a `boolean`:
   * `Step.vue` renders every widget through `<component :is>`, whose props
   * Vue does not typecheck, so #102 widening the saved-value type produced
   * no error here and the prop went on saying something false. It still goes
   * unchecked at the call site — see the note on `Step.vue` — but it no
   * longer lies about what arrives.
   */
  modelValue: WorkflowParameterValue
  variant: 'form' | 'display'
}
const props = withDefaults(defineProps<GalaxyBooleanToolParameterProps>(), {
  label: 'File input',
  optional: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

/**
 * The switch position, read the way Galaxy reads a saved boolean, and the
 * spelling a flip writes back: `nuxt-galaxy`'s rules, which say why not
 * `truevalue` and `falsevalue` either way (#111, #166). An optional boolean
 * saved as `null` shows as off, indistinguishable from `false`.
 */
const proxyValue = computed({
  get(): boolean {
    return isBooleanParameterTrue(props, props.modelValue)
  },
  set(val: boolean) {
    emit('update:modelValue', booleanParameterSpelling(val))
  },
})
const { hint } = useGalaxyHint(props.help, props.argument)
</script>

<template>
  <div class="flex flex-row w-full">
    <div class="text-[var(--ui-color-info-300)] self-center mx-2">
      <UIcon
        size="22"
        name="i-stash:data-boolean"
        class="flex"
      />
    </div>
    <div class="mx-2">
      <USeparator orientation="vertical" />
    </div>
    <div
      v-if="variant === 'form'"
      class="mx-2 w-full"
    >
      <UFormField
        :label
        :help="hint"
        :ui="{ help: 'text-wrap' }"
      >
        <USwitch v-model="proxyValue" />
      </UFormField>
    </div>
    <div
      v-if="variant === 'display'"
      class="flex flex-row align-middle gap-2 mx-2 w-full"
    >
      <div class="font-medium self-center text-wrap">
        {{ label }}
      </div>
      <div class="mx-2">
        <USeparator orientation="vertical" />
      </div>
      <div class="self-center">
        <USwitch
          v-model="proxyValue"
          disabled
        />
      </div>
    </div>
  </div>
</template>
