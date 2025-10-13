<script lang="ts" setup>
const meiliIndex = 'movies'
</script>

<template>
  <UDashboardPanel id="meili-data-table" title="Meili Data Table">
    <template #body>
      <div>
        <MeiliDataTable
          :meili-index="meiliIndex"
          :table-props="{
            columns: [
              { accessorKey: 'id', header: 'ID' },
              { accessorKey: 'title', header: 'Title' },
              { accessorKey: 'overview', header: 'Overview' },
            ],
            data: [],
          }"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
