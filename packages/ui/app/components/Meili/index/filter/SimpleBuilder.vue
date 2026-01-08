<script setup lang="ts">
import type { FacetDistribution, FacetStats } from 'meilisearch'
import { useFacetFilterBuilder } from '../../../../composables/meili/useFacetFilterBuilder'
import MeiliIndexFilterFormComparisonNumberInput from './form/ComparisonNumberInput.vue'
import MeiliIndexFilterFormComparisonStringInput from './form/ComparisonStringInput.vue'
import MeiliIndexFilterFormRangeInput from './form/RangeInput.vue'
import MeiliIndexFilterFormSetInput from './form/SetInput.vue'

/**
 * Props for the SimpleFilterBuilder component.
 * Used to build and add filters for a MeiliSearch index.
 */
interface SimpleFilterBuilderProps {
  /**
   * The name of the MeiliSearch index.
   */
  meiliIndex: string

  facetDistribution: FacetDistribution | undefined

  facetStats: FacetStats | undefined
  /**
   * Function to add a filter to the filter list.
   * @param filter The FacetFilter object to add. Must be a valid FacetFilter with attribute, operator, and values properties.
   * @see FacetFilter
   */
  addFilter: (filter: FacetFilter) => void
}

const props = defineProps<SimpleFilterBuilderProps>()

// props destructuring to refs
const { addFilter } = props
const meiliIndex = toRef(() => props.meiliIndex)
const facetDistribution = toRef(() => props.facetDistribution)
const facetStats = toRef(() => props.facetStats)

const {
  state,
  facetOptions,
  attributeType,
  facetOperators,
  filterType,
  isFilterValid,
  validateAndAddFilter,
  filterError,
} = useFacetFilterBuilder({
  facetDistribution,
  facetStats,
  addFilter,
})

async function onSubmit() {
  validateAndAddFilter()
}

const inputValueComponent = computed(() => {
  if (filterType.value === 'set') {
    return MeiliIndexFilterFormSetInput
  }
  else if (filterType.value === 'range') {
    return MeiliIndexFilterFormRangeInput
  }
  else if (filterType.value === 'comparison' && attributeType.value === 'continuous') {
    return MeiliIndexFilterFormComparisonNumberInput
  }
  else if (filterType.value === 'comparison' && attributeType.value === 'categorical') {
    return MeiliIndexFilterFormComparisonStringInput
  }
  else if (filterType.value === 'comparison' && attributeType.value === 'categorical') {
    return MeiliIndexFilterFormSetInput
  }
  return null
})
</script>

<template>
  <div>
    <div class="mb-4">
      Filter
      <UBadge color="neutral" variant="soft" :label="meiliIndex" />
      index
    </div>
    <pre v-if="filterError">Error: {{ filterError }}</pre>
    <UForm :schema="FacetFilterSchema" :state="state" @submit="onSubmit">
      <div class="flex flex-col gap-2">
        <div class="flex gap-2">
          <UFormField label="Attribute" name="attribute">
            <!-- <template #description>
            <div v-if="attributeType !== undefined">
              <UBadge size="sm" variant="subtle" :label="attributeType" color="neutral" />
            </div>
          </template> -->
            <UInputMenu v-model="state.attribute" :items="facetOptions" value-key="id" />
          </UFormField>

          <!-- <UFormField label="Negation" name="negation">
        <USwitch v-model="operatorNegation" />
      </UFormField> -->

          <UFormField label="Operator" name="operator">
            <UInputMenu v-model="state.operator" :items="facetOperators" value-key="operator" label-key="label" />
          </UFormField>

          <UFormField v-if="inputValueComponent" label="Values" name="values">
            <component
              :is="inputValueComponent" v-if="inputValueComponent" v-model="state.values"
              :meili-index="meiliIndex" :filter-attribute="state.attribute" :filter-operator="state.operator"
              :facet-distribution="facetDistribution" :facet-stats="facetStats"
            />
          </UFormField>
        </div>
        <div>
          <UButton :disabled="!isFilterValid" type="submit">
            Submit
          </UButton>
        </div>
      </div>
    </UForm>
  </div>
</template>
