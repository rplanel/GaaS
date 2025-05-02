<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{
  error: NuxtError
}>()
</script>

<template>
  <NuxtLayout>
    <UContainer>
      <UError
        :error="props.error"
      />
    </UContainer>
    <UFooter />
  </NuxtLayout>
</template>
