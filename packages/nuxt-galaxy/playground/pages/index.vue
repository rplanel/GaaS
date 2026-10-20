<script setup lang="ts">
const user = useSupabaseUser()
</script>

<template>
  <main>
    <h1>nuxt-galaxy playground</h1>
    <p>Signed in as {{ user?.email }}.</p>
  </main>
</template>
