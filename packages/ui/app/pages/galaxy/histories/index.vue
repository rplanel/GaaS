<script setup lang="ts">
const { data: histories } = await useFetch('/api/galaxy/histories')
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
    label: 'Histories',
    disabled: true,
    to: '/galaxy/histories',
  },
])

const pageHeaderProps = computed(() => {
  return {
    title: 'Galaxy Histories',
    description: 'All histories that has been used to run analysis',
  }
})
</script>

<template>
  <div>
    <PageHeader
      :page-header-props
      :breadcrumbs-items="breadcrumbsItems"
      icon="i-lucide:history'"
    />

    <div class="grid grid-flow-row auto-rows-max gap-8">
      <div
        v-for="history in histories"
        :key="history.id"
        class="ring ring-[var(--ui-border)] rounded-[calc(var(--ui-radius)*2)] p-4"
      >
        <h3>{{ history.name }}</h3>
        {{ history.id }}
      </div>
    </div>
  </div>
</template>
