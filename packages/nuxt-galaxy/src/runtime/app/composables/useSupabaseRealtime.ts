import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Database } from '../../types/database'
import { onMounted, onUnmounted, useSupabaseClient } from '#imports'
import { log } from 'evlog/client'

interface ChannelData {
  count: number
  channel: RealtimeChannel
  eventHandlers: Array<() => void>
}

const channels: Record<string, ChannelData> = {}

/**
 * A composable function to manage Supabase realtime subscriptions.
 * It allows subscribing to a specific channel and table, and handles
 * the event when changes occur in the specified table.
 *
 * This composable refreshes displayed Supabase rows only and must not trigger
 * Galaxy sync state mutations. The `galaxy:sync-analyses` scheduled task is the
 * sole owner of sync-state changes.
 *
 * @param channelName - The name of the channel to subscribe to.
 * @param tableName - The name of the table to listen for changes.
 * @param eventHandler - The function to call when an event occurs.
 */
export function useSupabaseRealtime(
  channelName: string,
  tableName: string,
  eventHandler: () => void,
) {
  const supabase = useSupabaseClient<Database>()

  function subscribe() {
    // Initialize the channel if it doesn't exist
    if (!channels[channelName]) {
      const channel = supabase.channel(channelName)
      channels[channelName] = {
        channel,
        count: 0,
        eventHandlers: [],
      }
      log.info({
        message: 'subscribing to Supabase realtime channel',
        tag: 'useSupabaseRealtime',
        channelName,
        tableName,
      })
      channel
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'galaxy',
            table: tableName,
          },
          () => {
            channels[channelName]?.eventHandlers.forEach(handler => handler())
          },
        )
        .subscribe()
    }
    const channelData = channels[channelName]
    channelData.count++
    // Add the event handler to the channel only if not already registered
    if (!channelData.eventHandlers.includes(eventHandler)) {
      channelData.eventHandlers.push(eventHandler)
    }

    // Subscribe to the channel only once
  }

  function unsubscribe() {
    log.info({
      message: 'unsubscribing from Supabase realtime channel',
      tag: 'useSupabaseRealtime',
      channelName,
    })
    const channelData = channels[channelName]
    if (!channelData) {
      return
    }
    channelData.count--
    channelData.eventHandlers = channelData.eventHandlers.filter(h => h !== eventHandler)
    if (channelData.count <= 0) {
      supabase.removeChannel(channelData.channel)
      delete channels[channelName]
    }
  }
  onMounted(() => {
    subscribe()
  })

  onUnmounted(() => {
    unsubscribe()
  })
}
