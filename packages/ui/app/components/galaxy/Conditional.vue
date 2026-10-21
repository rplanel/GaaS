<script setup lang="ts">
import type { GalaxyConditionalParameter, WorkflowConditionalParametersValue, WorkflowParameterValue } from 'blendtype'
import { conditionalCaseInputs, parameterGroupValue, parameterGroupWithChild } from '#imports'
import { useGalaxyToolInputComponent } from '../../composables/galaxy/useGalaxyToolInputComponent'

export interface GalaxyConditionalParameterProps
  extends GalaxyConditionalParameter {
  /**
   * The bag the revision saved under the conditional's name: the test
   * parameter, `__current_case__`, and whatever the case holds, which is not
   * only strings (a boolean, a repeat, a `ConnectedValue` marker, another
   * conditional).
   *
   * `WorkflowParameterValue` rather than the bag itself, for the reason the
   * section's is (#111): `<component :is>` does not typecheck what it
   * passes, so a narrower declaration would be a promise nothing keeps.
   */
  modelValue: WorkflowParameterValue
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

/**
 * The bag the conditional saved, read as empty when the saved value is not
 * one: `nuxt-galaxy`'s rule (#166).
 */
const saved = computed(() => parameterGroupValue(props.modelValue))

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

const selectedInputs = computed(() => conditionalCaseInputs(props, props.modelValue))
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
        <!--
          Read, never written back: the case is not switched (#94), and a
          test parameter written alone would leave `__current_case__` and
          the case's parameters on the old case.
        -->
        <component
          :is="inputTestParamComponents?.[props?.test_param.name]?.component"
          :model-value="saved[props.test_param.name]"
          v-bind="props.test_param"
          :label="heading"
          :hint :disabled="true"
          variant="display"
        />
      </template>
      <template #body>
        <div v-if="selectedInputs && inputConditionalComponents" class="mx-5 grid grid-flow-row gap-3">
          <template v-for="input in selectedInputs" :key="input.name">
            <!--
              The intersection the section, the repeat and `Step.vue` take: a
              parameter the case declares but the revision saved nothing for
              has no value to edit, and a widget bound to `undefined` would
              submit a value nobody chose (#185).
            -->
            <div
              v-if="input.name in saved"
              class="border-b border-[var(--ui-border)] last:border-none px-4 py-5 mx-5 w-full"
            >
              <component
                :is="inputConditionalComponents?.[input?.name]?.component"
                :model-value="saved[input.name]"
                :variant v-bind="input"
                @update:model-value="setChild(input.name, $event)"
              />
            </div>
          </template>
        </div>
      </template>
    </UAccordion>
  </div>
</template>
