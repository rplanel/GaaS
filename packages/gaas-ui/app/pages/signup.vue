<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Database } from '../types'
import * as z from 'zod'

definePageMeta({
  layout: 'auth',
})

useSeoMeta({
  title: 'Sign up',
})

// const toast = useToast()
const supabase = useSupabaseClient<Database>()

const fields = [

  {
    name: 'email',
    type: 'text' as const,
    label: 'Email',
    placeholder: 'Enter your email',
  },
  {
    name: 'password',
    label: 'Password',
    type: 'password' as const,
    placeholder: 'Enter your password',
  },
]

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

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Must be at least 8 characters'),
})

type Schema = z.output<typeof schema>

async function handleSignUp(e: FormSubmitEvent<Schema>) {
  // const queryParams
  //   = query.redirectTo !== undefined ? `?redirectTo=${query.redirectTo}` : ''
  const { data: { email, password } } = e
  const redirectTo = '/datasets'
  if (email && password) {
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
      },
    })

    if (error) {
      throw createError('Unable to sign up')
    }
    if (data?.user) {
      await navigateTo(redirectTo, { replace: true })
    }
  }
}
</script>

<template>
  <UAuthForm
    :fields="fields"
    :schema="schema"
    title="Create an account"
    :submit="{ label: 'Create account' }"
    @submit="handleSignUp"
  >
    <template #description>
      Already have an account? <ULink
        to="/login"
        class="text-primary-500 font-medium"
      >
        Login
      </ULink>.
    </template>
  </UAuthForm>
</template>
