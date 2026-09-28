<script setup lang="ts">
import type { GalaxyBooleanToolParameter, WorkflowParameterValue } from 'blendtype'
import { booleanToolParameterValue } from 'blendtype'

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
 * The switch position, read the way Galaxy reads a saved boolean.
 *
 * This used to compare `modelValue` against `truevalue` and `falsevalue`,
 * and those are not the saved spelling at all. Galaxy writes them in exactly
 * one place — `BooleanToolParameter.to_param_dict_string`, which picks one
 * or the other on the way to a **command line** (`basic.py:582` at 22.05,
 * `:678` at 26.1) — while the state holds `to_json`, which is
 * `json.dumps(self.to_python(value, app))` at 22.05 (`:575`) and
 * `self.to_python(value, app)` at 26.1 (`:672`). So the comparison only ever
 * matched the tools that happen to declare `truevalue="true"`, and matched
 * nothing once 26.1 began sending a real boolean: `integron_finder`'s `gbk`
 * saves `true` and declares `truevalue: "--gbk"`, so the getter fell off the
 * end as `undefined` and the switch showed off for a value the workflow
 * saved as on.
 *
 * `booleanToolParameterValue` is that reading, published by #110 against
 * `to_python` on both releases, and this is its first caller. The same
 * function serves the saved state and the tool's declared default because
 * Galaxy reads both through `to_python`: `ToolParameter.value_from_basic`
 * delegates to it for anything that is not a runtime marker (`basic.py:243`
 * at 22.05, `:306` at 26.1).
 *
 * What `switchPosition` below adds to that reading is the two ends it does
 * not cover: the shapes `to_python` is never handed, and the `null` a switch
 * has no position for.
 */
function switchPosition(saved: WorkflowParameterValue, optional: boolean): boolean {
  /**
   * Nothing `to_python` is ever asked to read. A boolean the workflow editor
   * marked "set at runtime" saves `{__class__: "RuntimeValue"}` and Galaxy
   * short-circuits it before `to_python` sees it (`basic.py:230` at 22.05,
   * `:295` at 26.1); a list or a nested object belongs to a group rather
   * than to a boolean at all. A switch has no position for any of them, so
   * they read as off — as they did before this change.
   */
  if (typeof saved === 'object' && saved !== null) {
    return false
  }
  /**
   * A number is not a shape Galaxy's own `to_json` writes for a boolean, but
   * `string_as_bool` would still read one: it compares `str(string).lower()`,
   * so a saved `1` is on. Stringified rather than refused, because refusing
   * it would be this widget disagreeing with `to_python` about a value the
   * saved-value type admits.
   */
  const read = booleanToolParameterValue({
    value: typeof saved === 'number' ? String(saved) : saved,
    optional,
  })
  /**
   * And `null`: an optional boolean is tri-state in Galaxy and a switch is
   * binary, so "unset" shows as off, indistinguishable from `false`.
   */
  return read ?? false
}

const proxyValue = computed({
  get(): boolean {
    return switchPosition(props.modelValue, props.optional)
  },
  /**
   * Unchanged: what the form submits is still `'true'` or `'false'`, which
   * is the 22.05 state spelling and is what Galaxy reads on the way back in.
   * `BooleanToolParameter.from_json` is `to_python` is `string_as_bool`
   * (`basic.py:565` at 22.05, `:662` at 26.1), which accepts it on both
   * releases — whereas emitting `truevalue` would be read as `false` for
   * every tool whose `truevalue` is not one of `true`/`yes`/`on`/`1`, `gbk`
   * among them.
   */
  set(val: boolean) {
    emit('update:modelValue', val ? 'true' : 'false')
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
