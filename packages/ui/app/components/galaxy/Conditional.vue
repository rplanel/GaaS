<script setup lang="ts">
import type { GalaxyConditionalParameter, WorkflowConditionalParametersValue, WorkflowParameterValue } from 'blendtype'
import { conditionalCaseInputs, parameterGroupWithChild } from '#imports'
import { useGalaxyToolInputComponent } from '../../composables/galaxy/useGalaxyToolInputComponent'

export interface GalaxyConditionalParameterProps
  extends GalaxyConditionalParameter {
  /**
   * The bag the revision saved under the conditional's name: the test
   * parameter, `__current_case__`, and whatever the case holds, which is not
   * only strings (a boolean, a repeat, a `ConnectedValue` marker, another
   * conditional).
   */
  modelValue: WorkflowConditionalParametersValue
  variant?: 'form' | 'display'
}

const props = withDefaults(defineProps<GalaxyConditionalParameterProps>(), {
  variant: 'form',
})

const emit = defineEmits<{ 'update:modelValue': [value: WorkflowConditionalParametersValue] }>()
const variant = toRef(() => props.variant)
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

/**
 * What heads the conditional: the test parameter's label, or its name when
 * the tool gave it none, which Galaxy sends as `''`. Galaxy's form reads it
 * so from 26.1 on (`FormInputs.vue`); 22.05 shows the label alone (#182).
 */
const heading = computed(() => props.test_param.label || props.test_param.name)

/**
 * An edit inside the case, written back as a new bag rather than into the one
 * this widget was handed: `nuxt-galaxy`'s rule, the one the section writes
 * with, so the level above hears of it (#182).
 */
function setChild(name: string, value: WorkflowParameterValue) {
  emit('update:modelValue', parameterGroupWithChild(props.modelValue, name, value))
}

const selectedInputs = computed(() => conditionalCaseInputs(props, conditionalModel.value))
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
    <!--
      No item label: the header is the default slot, which replaces it with
      the test parameter's read-only widget, printing `heading` and the
      chosen option.
    -->
    <UAccordion
      :items="[{}]" :ui="{
        body: 'text-sm px-1 pt-1 pb-0',
        trigger: 'py-0',
      }"
    >
      <template #default>
        <component
          :is="inputTestParamComponents?.[props?.test_param.name]?.component"
          v-model="conditionalModel[props.test_param.name]"
          v-bind="props.test_param"
          :label="heading"
          :hint :disabled="true"
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
              :is="inputConditionalComponents?.[input?.name]?.component"
              :model-value="props.modelValue[input.name]"
              :variant v-bind="input"
              @update:model-value="setChild(input.name, $event)"
            />
          </div>
        </div>
      </template>
    </UAccordion>
  </div>
</template>
