import process from 'node:process'
import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config({ path: '.env' })

export default defineConfig({
  schemaFilter: ['galaxy_rbac'],
  schema: './src/runtime/server/db/schema/galaxyRbac/**/*.ts',
  out: './src/runtime/server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.GALAXY_DRIZZLE_DATABASE_URL!,
  },
})
