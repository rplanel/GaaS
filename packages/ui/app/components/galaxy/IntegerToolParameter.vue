<script setup lang="ts">
import type { GalaxyIntegerToolParameter } from 'blendtype'
import { useVModel } from '@vueuse/core'

export interface GalaxyIntegerToolParameterProps
  extends GalaxyIntegerToolParameter {
  modelValue: number
  variant: 'form' | 'display'
}
const props = withDefaults(defineProps<GalaxyIntegerToolParameterProps>(), {
  optional: false,
})
const emit = defineEmits(['update:modelValue'])
const { min, max, label, variant } = props
const proxyValue = useVModel(props, 'modelValue', emit)
const { hint } = useGalaxyHint(props.help, props.argument)

const sanitizedMin = computed(() => {
  if (min === null)
    return undefined
  return min
})
const sanitizedMax = computed(() => {
  if (max === null)
    return undefined
  return max
})
const numberInputProps = computed(() => {
  return {
    label: toValue(label),
    min: toValue(sanitizedMin),
    max: toValue(sanitizedMax),
    disabled: false,
  }
})
</script>

<template>
  <div class="flex flex-row w-full">
    <div class="text-[var(--ui-color-info-300)] self-center mx-2">
      <UIcon
        size="22"
        name="i-carbon:character-integer"
      />
    </div>
    <div class="mx-2">
      <USeparator orientation="vertical" />
    </div>
    <div
      v-if="variant === 'form'"
      class="self-center mx-2"
    >
      <UFormField
        :label
        :help="hint"
      >
        <div v-if="min && max">
          <UInputNumber
            v-model="proxyValue"
            v-bind="numberInputProps"
            :min
            :max
            :step="1"
          />
        </div>
        <div v-else>
          <UInputNumber
            v-model="proxyValue"
            v-bind="numberInputProps"
          />
        </div>
      </UFormField>
    </div>
    <div
      v-if="variant === 'display'"
      class="flex flex-row gap-2 mx-2 w-full"
    >
      <div class="font-medium self-center text-wrap">
        {{ label }}
      </div>
      <div>
        <USeparator orientation="vertical" />
      </div>
      <div class="self-center">
        <UBadge color="primary">
          {{ proxyValue }}
        </UBadge>
      </div>
    </div>
  </div>
</template>

<style></style>
