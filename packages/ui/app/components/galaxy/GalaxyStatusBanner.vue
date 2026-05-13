<script setup lang="ts">
const { data: health, isLoading } = useQuery(galaxyHealthQuery)

const isVisible = computed(() => {
  if (isLoading.value)
    return false
  return health.value?.status !== 'up'
})

const bannerProps = computed<{ color: 'warning' | 'error', icon: string, title: string }>(() => {
  if (health.value?.status === 'maintenance') {
    return {
      color: 'warning',
      icon: 'i-lucide:clock',
      title: 'Scheduled Galaxy Maintenance',
    }
  }
  return {
    color: 'error',
    icon: 'i-lucide:alert-octagon',
    title: 'Galaxy Unavailable',
  }
})

const bannerMessage = computed(() => {
  if (health.value?.status === 'maintenance' && health.value.maintenance) {
    const { message, startAt, endAt } = health.value.maintenance
    const start = new Date(startAt).toLocaleDateString()
    const end = new Date(endAt).toLocaleDateString()
    return `${message} (from ${start} to ${end})`
  }
  return 'Galaxy is currently unavailable. You cannot start new analyses at this time.'
})
</script>

<template>
  <UBanner v-if="isVisible" id="galaxy-health-status" :color="bannerProps.color" :icon="bannerProps.icon">
    <template #title>
      <div class="flex flex-col gap-1">
        <span class="font-semibold">
          {{ bannerProps.title }}
        </span>
        <span class="opacity-90">
          {{ bannerMessage }}
        </span>
      </div>
    </template>
  </UBanner>
</template>
