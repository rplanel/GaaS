<script setup lang="ts">
const HeroShaders = defineAsyncComponent(() =>
  import('./HeroShaders.client.vue'),
)
</script>

<template>
  <component :is="HeroShaders" v-bind="$attrs" />
</template>
