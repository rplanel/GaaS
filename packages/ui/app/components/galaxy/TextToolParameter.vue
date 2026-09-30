<script setup lang="ts">
import type { GalaxyTextToolParameter, WorkflowParameterValue } from 'blendtype'

export interface GalaxyTextToolParameterProps
  extends GalaxyTextToolParameter {
  /**
   * What the revision saved for this parameter, which is one value of
   * `DescribedStep.tool_inputs` — so `WorkflowParameterValue`, not the string
   * it usually is (#111's rule, applied from the start here).
   *
   * Galaxy's own `to_json` writes a string or `null` for a text parameter on
   * both releases (`GalaxyTextToolParameter.value` says how). A runtime
   * marker is the rest of what really arrives: the workflow editor offers
   * every parameter that is not a dataset a "set at runtime" value of
   * `{__class__: "RuntimeValue"}`
   * (`client/src/components/Workflow/Editor/Forms/FormTool.vue:140` at 22.05,
   * `:157` at 26.1), and `<component :is>` hands it over unchecked.
   */
  modelValue: WorkflowParameterValue
  variant?: 'form' | 'display'
}

const props = withDefaults(defineProps<GalaxyTextToolParameterProps>(), {
  variant: 'form',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const text = computed({
  /**
   * Only a string is text — Galaxy's own rule at 22.05, where `Ui.Input`
   * keeps a string and makes anything else `""`
   * (`client/src/mvc/ui/ui-misc.js:89`). `null`, an optional parameter
   * nobody filled in, shows as an empty box at 26.1 as well (`FormText`'s
   * `valueToString`, `client/src/components/Form/Elements/FormText.vue:146`).
   * Anything else is state Galaxy's `to_json` did not write for a text
   * parameter, and reads as empty rather than as `[object Object]`. Either way
   * the saved value stays in the model untouched until the reader types.
   */
  get: () => typeof props.modelValue === 'string' ? props.modelValue : '',
  set: (value: string) => emit('update:modelValue', value),
})

const { hint } = useGalaxyHint(props.help, props.argument)
</script>

<template>
  <div class="flex flex-row w-full">
    <div class="text-[var(--ui-color-info-300)] self-center mx-2">
      <UIcon
        size="22"
        name="i-lucide:text-cursor-input"
      />
    </div>
    <div class="mx-2">
      <USeparator orientation="vertical" />
    </div>
    <div
      v-if="variant === 'form'"
      class="w-full mx-2"
    >
      <!--
        `Optional` beside the label when the tool says so, and nothing when it
        does not — not a required mark, which is right for 22.05 and not yet
        for 26.1. At 22.05, which production runs, `optional: false` is merely
        the attribute's default and an empty string still goes through the
        tool's validators rather than being refused: all three of
        `ccqtl-today`'s text parameters are `false`, save `""` and run that
        way, so a mark would be wrong on every one of them. At 26.1 an
        inferred `false` does mean the validators refuse `""`, and Galaxy's own
        form marks it required — the declaration reads the same at both
        releases, so this is for the 26.x upgrade to revisit.
      -->
      <UFormField
        :label
        :help="hint"
        :hint="optional ? 'Optional' : undefined"
      >
        <UTextarea
          v-if="area"
          v-model="text"
          :name
          autoresize
          class="w-full"
        />
        <!--
          No suggestions from `datalist` yet. Galaxy offers them as a
          `<datalist>` on this single-line box, but every recorded text
          parameter's list is empty, so there is nothing to drive one from.
        -->
        <UInput
          v-else
          v-model="text"
          :name
          class="w-full"
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
      <div>
        <USeparator orientation="vertical" />
      </div>
      <div class="self-center">
        <!-- `pre-wrap` so a multi-line value keeps the lines it was typed on. -->
        <UBadge
          color="primary"
          class="whitespace-pre-wrap break-words"
        >
          {{ text }}
        </UBadge>
      </div>
    </div>
  </div>
</template>
