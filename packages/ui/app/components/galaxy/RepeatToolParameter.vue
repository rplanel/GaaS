<script setup lang="ts">
import type { GalaxyRepeatToolParameter, WorkflowParameterValue } from 'blendtype'
import { repeatInstances, repeatWithChild } from '#imports'
import { useGalaxyToolInputComponent } from '../../composables/galaxy/useGalaxyToolInputComponent'

export interface GalaxyRepeatToolParameterProps
  extends GalaxyRepeatToolParameter {
  /**
   * The instances the revision saved — a list, and the reason a repeat is not
   * just a section that happens to repeat.
   *
   * The tool declares one blueprint and the state holds however many blocks
   * the author added, so the arity is read from here and never from `inputs`.
   * Typed as the whole saved-value union for the reason the section's is
   * (#111): `<component :is>` does not typecheck what it passes, so a
   * narrower declaration would be a promise nothing keeps.
   */
  modelValue: WorkflowParameterValue
  variant?: 'form' | 'display'
}

const props = withDefaults(defineProps<GalaxyRepeatToolParameterProps>(), {
  variant: 'form',
})

const emit = defineEmits<{ 'update:modelValue': [value: WorkflowParameterValue[]] }>()

/**
 * One block per saved instance, and the write of one parameter of one block
 * back into the list: `nuxt-galaxy`'s rules, which say why an entry with no
 * `__index__` is skipped here and carried through an edit (#166).
 */
const blocks = computed(() => repeatInstances(props.modelValue))

const { inputComponentsObject } = useGalaxyToolInputComponent(toRef(() => props.inputs))

function setChild(position: number, name: string, value: WorkflowParameterValue) {
  emit('update:modelValue', repeatWithChild(props.modelValue, position, name, value))
}

const { hint } = useGalaxyHint(props.help)
</script>

<template>
  <div class="w-full" :data-testid="`repeat-${name}`">
    <div class="flex flex-row items-center gap-2 mx-2">
      <UIcon
        size="22"
        name="i-lucide:list"
        class="text-[var(--ui-color-info-300)]"
      />
      <USeparator orientation="vertical" />
      <div class="font-medium text-wrap">
        {{ title }}
      </div>
      <UBadge color="neutral" variant="subtle" size="sm">
        {{ blocks.length }}
      </UBadge>
    </div>
    <p v-if="hint" class="text-sm opacity-60 mx-2 mt-1 text-wrap">
      {{ hint }}
    </p>
    <!--
      No control for adding or removing a block, and that is settled rather
      than deferred (#101). `compute_runtime_state` applies invocation
      parameters by walking the instances the **saved state** already holds,
      so a name addressing a block that is not there matches nothing, and
      there is no spelling at all for taking one away. Arity is a
      workflow-editor operation, and offering a + here would offer something
      Galaxy would ignore.
    -->
    <div
      v-for="{ position, instance } in blocks"
      :key="instance.__index__"
      class="ms-4 ps-2 border-s border-[var(--ui-border)] mt-2"
      :data-testid="`repeat-${name}-${position}`"
      :data-index="instance.__index__"
    >
      <!--
        Numbered from the position, one-based, which is Galaxy's own label for
        a block: `"%s %d > " % (input.title, i + 1)` in `visit_input_values`.
        The `:key` above is the instance's `__index__` instead — that is its
        identity across a re-render, where the position is only where it
        currently sits.
      -->
      <div class="text-sm font-medium opacity-70 px-2 pt-2">
        {{ title }} {{ position + 1 }}
      </div>
      <template
        v-for="input in inputs"
        :key="input.name"
      >
        <div
          v-if="input.name in instance"
          class="border-b border-[var(--ui-border)] last:border-none px-2 py-3 w-full"
        >
          <component
            :is="inputComponentsObject?.[input.name]?.component"
            :model-value="instance[input.name]"
            :variant
            v-bind="input"
            @update:model-value="setChild(position, input.name, $event)"
          />
        </div>
      </template>
    </div>
  </div>
</template>
