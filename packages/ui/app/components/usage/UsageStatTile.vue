<script setup lang="ts">
interface Props {
  /** What the number means, in the words a user reads. */
  label: string
  /** The number itself, already formatted. Omitted when the default slot is used. */
  value?: string | undefined
  /** Shown on hover. Set when the value needs explaining, such as a dash. */
  tooltip?: string | undefined
  icon?: string | undefined
  /** Colours the icon, so a tile and its bar in the trend read as the same outcome. */
  iconColor?: string | undefined
  /** Makes the whole tile a link. */
  to?: string | undefined
}

const props = withDefaults(defineProps<Props>(), {
  value: undefined,
  tooltip: undefined,
  icon: undefined,
  iconColor: undefined,
  to: undefined,
})

const NuxtLink = resolveComponent('NuxtLink')

const root = computed(() => (props.to ? NuxtLink : 'div'))
</script>

<template>
  <component
    :is="root"
    :to="to"
    class="flex flex-col gap-1 rounded-lg border border-default p-4"
    :class="to ? 'transition-colors hover:border-primary hover:bg-primary/5' : ''"
  >
    <span class="flex items-center gap-1.5 text-sm text-muted">
      <UIcon v-if="icon" :name="icon" class="size-4 shrink-0" :style="iconColor ? { color: iconColor } : undefined" />
      {{ label }}
    </span>

    <slot>
      <UTooltip v-if="tooltip" :text="tooltip">
        <span class="text-2xl font-semibold tabular-nums text-dimmed">{{ value }}</span>
      </UTooltip>
      <span v-else class="text-2xl font-semibold tabular-nums">{{ value }}</span>
    </slot>
  </component>
</template>
