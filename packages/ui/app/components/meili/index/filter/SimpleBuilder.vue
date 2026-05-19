<script setup lang="ts">
import type { InputMenuProps } from '@nuxt/ui'
import type { FacetDistribution, FacetStats, SearchParams } from 'meilisearch'
import type { FacetOperators } from '../../../../utils/filterSchema'
import { useFacetFilterBuilder } from '../../../../composables/meili/useFacetFilterBuilder'
import { BuilderStateSchema } from '../../../../utils/filterSchema'
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

  searchParams: SearchParams

  facetAttribute?: string | undefined

  compact?: boolean

  /**
   * Function to add a filter to the filter list.
   * @param filter The FacetFilter object to add. Must be a valid FacetFilter with attribute, operator, and values properties.
   * @see FacetFilter
   */
  addFilter?: (filter: FacetFilter) => unknown

  inputMenuProps?: InputMenuProps
}

const props = defineProps<SimpleFilterBuilderProps>()

// props destructuring to refs
const { addFilter } = props
const meiliIndex = toRef(() => props.meiliIndex)
const facetDistribution = toRef(() => props.facetDistribution)
const facetStats = toRef(() => props.facetStats)
const searchParams = toRef(() => props.searchParams)
const facetAttribute = toRef(() => props.facetAttribute)
const inputMenuProps = toRef(() => props.inputMenuProps || {})
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

watch(facetAttribute, (newVal) => {
  if (newVal) {
    state.attribute = newVal
  }
}, { immediate: true })
</script>

<template>
  <div>
    <pre v-if="filterError">Error: {{ filterError }}</pre>
    <UForm :schema="BuilderStateSchema" :state="state" @submit="onSubmit">
      <div class="flex flex-col gap-2">
        <div class="flex gap-2">
          <UFormField v-if="!facetAttribute" label="Attribute" name="attribute">
            <UInputMenu v-model="state.attribute" :items="facetOptions" value-key="id" />
          </UFormField>

          <UFormField label="Operator" name="operator">
            <UInputMenu
              :model-value="state.operator"
              :items="facetOperators"
              value-key="operator"
              label-key="label"
              @update:model-value="(v) => state.operator = v ? (v as FacetOperators) : undefined"
            />
          </UFormField>

          <UFormField v-if="filterType" label="Values" name="values">
            <MeiliIndexFilterFormSetInput
              v-if="filterType === 'set'"
              v-model="state.values as string[]"
              :meili-index="meiliIndex"
              :filter-attribute="state.attribute!"
              :filter-operator="state.operator as SetOperator"
              :facet-distribution="facetDistribution"
              :input-menu-props="inputMenuProps"
              :search-params="searchParams"
            />
            <MeiliIndexFilterFormRangeInput
              v-else-if="filterType === 'range'"
              v-model="state.values as [number, number]"
              :meili-index="meiliIndex"
              :filter-attribute="state.attribute!"
              :filter-operator="state.operator as SetOperator"
              :facet-stats="facetStats"
            />
            <MeiliIndexFilterFormComparisonNumberInput
              v-else-if="filterType === 'comparison' && attributeType === 'continuous'"
              v-model="state.values as number"
              :meili-index="meiliIndex"
              :filter-attribute="state.attribute!"
              :filter-operator="state.operator as SetOperator"
              :facet-stats="facetStats"
            />
            <MeiliIndexFilterFormComparisonStringInput
              v-else-if="filterType === 'comparison' && attributeType === 'categorical'"
              v-model="state.values as string"
              :meili-index="meiliIndex"
              :filter-attribute="state.attribute!"
              :filter-operator="state.operator as SetOperator"
              :facet-distribution="facetDistribution"
              :input-menu-props="inputMenuProps"
              :search-params="searchParams"
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
