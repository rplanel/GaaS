<script setup lang="ts">
import { USAGE_PRESETS, useUsageFilters } from '../../composables/useUsageFilters'

/**
 * Reads and writes the URL directly rather than taking props, so this control
 * and the page whose statistics it narrows share one source of truth and
 * cannot disagree about what is on screen.
 */
const { preset, isCustom, range, selectPreset, selectCustomRange } = useUsageFilters()

const isNaming = ref(false)

/** Named dates start from whatever is on screen, so neither field starts blank. */
const draftFrom = ref('')
const draftTo = ref('')

function startNaming() {
  draftFrom.value = range.value.from ?? ''
  draftTo.value = range.value.to ?? ''
  isNaming.value = true
}

/** A range must have both ends and read forwards; the server refuses the rest. */
const canApply = computed(() =>
  draftFrom.value !== '' && draftTo.value !== '' && draftFrom.value <= draftTo.value,
)

function apply() {
  selectCustomRange({ from: draftFrom.value, to: draftTo.value })
  isNaming.value = false
}

const customLabel = computed(() =>
  isCustom.value ? `${range.value.from ?? '…'} to ${range.value.to ?? '…'}` : 'Custom',
)
</script>

<template>
  <div data-testid="usage-range-filter" class="flex flex-col gap-2">
    <div class="flex flex-wrap items-center gap-1">
      <UButton
        v-for="option in USAGE_PRESETS"
        :key="option.value"
        :data-testid="`usage-preset-${option.value}`"
        :label="option.label"
        size="sm"
        :variant="!isCustom && preset === option.value ? 'subtle' : 'ghost'"
        :color="!isCustom && preset === option.value ? 'primary' : 'neutral'"
        @click="selectPreset(option.value)"
      />

      <UButton
        data-testid="usage-preset-custom"
        :label="customLabel"
        icon="i-lucide-calendar"
        size="sm"
        :variant="isCustom ? 'subtle' : 'ghost'"
        :color="isCustom ? 'primary' : 'neutral'"
        @click="startNaming"
      />
    </div>

    <div v-if="isNaming" data-testid="usage-custom-range" class="flex flex-wrap items-end gap-2">
      <UFormField label="From" size="sm">
        <UInput v-model="draftFrom" data-testid="usage-custom-from" type="date" size="sm" />
      </UFormField>
      <UFormField label="To" size="sm">
        <UInput v-model="draftTo" data-testid="usage-custom-to" type="date" size="sm" />
      </UFormField>
      <UButton
        data-testid="usage-custom-apply"
        label="Apply"
        size="sm"
        :disabled="!canApply"
        @click="apply"
      />
    </div>
  </div>
</template>
