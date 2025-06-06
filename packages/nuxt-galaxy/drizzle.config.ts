import process from 'node:process'
import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config({ path: '.env' })

export default defineConfig({
  schemaFilter: ['galaxy'],
  schema: './src/runtime/server/db/schema/galaxy',
  out: './supabase/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.GALAXY_DRIZZLE_DATABASE_URL!,
  },
  migrations: {
    prefix: 'supabase',
  },
})
