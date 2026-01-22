<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui'
import { Primitive } from 'reka-ui'

export interface BadgeGroupProps extends PrimitiveProps {
  /**
   * Maximum number of badges to display. If the number of badges exceeds this value, the remaining badges will be hidden.
   * Set to 0 or a negative value to display all badges.
   */
  max?: number
}

export interface BadgeGroupSlots {
  default: (props?: object) => any
}

const props = withDefaults(defineProps<BadgeGroupProps>(), {
  max: 2,
  as: 'div',
})

const slots = defineSlots<BadgeGroupSlots>()

const max = toRef(props, 'max')
const all = ref(false)
const children = computed(() => {
  let children = slots.default?.()
  if (children?.length) {
    children = children.flatMap((child: any) => {
      if (typeof child.type === 'symbol') {
        // `v-if="false"` or commented node
        if (typeof child.children === 'string') {
          return undefined
        }

        return child.children
      }

      return child
    }).filter(Boolean)
  }

  return children || []
})

const visibleBadges = computed(() => {
  if (!children.value.length) {
    return []
  }

  if (!max.value || max.value <= 0 || all.value) {
    return [...children.value].reverse()
  }

  return [...children.value].slice(0, max.value).reverse()
})

const hiddenCount = computed(() => {
  if (!children.value.length) {
    return 0
  }

  return children.value.length - visibleBadges.value.length
})

function displayAll() {
  all.value = true
}
</script>

<template>
  <Primitive :as class="inline-flex flex-row-reverse justify-end gap-1">
    <UBadge
      v-if="hiddenCount > 0"
      :label="`+${hiddenCount}`"
      variant="soft"
      class="relative rounded-full ring-bg first:me-0"
      @click="displayAll"
    />
    <UButton v-if="all" variant="link" size="xs" @click="all = false">
      Show Less
    </UButton>
    <component :is="badge" v-for="(badge, count) in visibleBadges" :key="count" class="relative rounded-full ring-bg first:me-0" />
  </Primitive>
</template>
