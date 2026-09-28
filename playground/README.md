# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Database

The playground runs against the local Supabase that the `nuxt-galaxy` package
manages: `pnpm supabase:start` from the repository root brings it up.

Apply the schema from the package, then seed from here, where the CLI reads
this directory's `.env` for `GALAXY_DRIZZLE_DATABASE_URL`:

```bash
# from packages/nuxt-galaxy, after a schema change
pnpm drizzle:migrate

# from here; start from the example if you have no seed.json yet
cp ../packages/nuxt-galaxy/src/runtime/server/db/seed.example.json seed.json
pnpm exec nuxt-galaxy-seed seed.json --dry-run
pnpm exec nuxt-galaxy-seed seed.json
```

Seeding inserts instances, the Galaxy service users linked to them and the
role permissions, each ignoring a row that already exists, so running it again
is how a newly added permission is applied. It creates no accounts and runs no
migration.

`seed.json` carries a real instance URL and account email, so it is ignored by
git. It lives here rather than in the package because everything under the
package's `src/runtime/` is copied into `dist`, which is published to npm.

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.
