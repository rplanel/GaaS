<script setup lang="ts">
import { navigateTo, useRoute, useSupabaseCookieRedirect, useSupabaseUser } from '#imports'
import { watch } from 'vue'

definePageMeta({
  layout: 'auth',
})

useSeoMeta({
  title: 'Confirming...',
})

const user = useSupabaseUser()
const { query } = useRoute()
const redirectInfo = useSupabaseCookieRedirect()

// Extract the path once on setup, before any watcher runs
const savedPath = redirectInfo.pluck()

watch(
  user,
  () => {
    if (user.value) {
      // Use the saved path extracted on setup
      const to = savedPath || (query.redirectTo as string) || '/'
      return navigateTo(to, {
        replace: true,
      })
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="flex flex-col items-center gap-6 py-8">
    <UIcon
      name="i-lucide-loader-circle"
      class="size-12 text-primary animate-spin"
    />
    <div class="text-center space-y-2">
      <h1 class="text-xl font-semibold text-highlighted">
        Confirming your account
      </h1>
      <p class="text-muted text-sm">
        Please wait while we verify your credentials...
      </p>
    </div>
    <UProgress animation="carousel" class="w-48" />
  </div>
</template>
