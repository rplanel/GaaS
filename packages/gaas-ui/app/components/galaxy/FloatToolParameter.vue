<script setup lang="ts">
import type { GalaxyFloatToolParameter } from 'blendtype'
import { useVModel } from '@vueuse/core'
import { countDecimals } from '../../utils'

export interface GalaxyFloatToolParameterProps
  extends GalaxyFloatToolParameter {
  modelValue: string
  variant?: 'form' | 'display'
}
const props = withDefaults(defineProps<GalaxyFloatToolParameterProps>(), {
  optional: false,
  variant: 'form',
})
const emit = defineEmits(['update:modelValue'])

const { min, max } = toRefs(props)

const proxyValue = useVModel(props, 'modelValue', emit)
const { hint } = useGalaxyHint(props.help, props.argument)

const step = computed(() => {
  const defaultValue = toValue(proxyValue)
  const numberDecimal = countDecimals(Number.parseFloat(defaultValue))
  return Number.parseFloat(`1e-${numberDecimal}`)
})
</script>

<template>
  <div class="flex flex-row w-full">
    <div class="text-[var(--ui-color-info-300)] self-center mx-2">
      <UIcon
        size="22"
        name="i-mdi:decimal"
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
        <UInput
          v-model="proxyValue"
          :step
          type="number"
          :min
          :max
          :name
        />
      </UFormField>
    </div>
    <div
      v-if="variant === 'display'"
      class="flex flex-row gap-2 mx-2 w-full"
    >
      <div class="font-medium text-wrap self-center">
        {{ label }}
      </div>
      <div class="">
        <USeparator orientation="vertical" />
      </div>
      <div class="">
        <UBadge color="primary" class="self-center">
          {{ proxyValue }}
        </UBadge>
      </div>
    </div>
  </div>
</template>
