<script setup lang="ts">
const supabase = useSupabaseClient()

const email = ref('')
const password = ref('')
/** Supabase's reason for refusing the last sign-in. */
const refusal = ref<string>()

async function signIn() {
  refusal.value = undefined
  const { error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  })
  if (error) {
    refusal.value = error.message
    return
  }
  await navigateTo('/', { replace: true })
}
</script>

<template>
  <main>
    <h1>Sign in</h1>
    <form @submit.prevent="signIn">
      <p>
        <label>
          Email
          <input v-model="email" type="email" autocomplete="email" required>
        </label>
      </p>
      <p>
        <label>
          Password
          <input v-model="password" type="password" autocomplete="current-password" required>
        </label>
      </p>
      <button type="submit">
        Sign in
      </button>
    </form>
    <p v-if="refusal" role="alert">
      {{ refusal }}
    </p>
  </main>
</template>
