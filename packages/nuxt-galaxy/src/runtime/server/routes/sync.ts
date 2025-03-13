import type { Database } from '../../types/database'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { analyses } from '../db/schema/galaxy/analyses'
import { useDrizzle } from '../utils/drizzle'

import { synchronizeAnalyses } from '../utils/grizzle/analyses'

interface Target {
  (): Promise<void>
  isRunning: boolean
}

function setIntervalWithPromise(target: Target) {
  return async function () {
    if (target.isRunning)
      return
    // if we are here, we can invoke our callback!
    target.isRunning = true
    await target()
    target.isRunning = false
  }
}

export default defineEventHandler(async (event) => {
  const client = await serverSupabaseClient<Database>(event)
  const user = await serverSupabaseUser(event)
  let syncIntervalId: ReturnType<typeof setInterval> | undefined
  if (!syncIntervalId) {
    const setIntervalWithPromiseHandler = async (): Promise<void> => {
      await synchronizeAnalyses(client, user.id)
      const userAnalysesDb = await useDrizzle()
        .select()
        .from(analyses)
        .where(eq(analyses.ownerId, user.id))
      if (userAnalysesDb.every(d => d.isSync)) {
        stopSync()
      }
    }
    setIntervalWithPromiseHandler.isRunning = false
    syncIntervalId = setInterval(setIntervalWithPromise(setIntervalWithPromiseHandler), 6000)
  }

  function stopSync(): void {
    clearInterval(syncIntervalId)
  }
})
