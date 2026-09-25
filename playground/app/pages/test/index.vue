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
  {
    title: 'Workflow graph',
    description: 'a Galaxy workflow drawn with Vue Flow, with its parameters edited from the canvas',
    to: '/test/workflow-graph',
  },
  {
    title: 'Workflow graph — forms in nodes',
    description: 'the same graph, with each step\'s form inside its own node',
    to: '/test/workflow-graph-in-node',
  },
  {
    title: 'Sequence browser',
    description: 'a sequence browser powered by D3',
    to: '/test/sequence-browser',
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
