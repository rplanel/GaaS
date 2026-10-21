<script setup lang="ts">
import type {
  GalaxyMultipleSelectToolParameter,
  GalaxySingleSelectToolParameter,
} from 'blendtype'
import { computed, selectOptionLabels, selectOptions } from '#imports'

/**
 * The two variants are discriminated by `multiple`, which is also the only
 * one of them the body reads.
 *
 * They used to carry an `isConditionalSelect` prop as well, declared required
 * while nothing passed it and nothing read it (#83). Dropping it is not just
 * tidying: Galaxy has no conditional-select component to mirror — a
 * conditional's `test_param` renders through the same generic form element as
 * any other input, and the conditional-ness lives in the parent, which
 * re-matches the case when the value changes. The prop was inverted on top of
 * that, `true` on the *multiple* variant, where a `test_param` can only ever
 * be single-valued.
 */
export interface GalaxyMultipleSelectToolParameterProps
  extends GalaxyMultipleSelectToolParameter {
  modelValue: string[]
  disabled?: boolean
  variant?: 'form' | 'display'
}

export interface GalaxySingleSelectToolParameterProps
  extends GalaxySingleSelectToolParameter {
  modelValue: string
  disabled?: boolean
  variant?: 'form' | 'display'
}
export type GalaxySelectToolParameterProps
  = | GalaxySingleSelectToolParameterProps
    | GalaxyMultipleSelectToolParameterProps

const props = withDefaults(defineProps<GalaxySelectToolParameterProps>(), {
  label: 'Select',
  optional: false,
  disabled: false,
  variant: 'form',
})

const emit = defineEmits(['update:modelValue'])
const variant = toRef(() => props.variant)
const multiple = toRef(() => props.multiple)
const disabled = toRef(() => props.disabled)

const model = computed({
  get() {
    return props.modelValue
  },
  set(val) {
    emit('update:modelValue', val)
  },
})
const { hint: help } = useGalaxyHint(props.help, props.argument)
// What the select offers and how it names the saved value: `nuxt-galaxy`'s
// rules (#166). The menu is handed label and value pairs and keyed on the
// value, so it shows the label while the model holds what Galaxy saves (#183).
const options = computed(() => selectOptions(props))
const selectedOptionLabels = computed(() => selectOptionLabels(props, toValue(model)))
</script>

<template>
  <div class="flex flex-row w-full">
    <div class="text-[var(--ui-color-info-300)] self-center mx-2">
      <UIcon
        size="22"
        name="i-majesticons:selector-line"
      />
    </div>
    <div class="mx-2">
      <USeparator orientation="vertical" />
    </div>
    <div
      v-if="variant === 'form'"
      class="w-full mx-2"
    >
      <UFormField
        :help
        :label
      >
        <USelectMenu
          v-model="model"
          persistent-hint
          :items="options"
          value-key="value"
          :multiple
          :disabled
          class="my-3 w-full"
        />
      </UFormField>
    </div>
    <div
      v-if="variant === 'display'"
      class="mx-2 flex flex-row gap-2 w-full"
    >
      <div class="font-medium self-center text-wrap">
        {{ label }}
      </div>
      <div>
        <USeparator orientation="vertical" />
      </div>
      <div class="flex flex-row flex-wrap gap-1">
        <UBadge
          v-for="(selectedLabel, position) in selectedOptionLabels"
          :key="position"
          color="primary"
          class="self-center"
        >
          {{ selectedLabel }}
        </UBadge>
      </div>
    </div>
  </div>
</template>
