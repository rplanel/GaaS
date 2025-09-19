import type { RealtimeChannel } from '@supabase/supabase-js'

import type { Database } from '../../types/database'
import { onMounted, onUnmounted, useSupabaseClient } from '#imports'

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
      channel
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'galaxy',
            table: tableName,
          },
          () => {
            // console.log(`Received event on channel: ${channelName}`)
            eventHandler()
          },
        )
        .subscribe()
      // console.log(`Subscribing to Supabase realtime channel: ${channelName}`)
    }
    const channelData = channels[channelName]
    channelData.count++
    // Add the event handler to the channel
    channelData.eventHandlers = [...channels[channelName].eventHandlers, eventHandler]

    // channelData.channel.on(
    //   'postgres_changes',
    //   {
    //     event: '*',
    //     schema: 'galaxy',
    //     table: tableName,
    //   },
    //   () => channelData.eventHandlers.forEach((handler) => {
    //     console.log(`Executing event handler for channel: ${channelName}`)
    //     console.log(`Table: ${tableName}`)
    //     handler()
    //   }),
    // )

    // Subscribe to the channel only once
  }

  function unsubscribe() {
    // console.log(`Unsubscribing from Supabase realtime channel: ${channelName}`)
    if (channelName in channels) {
      const channelData = channels[channelName]
      if (!channelData) {
        return
      }
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
