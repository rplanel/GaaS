<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

const props = defineProps<{
  uuid: string
}>()

const filter = defineModel<{ label: string | undefined, uuid: string }>('filter')
const searchError = defineModel<string | undefined>('search-error')

const schema = z.object({
  filter: z.string(),
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  filter: undefined,
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (searchError.value) {
    searchError.value = undefined
  }
  const data = event.data
  // Here we could add parsing/validation of the manual filter string if needed
  // For now, we just log it
  if (!filter.value) {
    filter.value = { label: undefined, uuid: props.uuid }
  }
  filter.value.label = data?.filter ? data.filter : undefined
}

function clearInput() {
  if (searchError.value) {
    searchError.value = undefined
  }
  state.filter = ''
  filter.value = []
}
</script>

<template>
  <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
    <UFormField
      label="Filter"
      description="Provide a MeiliSearch filter string"
      hint="E.g. 'price >= 100 AND in_stock = true'"
      :error="searchError"
    >
      <UFieldGroup class="w-full">
        <UInput
          v-model="state.filter" label="" type="textarea" rows="5" name="manual-filter" class="w-full"
        >
          <template v-if="state.filter?.length" #trailing>
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              icon="i-lucide-circle-x"
              aria-label="Clear input"
              @click="clearInput"
            />
          </template>
        </UInput>
        <UButton type="submit" icon="lucide:plus" />
      </UFieldGroup>
    </UFormField>
  </UForm>
</template>
