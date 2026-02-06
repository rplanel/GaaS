import process from 'node:process'
import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import { Context, Layer } from 'effect'
import postgres from 'postgres'

export { and, eq, or, sql } from 'drizzle-orm'

config({ path: '.env' })

const client = postgres(process.env.GALAXY_DRIZZLE_DATABASE_URL!)

export function useDrizzle() {
  return drizzle({ client })
}

export class Drizzle extends Context.Tag('@nuxt-galaxy/Drizzle')<
  Drizzle,
  ReturnType<typeof drizzle>
>() {
  static readonly Live = Layer.succeed(
    Drizzle,
    drizzle({ client }),
  )
}
