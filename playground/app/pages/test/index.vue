<script setup lang="ts">
const cards = [
  {
    title: 'Mosaic table',
    description: 'the data table is powered by Mosaic',
    to: '/test/mosaic',
  },
  {
    title: 'Meili table',
    description: 'the data table is powered by Meili',
    to: '/test/meili',
  },

  {
    title: 'Meili with Mosaic table',
    description: 'the data table is powered by Meili with Mosaic',
    to: '/test/meili-with-mosaic',
  },
]
</script>

<template>
  <UDashboardPanel id="list-tests-page">
    <template #body>
      <UPage>
        <UPageGrid>
          <UPageCard v-for="(card, index) in cards" :key="index" v-bind="card" />
        </UPageGrid>
      </UPage>
    </template>
  </UDashboardPanel>
</template>
