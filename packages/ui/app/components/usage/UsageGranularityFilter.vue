<script setup lang="ts">
/**
 * Reads and writes the URL directly, like the range filter beside it, so the
 * control and the page it narrows share one source of truth.
 */
const { granularity, granularityOverride, selectGranularity } = useUsageFilters()

const isAutomatic = computed(() => granularityOverride.value === undefined)

/**
 * Automatic names the width it settled on, because a reader comparing two
 * ranges needs to see the bars change meaning under them.
 */
const automaticLabel = computed(() => {
  const chosen = USAGE_GRANULARITIES.find(option => option.value === granularity.value)
  return `Auto (${chosen?.label.toLowerCase() ?? granularity.value})`
})
</script>

<template>
  <div
    data-testid="usage-granularity-filter"
    role="group"
    aria-label="Trend granularity"
    class="flex flex-wrap items-center gap-1"
  >
    <span class="text-xs text-muted">Buckets</span>

    <UButton
      data-testid="usage-granularity-auto"
      :label="automaticLabel"
      size="sm"
      v-bind="pressedButtonProps(isAutomatic)"
      @click="selectGranularity(undefined)"
    />

    <UButton
      v-for="option in USAGE_GRANULARITIES"
      :key="option.value"
      :data-testid="`usage-granularity-${option.value}`"
      :label="option.label"
      size="sm"
      v-bind="pressedButtonProps(granularityOverride === option.value)"
      @click="selectGranularity(option.value)"
    />
  </div>
</template>
