<script setup lang="ts">
import { navigateTo, useRoute, useSupabaseUser } from '#imports'
import { watch } from 'vue'

const user = useSupabaseUser()
const { query } = useRoute()

watch(
  user,
  () => {
    if (user.value) {
      const to = (query.redirectTo as string) ?? '/'
      return navigateTo(to, {
        replace: true,
      })
    }
  },
  { immediate: true },
)
</script>

<template>
  <div>Waiting for login...</div>
</template>
