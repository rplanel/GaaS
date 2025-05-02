<script setup lang="ts">
const breadcrumbsItems = ref([
  {
    label: 'Home',
    disabled: false,
    to: '/',
  },
  {
    label: 'Galaxy',
    disabled: false,
    to: '/galaxy',
  },
  {
    label: 'Workflows',
    disabled: true,
    to: '/galaxy/workflows',
  },
])

const { data: workflows } = await useFetch('/api/galaxy/workflows')

const pageHeaderProps = computed(() => {
  const title = 'Galaxy Workflows'
  const description = 'All workflows available on the galaxy instance'
  const props = {
    title,
    description,

  }
  return props
})
</script>

<template>
  <div>
    <PageHeader
      :page-header-props
      icon="i-lucide:workflow"
      :breadcrumbs-items="breadcrumbsItems"
    />

    <div class="grid grid-flow-row auto-rows-max gap-8">
      <div
        v-for="workflow in workflows"
        :key="workflow.id"
        class="ring ring-[var(--ui-border)] rounded-[calc(var(--ui-radius)*2)] p-4"
      >
        <h3>{{ workflow.name }}</h3>
        {{ workflow.id }}
      </div>
    </div>
  </div>
</template>
