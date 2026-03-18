<script setup lang="ts">
const route = useRoute()

const slug = computed(() => {
  const slugParam = route.params.slug
  if (Array.isArray(slugParam)) {
    return slugParam.join('/')
  }
  return slugParam
})
</script>

<template>
  <UPageCard variant="ghost">
    <UAlert
      icon="i-lucide-info"
      color="warning"
      variant="subtle"
      title="Result page not found"
      :description="`No result page exists for '${slug}'. Create a page at 'app/pages/analyses/[analysisId]/results/${slug}.vue' to display custom results for this dataset.`"
    />
  </UPageCard>
</template>
