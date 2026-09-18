<script setup lang="ts">
/**
 * What someone without the admin role is told in place of an admin surface.
 * One definition, so every admin page refuses in the same words.
 */
</script>

<template>
  <div class="my-5">
    <UAlert
      variant="subtle" color="error" title="Admin section"
      description="You don't have the admin permission"
    />
  </div>
</template>
