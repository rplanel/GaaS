<script setup lang="ts">
import type { AvatarProps, DropdownMenuItem } from '@nuxt/ui'
import type { Database } from '../types'

interface Props {
  collapsed?: boolean
  isAdmin?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  collapsed: false,
  isAdmin: false,
})

const colorMode = useColorMode()
const appConfig = useAppConfig()

const colors = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose']
const neutrals = ['slate', 'gray', 'zinc', 'neutral', 'stone']
const supabase = useSupabaseClient<Database>()
const supabaseUser = useSupabaseUser()

const user = computed<{ name: string, avatar: AvatarProps }>(() => {
  const name = supabaseUser && supabaseUser.value?.email ? supabaseUser.value.email : 'Guest'
  return {
    name,
    avatar: {
      icon: props.isAdmin ? 'eos-icons:admin' : 'i-lucide-user',
      size: 'md',
    },
  }
})

async function logout() {
  const { error } = await supabase.auth.signOut()
  if (error) {
    throw createError({ statusMessage: getErrorMessage(error), statusCode: getStatusCode(error) })
  }

  await navigateTo('/login')
}
const items = computed<DropdownMenuItem[][]>(() => {
  const userVal = toValue(user)
  return [
    [
      {
        type: 'label',
        label: userVal.name,
        avatar: userVal.avatar,
      },
    ],
    [{
      label: 'Profile',
      icon: 'i-lucide-user',
      to: '/profile',
    }],
    [{
      label: 'Theme',
      icon: 'i-lucide-palette',
      children: [{
        label: 'Primary',
        slot: 'chip',
        chip: appConfig.ui.colors.primary,
        content: {
          align: 'center',
          collisionPadding: 16,
        },
        children: colors.map(color => ({
          label: color,
          chip: color,
          slot: 'chip',
          checked: appConfig.ui.colors.primary === color,
          type: 'checkbox',
          onSelect: (e) => {
            e.preventDefault()

            appConfig.ui.colors.primary = color
          },
        })),
      }, {
        label: 'Neutral',
        slot: 'chip',
        chip: appConfig.ui.colors.neutral,
        content: {
          align: 'end',
          collisionPadding: 16,
        },
        children: neutrals.map(color => ({
          label: color,
          chip: color,
          slot: 'chip',
          type: 'checkbox',
          checked: appConfig.ui.colors.neutral === color,
          onSelect: (e) => {
            e.preventDefault()

            appConfig.ui.colors.neutral = color
          },
        })),
      }],
    }, {
      label: 'Appearance',
      icon: 'i-lucide-sun-moon',
      children: [{
        label: 'Light',
        icon: 'i-lucide-sun',
        type: 'checkbox',
        checked: colorMode.value === 'light',
        onSelect(e: Event) {
          e.preventDefault()

          colorMode.preference = 'light'
        },
      }, {
        label: 'Dark',
        icon: 'i-lucide-moon',
        type: 'checkbox',
        checked: colorMode.value === 'dark',
        onUpdateChecked(checked: boolean) {
          if (checked) {
            colorMode.preference = 'dark'
          }
        },
        onSelect(e: Event) {
          e.preventDefault()
        },
      }],
    }],
    [{
      label: 'Log out',
      icon: 'i-lucide-log-out',
      onSelect: logout,
    }],
  ]
})
</script>

<template>
  <UDropdownMenu
    v-if="items" :items="items" :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      v-bind="{
        ...user,
        label: collapsed ? undefined : user?.name,
        trailingIcon: collapsed ? undefined : 'i-lucide-chevrons-up-down',
      }"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated"
      :ui="{
        trailingIcon: 'text-dimmed',
      }"
    />

    <template #chip-leading="{ item }">
      <span
        :style="{ '--chip': `var(--color-${(item as any).chip}-400)` }"
        class="ms-0.5 size-2 rounded-full bg-(--chip)"
      />
    </template>
  </UDropdownMenu>
</template>
