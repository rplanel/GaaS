import process from 'node:process'
import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config({ path: '.env' })

export default defineConfig({
  schemaFilter: ['galaxy'],
  schema: './src/runtime/server/db/schema/galaxy/**/*.ts',
  out: './src/runtime/server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.GALAXY_DRIZZLE_DATABASE_URL!,
  },
})
