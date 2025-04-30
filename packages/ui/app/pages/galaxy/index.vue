<script setup lang="ts">
import type { GalaxyTypes } from '#build/types/nuxt-galaxy'

const breadcrumbsItems = ref([
  {
    label: 'Home',
    disabled: false,
    to: '/',
  },
  {
    label: 'Galaxy',
    disabled: true,
    to: '/galaxy',
  },
])
const pageHeaderProps = computed(() => {
  return {
    title: 'Galaxy',
    description: 'Description of the Galaxy instance the web application is connected to.',

  }
})
const { data: galaxyInstanceDetails } = await useFetch<GalaxyTypes.GalaxyInstanceDetails>('/api/galaxy/instance')
</script>

<template>
  <div>
    <PageHeader :page-header-props :breadcrumbs-items="breadcrumbsItems" icon="i-file-icons:galaxy" />
    <UAlert v-if="galaxyInstanceDetails" color="info" variant="soft" class="m-5">
      <template #description>
        This web application will use the Galaxy Instance @
        <ULink target="_blank" :href="galaxyInstanceDetails.url">
          {{
            galaxyInstanceDetails.url
          }}
        </ULink>
        version <strong>{{ galaxyInstanceDetails.version_major }}</strong>
      </template>
    </UAlert>
  </div>
</template>
