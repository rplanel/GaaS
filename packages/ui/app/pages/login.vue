<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
// import type { SupabaseTypes } from '#build/types/database'

import type { AuthError } from '@supabase/supabase-js'
import type { Database } from 'nuxt-galaxy'

import {
  createError,
  navigateTo,
  useSupabaseClient,
} from '#imports'
import { ref } from 'vue'

import * as z from 'zod'

// type Database = SupabaseTypes.Database

definePageMeta({
  layout: 'auth',
})
useSeoMeta({
  title: 'Login',
})

const loginError = ref<AuthError | null>(null)
const toast = useToast()
const supabase = useSupabaseClient<Database>()
const redirectInfo = useSupabaseCookieRedirect()
const schema = z.object({
  email: z.email('Invalid email'),
  password: z.string().min(8, 'Must be at least 8 characters'),
})
type Schema = z.output<typeof schema>

// watchEffect(async () => {
//   if (user.value) {
//     // Get the saved path and clear it from the cookie
//     const path = redirectInfo.pluck()
//     await navigateTo(path || (query.redirectTo as string), {
//       replace: true,
//     })
//   }
// })
async function handleSignIn(e: FormSubmitEvent<Schema>) {
  const { data: { email, password } } = e
  // const queryParams
  //   = query.redirectTo !== undefined ? `?redirectTo=${query.redirectTo}` : ''
  // const redirectTo = `/confirm${queryParams}`
  // const { email, password } = state
  if (email && password) {
    const { error, data } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (data?.user) {
      // Get the saved path and clear it from the cookie
      const path = redirectInfo.pluck()
      navigateTo(path || '/', { replace: true })
    }

    if (error) {
      loginError.value = error

      // throw createError('Unable to sign in')
    }
  }
}
async function signInWithGithub() {
  // Don't pluck the cookie here - let the confirm page handle the redirect
  // The redirectTo option is just the callback URL after OAuth, not the final destination
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: `${window.location.origin}/confirm`,
    },
  })
  if (error) {
    loginError.value = error
    throw createError('Unable to sign in with GitHub')
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

const providers = [
  // {
//   label: 'Google',
//   icon: 'i-simple-icons-google',
//   onClick: () => {
//     toast.add({ title: 'Google', description: 'Login with Google' })
//   },
// },
  {
    label: 'GitHub',
    icon: 'i-simple-icons-github',
    onClick: () => {
      toast.add({ title: 'GitHub', description: 'Login with GitHub' })
      signInWithGithub()
    },
  },
]
</script>

<template>
  <UAuthForm
    class="max-w-md"
    icon="i-lucide-user"
    title="Login"
    :schema
    description="Enter your credentials to access your account."
    :fields="fields"
    :providers
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
  <UAlert
    v-if="loginError"
    title="Login failed"
    :description="loginError.message"
    color="error"
    variant="subtle"
    icon="i-lucide-terminal"
    close
    @update:open="() => loginError = null"
  />
</template>
