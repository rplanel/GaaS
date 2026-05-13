<script setup lang="ts">
const { data: health, isLoading } = useQuery(galaxyHealthQuery)

const isUp = computed(() => {
  if (isLoading.value)
    return true
  return health.value?.status === 'up'
})

const blockMessage = computed(() => {
  if (health.value?.status === 'maintenance' && health.value.maintenance) {
    const { message, startAt, endAt } = health.value.maintenance
    const start = new Date(startAt).toLocaleDateString()
    const end = new Date(endAt).toLocaleDateString()
    return {
      title: 'Scheduled Galaxy Maintenance',
      description: `${message} (from ${start} to ${end})`,
      icon: 'i-lucide:clock',
      color: 'warning' as const,
    }
  }
  return {
    title: 'Galaxy Unavailable',
    description: 'Galaxy is currently unavailable. You cannot start new analyses at this time.',
    icon: 'i-lucide:alert-octagon',
    color: 'error' as const,
  }
})
</script>

<template>
  <div v-if="isUp">
    <slot />
  </div>
  <div v-else-if="!isLoading" class="p-4 mx-auto max-w-(--ui-prose) flex flex-col items-center justify-center">
    <UAlert
      :title="blockMessage.title"
      :description="blockMessage.description"
      :icon="blockMessage.icon"
      :color="blockMessage.color"
      variant="subtle"
      class="w-full"
    />
  </div>
  <div v-else class="p-4 mx-auto max-w-(--ui-prose) flex items-center justify-center">
    <USkeleton class="h-32 w-full" />
  </div>
</template>
