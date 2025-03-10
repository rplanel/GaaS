<script setup lang="ts">
import type { BadgeProps } from '@nuxt/ui'

interface Props {
  version: string | undefined
}

const props = withDefaults(defineProps<Props>(), {})
const { version } = toRefs(props)
const badgeProps = computed<BadgeProps>(() => {
  return {
    icon: toValue(version) ? 'tabler:versions' : 'i-mdi:null',
    variant: 'soft',
  }
})
</script>

<template>
  <div>
    <UBadge v-bind="badgeProps" color="neutral">
      v{{ version }}
    </UBadge>
  </div>
</template>
