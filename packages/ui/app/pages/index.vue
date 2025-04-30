<script setup lang="ts">
definePageMeta({
  layout: 'landing',
})
const links = ref([
  {
    label: 'Get started',
    to: '/datasets',
    icon: 'i-lucide-square-play',
    trailing: true,
    size: 'xl',
  },
])
</script>

<template>
  <div class="relative">
    <UPageHero
      title="Welcome to GaaS" description="Is a set to enable usage and integration of Galaxy within Nuxt"
      :links="links"
    >
      <template #top>
        <div
          class="absolute rounded-full dark:bg-(--ui-primary) blur-[300px] size-60 sm:size-80 transform -translate-x-1/2 left-1/2 -translate-y-80"
        />
        <SkyBg />
      </template>
    </UPageHero>
  </div>
</template>
