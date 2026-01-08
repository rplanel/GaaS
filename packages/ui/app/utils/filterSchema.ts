import * as z from 'zod'

// filter types

export const filterTypes = ['comparison', 'range', 'existence', 'set'] as const
export const FilterTypeEnum = z.enum(filterTypes, {
  error: 'Invalid filter type',
})
export type FilterType = z.infer<typeof FilterTypeEnum>

/**
 * Filter operator schemas and types
 */

// operators enums
export const comparisonOperators = ['=', '!=', '<', '<=', '>', '>='] as const
export const ComparisonOperatorEnum = z.enum(comparisonOperators, {
  error: 'Invalid comparison operator',
})
export type ComparisonOperator = z.infer<typeof ComparisonOperatorEnum>

export const rangeOperators = ['TO'] as const
export const RangeOperatorEnum = z.enum(rangeOperators, {
  error: 'Invalid range operator',
})
export type RangeOperator = z.infer<typeof RangeOperatorEnum>

export const setOperators = ['IN', 'NOT IN'] as const
export const SetOperatorEnum = z.enum(setOperators, {
  error: 'Invalid set operator',
})
export type SetOperator = z.infer<typeof SetOperatorEnum>

export const existenceOperators = [
  'EXISTS',
  'NOT EXISTS',
  'IS EMPTY',
  'IS NOT EMPTY',
  'IS NULL',
  'IS NOT NULL',
] as const
export const ExistenceOperatorEnum = z.enum(existenceOperators, {
  error: 'Invalid existence operator',
})
export type ExistenceOperator = z.infer<typeof ExistenceOperatorEnum>

export const negationOperators = ['NOT'] as const
export const NegationOperatorEnum = z.enum(negationOperators, {
  error: 'Invalid negation operator',
})
export type NegationOperator = z.infer<typeof NegationOperatorEnum>

export const groupingOperators = ['AND', 'OR'] as const
export const GroupingOperatorEnum = z.enum(groupingOperators, {
  error: 'Invalid grouping operator',
})
export type GroupingOperator = z.infer<typeof GroupingOperatorEnum>

export const FacetOperatorsEnum = z.union([
  ComparisonOperatorEnum,
  RangeOperatorEnum,
  SetOperatorEnum,
  ExistenceOperatorEnum,
])
export type FacetOperators = z.infer<typeof FacetOperatorsEnum>

// categorical operators
export const categoricalOperators = [...comparisonOperators, ...setOperators, ...existenceOperators] as const
export const CategoricalOperatorEnum = z.enum(categoricalOperators)
export type CategoricalOperator = z.infer<typeof CategoricalOperatorEnum>

// continuous operators
export const continuousOperators = [
  ...comparisonOperators,
  ...rangeOperators,
  ...existenceOperators,
] as const
export const ContinuousOperatorEnum = z.enum(continuousOperators)
export type ContinuousOperator = z.infer<typeof ContinuousOperatorEnum>

// operators that don't support negation
export const operatorsWithoutNegation = [
  ...comparisonOperators,
  ...rangeOperators,
] as const
export const OperatorsWithoutNegationEnum = z.enum(operatorsWithoutNegation)
export type OperatorsWithoutNegation = z.infer<typeof OperatorsWithoutNegationEnum>

// operators that support negation
export const operatorsWithNegation = [
  ...setOperators,
  ...existenceOperators,
] as const
export const OperatorsWithNegationEnum = z.enum(operatorsWithNegation)
export type OperatorsWithNegation = z.infer<typeof OperatorsWithNegationEnum>

/**
 * Filter values schemas and types
 */

// values schemas
export const ComparisonValuesSchema = z.union([z.string(), z.number()])
export type ComparisonValues = z.infer<typeof ComparisonValuesSchema>

export const RangeValuesSchema = z.tuple([
  z.union([z.number(), z.string(), z.null()]),
  z.union([z.number(), z.string(), z.null()]),
])
export type RangeValues = z.infer<typeof RangeValuesSchema>

export const SetValuesSchema = z.array(z.string())
export type SetValues = z.infer<typeof SetValuesSchema>

export const FacetValuesSchema = z.union([
  ComparisonValuesSchema,
  RangeValuesSchema,
  SetValuesSchema,
])
export type FacetValues = z.infer<typeof FacetValuesSchema>

/**
 * Filter schemas and types
 */

// Base Facet Filter
const BaseFacetFilter = z.object({
  attribute: z.string('Attribute is required'),
})

// comparison filter schema
export const ComparisonFacetFilterSchema = BaseFacetFilter.safeExtend({
  type: z.literal('comparison'),
  operator: ComparisonOperatorEnum,
  values: ComparisonValuesSchema,
})
export type ComparisonFacetFilter = z.infer<typeof ComparisonFacetFilterSchema>

// range filter schema
export const RangeFacetFilterSchema = BaseFacetFilter.safeExtend({
  type: z.literal('range'),
  operator: RangeOperatorEnum,
  values: RangeValuesSchema,
})
export type RangeFacetFilter = z.infer<typeof RangeFacetFilterSchema>

// existence filter schema
export const ExistenceFacetFilterSchema = BaseFacetFilter.safeExtend({
  type: z.literal('existence'),
  operator: ExistenceOperatorEnum,
  negation: NegationOperatorEnum.optional(),
})
export type ExistenceFacetFilter = z.infer<typeof ExistenceFacetFilterSchema>

// set filter schema
export const SetFacetFilterSchema = BaseFacetFilter.safeExtend({
  type: z.literal('set'),
  operator: SetOperatorEnum,
  values: SetValuesSchema,
  negation: z.enum(['NOT']).optional(),
})
export type SetFacetFilter = z.infer<typeof SetFacetFilterSchema>

export const FacetFilterSchema = z.union([
  ComparisonFacetFilterSchema,
  RangeFacetFilterSchema,
  ExistenceFacetFilterSchema,
  SetFacetFilterSchema,
])
export type FacetFilter = z.infer<typeof FacetFilterSchema>

export const filterSchemas = [
  ComparisonFacetFilterSchema,
  RangeFacetFilterSchema,
  ExistenceFacetFilterSchema,
  SetFacetFilterSchema,
]

// facet group schema
