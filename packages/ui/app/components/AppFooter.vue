<script setup lang="ts">
const { gaasUi: { footerItems } } = useAppConfig()

const items = toRef(footerItems)
</script>

<template>
  <UFooter>
    <template #left>
      <p class="text-(--ui-text-muted) text-sm">
        Copyright © {{ new Date().getFullYear() }}
      </p>
    </template>

    <UNavigationMenu :items="items" variant="link" />
    <template #right>
      <UButton
        icon="i-simple-icons-github"
        color="neutral"
        variant="ghost"
        to="https://github.com/rplanel/gaas"
        target="_blank"
        aria-label="GitHub"
      />
    </template>
  </UFooter>
</template>
