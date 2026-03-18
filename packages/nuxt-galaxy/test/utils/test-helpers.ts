import type { Component } from 'vue'
import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'

interface MountOptions {
  props?: Record<string, unknown>
  slots?: Record<string, unknown>
  global?: Record<string, unknown>
}

/**
 * Mounts a Vue component with Pinia and Pinia Colada plugins
 * Required for testing components that use @pinia/colada queries
 *
 * Note: DO NOT use createTestingPinia() - it stubs Pinia actions
 * which breaks Pinia Colada's internal stores
 */
export function mountWithPlugins(component: Component, options: MountOptions = {}) {
  return mount(component, {
    global: {
      plugins: [createPinia(), PiniaColada],
      ...options.global,
    },
    props: options.props,
    slots: options.slots,
  })
}

/**
 * Waits for all promises to resolve
 * Use after triggering async operations
 */
export { flushPromises }

/**
 * Creates a simple test component that uses a composable
 * Useful for testing composables that require Vue context
 */
export function createTestComponent(setupFn: () => Record<string, unknown>): Component {
  return {
    setup() {
      const result = setupFn()
      return { ...result }
    },
    template: '<div />',
  }
}
