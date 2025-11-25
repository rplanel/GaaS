<script setup lang="ts">
// Example: Using database types from nuxt-galaxy module
import type { Database } from 'nuxt-galaxy'

// Example 1: Using table types via Database (demonstration)
// type Analysis = Database['galaxy']['Tables']['analyses']['Row']

// Example 2: Using enum types via Database (demonstration)
// type InvocationState = Database['galaxy']['Enums']['invocation_state']

// Example 3: Working with the Supabase client with full type safety
const client = useSupabaseClient<Database>()

// Fetch analyses with full type safety - specify schema
const { data: analyses } = await useAsyncData('analyses', async () => {
  const { data } = await client
    .schema('galaxy')
    .from('analyses')
    .select('*')
    .limit(10)

  return data
})
</script>

<template>
  <div class="p-8">
    <h1 class="text-2xl font-bold mb-4">
      Nuxt Galaxy Module - Database Types Example
    </h1>

    <div class="mb-6">
      <h2 class="text-xl font-semibold mb-2">
        Analyses
      </h2>
      <div v-if="analyses && analyses.length > 0" class="space-y-2">
        <div
          v-for="analysis in analyses"
          :key="analysis.id"
          class="border p-4 rounded"
        >
          <p><strong>Name:</strong> {{ analysis.name }}</p>
          <p><strong>State:</strong> {{ analysis.state }}</p>
          <p><strong>Created:</strong> {{ analysis.created_at }}</p>
        </div>
      </div>
      <p v-else class="text-gray-500">
        No analyses found
      </p>
    </div>

    <div class="mt-8 p-4 bg-gray-100 rounded">
      <h3 class="font-semibold mb-2">
        Type Examples
      </h3>
      <p class="text-sm text-gray-700 mb-2">
        This component demonstrates how to use database types exported from the nuxt-galaxy module.
        Check the source code to see examples of type imports and usage.
      </p>
      <ul class="text-sm text-gray-600 list-disc list-inside space-y-1">
        <li>Import Database type from 'nuxt-galaxy'</li>
        <li>Access table types: Database['galaxy']['Tables']['analyses']['Row']</li>
        <li>Access enum types: Database['galaxy']['Enums']['job_state']</li>
        <li>Use with Supabase client: client.schema('galaxy').from('analyses')</li>
      </ul>
    </div>
  </div>
</template>
