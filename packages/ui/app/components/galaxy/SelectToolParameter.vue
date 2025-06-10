<script setup lang="ts">
import type {
  GalaxyMultipleSelectToolParameter,
  GalaxySingleSelectToolParameter,
} from 'blendtype'
import { computed } from '#imports'

export interface GalaxyMultipleSelectToolParameterProps
  extends GalaxyMultipleSelectToolParameter {
  modelValue: string[]
  disabled?: boolean
  variant?: 'form' | 'display'
  isConditionalSelect: boolean
}

export interface GalaxySingleSelectToolParameterProps
  extends GalaxySingleSelectToolParameter {
  modelValue: string
  disabled?: boolean
  variant?: 'form' | 'display'
  isConditionalSelect: false
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
const options = toRef(() => props.options)
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
const sanitizedOptions = computed(() => {
  const optionsVal = toValue(options)
  if (optionsVal) {
    return optionsVal.map(([_title, value]) => {
      return value
    })
  }
  return undefined
})

const selectedOption = computed(() => {
  const optionsVal = toValue(options)
  if (optionsVal) {
    return optionsVal.find(([_title, value]) => value === toValue(model))
  }
  return undefined
})

const selectedOptionLabel = computed(() => {
  const selectedOptionVal = toValue(selectedOption)
  if (selectedOptionVal) {
    return selectedOptionVal[0]
  }
  return undefined
})
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
          :items="sanitizedOptions"
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
      <div>
        <UBadge color="primary" class="self-center">
          {{ selectedOptionLabel }}
        </UBadge>
      </div>
    </div>
  </div>
</template>
