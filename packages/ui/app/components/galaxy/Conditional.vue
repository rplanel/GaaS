<script setup lang="ts">
import type { GalaxyConditionalParameter } from 'blendtype'
import { useGalaxyToolInputComponent } from '../../composables/galaxy/useGalaxyToolInputComponent'

export interface GalaxyConditionalParameterProps
  extends GalaxyConditionalParameter {
  modelValue: { __current_case__: number } & Record<string, string>
  variant?: 'form' | 'display'
}

const props = withDefaults(defineProps<GalaxyConditionalParameterProps>(), {
  variant: 'form',
})

const emit = defineEmits(['update:modelValue'])
const { variant } = toRefs(props)
const { hint } = useGalaxyHint(
  props.test_param.help,
  props.test_param.argument,
)

const conditionalModel = computed({
  get() {
    return props.modelValue
  },
  set(val) {
    emit('update:modelValue', val)
  },
})

const selectedInputs = computed(() => {
  const selectedCase = props.cases[conditionalModel.value.__current_case__]
  return selectedCase?.inputs
})
const { inputComponentsObject: inputTestParamComponents }
  = useGalaxyToolInputComponent([props.test_param])

const inputConditionalComponents = computed(() => {
  const { inputComponentsObject } = useGalaxyToolInputComponent(
    toValue(selectedInputs),
  )
  return toValue(inputComponentsObject)
})
</script>

<template>
  <div>
    <UAccordion
      :items="[{ label: 'props.test_param.name' }]" :ui="{
        body: 'text-sm px-1 pt-1 pb-0',
        trigger: 'py-0',
      }"
    >
      <template #default>
        <component
          :is="inputTestParamComponents?.[props?.test_param.name]?.component"
          v-model="conditionalModel[props.test_param.name]" v-bind="props.test_param" :hint :disabled="true"
          variant="display"
        />
      </template>
      <template #body>
        <div v-if="selectedInputs && inputConditionalComponents" class="mx-5 grid grid-flow-row gap-3">
          <div
            v-for="input in selectedInputs" :key="input.name"
            class="border-b border-[var(--ui-border)] last:border-none px-4 py-5 mx-5 w-full"
          >
            <component
              :is="inputConditionalComponents?.[input?.name]?.component" v-model="conditionalModel[input.name]"
              :variant v-bind="input"
            />
          </div>
        </div>
      </template>
    </UAccordion>
  </div>
</template>
