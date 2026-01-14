<script setup lang="ts">
interface Props {
  meiliIndex: string
}

const props = defineProps<Props>()

const searchTerm = defineModel<string>()
</script>

<template>
  <UForm class="space-y-4">
    <UFormField>
      <UInput
        v-model="searchTerm"
        :placeholder="`Enter search term for '${props.meiliIndex}' index`"
        class="w-full"
      />
    </UFormField>
  </UForm>
</template>
