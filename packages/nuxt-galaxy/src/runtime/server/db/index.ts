import process from 'node:process'
import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

config({ path: '.env' })

const client = postgres(process.env.GALAXY_DRIZZLE_DATABASE_URL!)
export const db = drizzle(client)
