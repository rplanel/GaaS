<script setup lang="ts">
import { RadioGroupIndicator, RadioGroupItem, RadioGroupRoot } from 'reka-ui'
import { computed, ref, useId, useSlots, watch } from 'vue'

type OptionPrimitive = string | number | boolean | null

interface CardRadioOption {
  value: OptionPrimitive
  label: string
  description?: string
  icon?: string
  badge?: string
  badgeColor?: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'
  badgeVariant?: 'solid' | 'soft' | 'outline' | 'subtle'
  disabled?: boolean
  cardClass?: string
}

interface NormalizedOption extends CardRadioOption {
  id: string
  internalValue: string
}

const props = withDefaults(defineProps<{
  items: CardRadioOption[]
  modelValue?: OptionPrimitive
  gridClass?: string
  cardClass?: string
  disabled?: boolean
}>(), {
  disabled: false,
})

const emit = defineEmits<{ (e: 'update:modelValue', value: OptionPrimitive | null): void, (e: 'change', value: OptionPrimitive | null): void }>()
const slots = useSlots()
const groupId = useId()

const normalizedItems = computed<NormalizedOption[]>(() => props.items.map((item, index) => ({
  ...item,
  id: `${groupId}-option-${index}`,
  internalValue: `${index}`,
  label: (item.label.split('.').slice(-1))[0],
})))

const innerValue = ref<string | null>(null)

function syncInnerValue() {
  const match = normalizedItems.value.find(option => option.value === props.modelValue)
  innerValue.value = match ? match.internalValue : null
}

watch(() => props.modelValue, syncInnerValue, { immediate: true })
watch(normalizedItems, syncInnerValue)

const gridClasses = computed(() => {
  const segments = ['grid', 'gap-3']
  if (props.gridClass) {
    segments.push(props.gridClass)
  }
  else {
    segments.push('grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')
  }
  return segments.join(' ')
})

function isOptionDisabled(option: NormalizedOption) {
  return props.disabled || option.disabled
}

function labelClasses(option: NormalizedOption, selected: boolean) {
  const base = 'relative flex h-full w-full flex-col gap-3 rounded-lg border border-default bg-default p-4 transition duration-150'
  const focus = 'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary'
  const hover = isOptionDisabled(option)
    ? 'cursor-not-allowed opacity-60'
    : 'cursor-pointer hover:border-primary/40 hover:shadow-sm'
  const active = selected ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20' : ''
  return [base, focus, hover, active, props.cardClass, option.cardClass].filter(Boolean).join(' ')
}

function onChange(internalValue: string | null) {
  innerValue.value = internalValue
  const match = normalizedItems.value.find(option => option.internalValue === internalValue)
  const nextValue = match ? match.value : null
  emit('update:modelValue', nextValue)
  emit('change', nextValue)
}
</script>

<template>
  <RadioGroupRoot
    :model-value="innerValue"
    :disabled="disabled"
    class="contents"
    @update:model-value="onChange"
  >
    <div :class="gridClasses">
      <div v-for="option in normalizedItems" :key="option.id" class="relative">
        <RadioGroupItem
          :id="option.id"
          :value="option.internalValue"
          :disabled="isOptionDisabled(option)"
          class="peer sr-only"
        >
          <RadioGroupIndicator class="sr-only" />
        </RadioGroupItem>

        <label
          :for="option.id"
          :class="labelClasses(option, innerValue === option.internalValue)"
          data-test="card-radio-option"
        >
          <div class="flex items-start gap-3">
            <span
              v-if="option.icon"
              class="text-lg shrink-0 text-primary"
              :class="option.icon"
              aria-hidden="true"
            />

            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <span class="font-medium text-default">
                <slot name="label" :item="option" :checked="innerValue === option.internalValue">
                  {{ option.label }}
                </slot>
              </span>
              <UBadge
                v-if="option.badge"
                :color="option.badgeColor || 'primary'"
                :variant="option.badgeVariant || 'soft'"
                class=""
              >
                <slot name="badge" :item="option" :checked="innerValue === option.internalValue">
                  {{ option.badge }}
                </slot>
              </UBadge>
              <span v-if="option.description" class="text-sm text-muted">
                <slot name="description" :item="option" :checked="innerValue === option.internalValue">
                  {{ option.description }}
                </slot>
              </span>
            </div>

          </div>

          <div v-if="slots.footer" class="mt-3">
            <slot name="footer" :item="option" :checked="innerValue === option.internalValue" :disabled="option.disabled" />
          </div>
        </label>
      </div>
    </div>
  </RadioGroupRoot>
</template>
