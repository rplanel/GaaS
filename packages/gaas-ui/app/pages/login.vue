<script setup lang="ts">
import type { SupabaseTypes } from '#build/types/database'
import type { FormSubmitEvent } from '@nuxt/ui'

import {
  createError,
  navigateTo,
  useRoute,
  useSupabaseClient,
  useSupabaseUser,
} from '#imports'
import { ref, watchEffect } from 'vue'

import { z } from 'zod'

type Database = SupabaseTypes.Database

definePageMeta({
  layout: 'auth',
})
useSeoMeta({
  title: 'Login',
})

// const toast = useToast()
const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()
const { query } = useRoute()
const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Must be at least 8 characters'),
})
type Schema = z.output<typeof schema>

watchEffect(async () => {
  if (user.value) {
    await navigateTo(query.redirectTo as string, {
      replace: true,
    })
  }
})
async function handleSignIn(e: FormSubmitEvent<Schema>) {
  const { data: { email, password } } = e
  const queryParams
    = query.redirectTo !== undefined ? `?redirectTo=${query.redirectTo}` : ''
  const redirectTo = `/confirm${queryParams}`
  // const { email, password } = state
  if (email && password) {
    const { error, data } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (data?.user) {
      await navigateTo(redirectTo as string, { replace: true })
    }

    if (error) {
      throw createError('Unable to sign in')
    }
  }
}

const fields = ref([
  {
    name: 'email',
    type: 'text' as const,
    label: 'Email',
    placeholder: 'Enter your email',
    required: true,
  },
  {
    name: 'password',
    label: 'Password',
    type: 'password' as const,
    placeholder: 'Enter your password',
  },
])

// const providers = [{
//   label: 'Google',
//   icon: 'i-simple-icons-google',
//   onClick: () => {
//     toast.add({ title: 'Google', description: 'Login with Google' })
//   },
// }, {
//   label: 'GitHub',
//   icon: 'i-simple-icons-github',
//   onClick: () => {
//     toast.add({ title: 'GitHub', description: 'Login with GitHub' })
//   },
// }]
</script>

<template>
  <UAuthForm
    class="max-w-md"
    icon="i-lucide-user"
    title="Login"
    :schema
    description="Enter your credentials to access your account."
    :fields="fields"
    @submit="handleSignIn"
  >
    <template #description>
      Don't have an account? <ULink
        to="/signup"
        class="text-primary-500 font-medium"
      >
        Sign up
      </ULink>.
    </template>

    <template #password-hint>
      <ULink
        to="/"
        class="text-primary-500 font-medium"
      >
        Forgot password?
      </ULink>
    </template>
  </UAuthForm>

  <!-- <UCard>
    <template #header>
      <h2 class="text-lg font-bold">
        Log in to
      </h2>
    </template>
    <UForm :schema="schema" :state="state" class="space-y-4">
      <UFormField label="Email address" name="email" required>
        <UInput v-model="state.email" placeholder="johndoe@gmail.com" type="email" />
      </UFormField>
      <UFormField label="Password" name="password" help="Enter your password to access this website" required>
        <UInput v-model="state.password" :type="showPassword ? 'text' : 'password'">
          <template #trailing>
            <UButton
              color="neutral" variant="link" size="sm" :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
              aria-label="show ? 'Hide password' : 'Show password'" :aria-pressed="showPassword"
              aria-controls="password" @click="showPassword = !showPassword"
            />
          </template>
        </UInput>
      </UFormField>

      <UButton loading-auto class="mr-3" @click="handleSignIn">
        Sign In
      </UButton>
      <UButton variant="subtle" @click="handleSignUp">
        Sign Up
      </UButton>
    </UForm>
  </UCard> -->
</template>
