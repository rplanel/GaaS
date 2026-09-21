import type { RealtimeChannel } from '@supabase/supabase-js'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { log } from 'evlog/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useSupabaseRealtime } from '../../../src/runtime/app/composables/useSupabaseRealtime'

type MockChannel = Omit<RealtimeChannel, 'on' | 'subscribe'> & {
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
  _triggerEvent: () => void
}

function createMockSupabase() {
  return {
    channel: vi.fn((_name: string): MockChannel => {
      const listeners: Array<() => void> = []
      const channel: MockChannel = {
        on: vi.fn((_event: string, _filter: unknown, callback: () => void) => {
          listeners.push(callback)
          return channel
        }),
        subscribe: vi.fn().mockReturnThis(),
        _triggerEvent: () => listeners.forEach(callback => callback()),
      } as unknown as MockChannel
      return channel
    }),
    removeChannel: vi.fn(),
  }
}

const mockSupabase = createMockSupabase()

mockNuxtImport('useSupabaseClient', () => () => mockSupabase)

const TestComponent = defineComponent({
  props: {
    channelName: { type: String, required: true },
    tableName: { type: String, required: true },
    handler: { type: Function, required: true },
  },
  setup(props) {
    useSupabaseRealtime(props.channelName, props.tableName, props.handler as () => void)
    return () => h('div')
  },
})

describe('useSupabaseRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shares one channel across multiple subscribers', async () => {
    const channelName = 'shared-channel'
    const tableName = 'test-table'
    const handler1 = vi.fn()
    const handler2 = vi.fn()

    await mountSuspended(TestComponent, {
      props: { channelName, tableName, handler: handler1 },
    })
    await mountSuspended(TestComponent, {
      props: { channelName, tableName, handler: handler2 },
    })

    expect(mockSupabase.channel).toHaveBeenCalledTimes(1)
    expect(mockSupabase.channel).toHaveBeenCalledWith(channelName)
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('subscribing'),
        channelName,
        tableName,
      }),
    )
  })

  it('removes channel only after last subscriber unsubscribes', async () => {
    const channelName = 'lifecycle-channel'
    const tableName = 'test-table'
    const handler1 = vi.fn()
    const handler2 = vi.fn()

    const wrapper1 = await mountSuspended(TestComponent, {
      props: { channelName, tableName, handler: handler1 },
    })
    const wrapper2 = await mountSuspended(TestComponent, {
      props: { channelName, tableName, handler: handler2 },
    })

    expect(mockSupabase.channel).toHaveBeenCalledTimes(1)

    await wrapper1.unmount()
    expect(mockSupabase.removeChannel).not.toHaveBeenCalled()

    await wrapper2.unmount()
    expect(mockSupabase.removeChannel).toHaveBeenCalledTimes(1)
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('unsubscribing'),
        channelName,
      }),
    )
  })

  it('broadcasts postgres_changes events to all registered handlers', async () => {
    const channelName = 'broadcast-channel'
    const handler1 = vi.fn()
    const handler2 = vi.fn()

    await mountSuspended(TestComponent, {
      props: { channelName, tableName: 'test-table', handler: handler1 },
    })
    const wrapper2 = await mountSuspended(TestComponent, {
      props: { channelName, tableName: 'test-table', handler: handler2 },
    })

    const channel = mockSupabase.channel.mock.results[0]?.value as MockChannel
    channel._triggerEvent()

    expect(handler1).toHaveBeenCalledTimes(1)
    expect(handler2).toHaveBeenCalledTimes(1)

    await wrapper2.unmount()
  })
})
