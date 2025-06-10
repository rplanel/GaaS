<script setup lang="ts">
import type { GalaxyBooleanToolParameter } from 'blendtype'

export interface GalaxyBooleanToolParameterProps
  extends GalaxyBooleanToolParameter {
  modelValue: string
  variant: 'form' | 'display'
}
const props = withDefaults(defineProps<GalaxyBooleanToolParameterProps>(), {
  label: 'File input',
  optional: false,
})

const emit = defineEmits(['update:modelValue'])
const truevalue = toRef(() => props.truevalue)
const falsevalue = toRef(() => props.falsevalue)

const proxyValue = computed({
  // eslint-disable-next-line vue/return-in-computed-property
  get() {
    const truevalueVal = toValue(truevalue)
    const falsevalueVal = toValue(falsevalue)
    if (truevalueVal && props.modelValue === toValue(truevalue)) {
      return true
    }
    if (falsevalueVal && props.modelValue === toValue(falsevalue)) {
      return false
    }
  },
  set(val) {
    let emitValue

    if (val === true) {
      emitValue = 'true'
    }
    if (val === false) {
      emitValue = 'false'
    }

    emit('update:modelValue', emitValue)
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
