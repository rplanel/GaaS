<script setup lang="ts">
interface Props {
  breadcrumbsItems?: BreadcrumbItem[] | undefined
}

const props = withDefaults(defineProps<Props>(), { breadcrumbsItems: undefined })
const breadcrumbsItems = toRef(() => props.breadcrumbsItems)

const pageHeaderProps = {
  title: 'User',
  description: 'Manage the users that are available for this web application',
}

const computedBreadcrumbsItems = computed(() => {
  const breadcrumbsItemsVal = toValue(breadcrumbsItems)
  if (breadcrumbsItemsVal) {
    return [
      ...breadcrumbsItemsVal.map(breadcrumb => ({ ...breadcrumb, disabled: false })),
      {
        label: 'Users',
        disabled: true,
        to: '/admin/users',
      },
    ]
  }
  return breadcrumbsItemsVal
})
</script>

<template>
  <div>
    <PageHeader :page-header-props icon="i-lucide:workflow" :breadcrumbs-items="computedBreadcrumbsItems">
      <template #trailing-content>
        <UBadge variant="subtle" color="info">
          {{
            galaxyInstance.name
          }}
        </UBadge>
      </template>
    </PageHeader>
  </div>
</template>
