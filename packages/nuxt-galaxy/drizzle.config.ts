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
    url: process.env.DATABASE_URL!,
  },
  migrations: {
    prefix: 'supabase',
  },
})
