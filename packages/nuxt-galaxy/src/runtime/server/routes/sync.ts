import { serverSupabaseUser } from '#supabase/server'
import { GalaxyFetch, runWithConfig } from 'blendtype'
import { Console, Duration, Effect, Layer, Schedule } from 'effect'
import { defineEventHandler } from 'h3'
import { Drizzle } from '../utils/drizzle'
import { getAllAnalyses, synchronizeAnalysesEffect } from '../utils/grizzle/analyses'
import { ServerSupabaseClient } from '../utils/grizzle/supabase'

// Define a schedule that repeats the action 2 more times with a delay

// Repeat the action according to the schedule

// Run the program and log the number of repetitions

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user)
    return
  const policy = Schedule.addDelay(Schedule.recurs(50), () => Duration.seconds(5))

  const finalLayer = Layer.mergeAll(ServerSupabaseClient.Live, GalaxyFetch.Live, Drizzle.Live)
  // Define an effect that logs a message to the console
  // synchronizeAnalyses(event, user.id)
  const action = Effect.gen(function* () {
    yield* synchronizeAnalysesEffect(event, user.id)

    const analysisDb = yield* getAllAnalyses(user.id)

    if (analysisDb.every(d => d.isSync)) {
      yield* Effect.interrupt
    }
  }).pipe(Effect.catchAll(() => Effect.succeed('All analyses are synchronized')))

  const program = Effect.gen(function* () {
    yield* Effect.addFinalizer(exit =>
      Console.log(`Finalizer executed. Exit status: ${exit._tag}`),
    )
    yield* Effect.repeat(action, policy)
  })
  const runnable = Effect.scoped(program)
  runnable.pipe(
    Effect.provide(finalLayer),
    runWithConfig,
  )
},

)
