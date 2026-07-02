<script setup lang="ts">
const HeroShaders = defineAsyncComponent(() =>
  import('~/components/HeroShaders.client.vue'),
)
</script>

<template>
  <component :is="HeroShaders" v-bind="$attrs" />
</template>
