# Database Schema & Migrations Documentation

This directory contains the Drizzle ORM schema definitions and database migrations for the nuxt-galaxy project.

## Schema Structure

The database schema is organized into separate directories:

```
src/runtime/server/db/schema/
├── galaxy/           # Main application schema (tables, views, RLS policies)
├── galaxyRbac/       # RBAC schema (roles, permissions, user_roles)
├── storage/          # Supabase storage objects (external)
└── auth/             # Authentication users (external)
```

## Migration Order (Critical!)

⚠️ **Important:** Migrations must be generated/applied in the following order due to dependencies:

1. **Schema migrations should NOT include functions that reference tables**
2. **Custom SQL migrations should handle function creation**
3. **Order matters:** RBAC schema → Functions → Galaxy schema → Policies

## Regenerating Migrations from Scratch

To regenerate all migrations (useful for major schema changes), follow these steps:

### Prerequisites

- Clear the `/migrations/` directory
- Ensure your PostgreSQL database is accessible
- Have `dotenv` configured with database credentials

### Step-by-Step Migration Process

#### Step 1: Create Custom Migration for Buckets

```bash
cd packages/nuxt-galaxy
npx drizzle-kit generate --custom --name=buckets
# Edit the generated migration.sql to add:
# - CREATE TABLE storage.buckets ...
# - Grant permissions
```

This creates buckets table in the storage schema for Supabase file storage.

#### Step 2: Generate RBAC Schema Migration

```bash
npx drizzle-kit generate --config=drizzle.config.rbac.ts
```

This generates the `galaxy_rbac` schema with:

- `roles` table
- `user_roles` table
- `role_permissions` table
- Enums: `role_type`, `role_permissions_type`

**Dependencies:** None (creates foundational schema)

#### Step 3: Create Custom Migration for RBAC Functions and Seed Data

```bash
npx drizzle-kit generate --custom --name=rbac-functions
# Edit the migration.sql to add:
#   1. Seed roles (admin, user) into galaxy_rbac.roles table
#   2. custom_access_token_hook function
#   3. authorize function
#   4. Grants for supabase_auth_admin
```

**Critical:** This migration should include:

```sql
-- Insert admin and user roles into the roles table
insert into galaxy_rbac.roles (name) values ('admin');
insert into galaxy_rbac.roles (name) values ('user');
```

**Functions created:**

- `galaxy_rbac.authorize()` - Used by RLS policies to check role-based permissions
- `galaxy_rbac.custom_access_token_hook()` - Adds role claims to JWT tokens

**Important:** The `admin` role here is a **data entry** in the `galaxy_rbac.roles` table, NOT a PostgreSQL role. RLS policies check it via the `authorize()` function, not via `pgRole()`.

**Note:** Functions reference `galaxy_rbac.*` tables/types, so this MUST run AFTER step 2.

#### Step 4: Generate Galaxy Schema Migration

```bash
npx drizzle-kit generate --config=drizzle.config.ts
```

This generates the main `galaxy` schema with:

- All application tables (analyses, datasets, histories, etc.)
- Views with security invoker
- RLS policies that reference `galaxy_rbac.authorize()`

**Dependencies:** Steps 2 AND 3 (needs both tables AND functions to exist)

#### Step 5: Create Custom Migration for Realtime Publication

```bash
npx drizzle-kit generate --custom --name=realtime-publication
# Edit migration.sql to add:
# - ALTER PUBLICATION supabase_realtime ADD TABLE galaxy.tablename;
# - Repeat for each table: analyses, histories, jobs, analysis_outputs
```

Enables Supabase realtime subscriptions for specific tables.

#### Step 6: Create Custom Migration for Schema Grants

```bash
npx drizzle-kit generate --custom --name=schema-grants
# Edit migration.sql to add:
# - GRANT USAGE ON SCHEMA galaxy TO anon, authenticated, service_role;
# - Similarly for galaxy_rbac schema
# - Default privileges for postgres role
```

Grants necessary permissions to Supabase roles.

#### Step 7: Create Custom Migration for Storage RLS

```bash
npx drizzle-kit generate --custom --name=storage-rls
# Edit migration.sql to add:
# - ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
# - CREATE POLICY ... FOR storage.objects with bucket_id = 'analysis_files'
```

Adds row-level security policies to Supabase storage objects.

## Configuration Files

### `drizzle.config.rbac.ts`

```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schemaFilter: ['galaxy_rbac'],
  schema: './src/runtime/server/db/schema/galaxyRbac/**/*.ts',
})
```

Used for generating RBAC schema migrations (step 2).

### `drizzle.config.ts`

```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schemaFilter: ['galaxy_rbac', 'galaxy'],
  schema: './src/runtime/server/db/schema/**/*.ts',
})
```

Used for generating Galaxy schema migrations (step 4).

## Apply Migrations

After generating all migrations, apply them in order:

```bash
cd packages/nuxt-galaxy
npx drizzle-kit migrate
```

## Migration Naming

Migration folders follow this pattern:

```
YYYYmmddHHMMSS_descriptive_name/
├── migration.sql
└── snapshot.json
```

If you need to rename a migration to change execution order:

```bash
mv migrations/20260206104920_rbac-functions migrations/20260206105500_rbac-functions
```

⚠️ **Warning:** Only rename migrations that haven't been applied. Renaming applied migrations will cause conflicts.

## Troubleshooting

### "Cannot access 'analyses' before initialization"

This error occurs when there's a circular dependency. Check:

1. Ensure imports don't create cycles
2. Verify RBAC functions exist before being referenced
3. Check migration order timestamps

### "Function does not exist"

The RBAC functions migration must run before policies that reference `authorize()`. Check:

1. Migration timestamp order (rbac-functions < galaxy)
2. Functions are defined in the migration.sql file
3. Schema exists before function creation

### "Role 'admin' does not exist"

The admin role data must exist in the `galaxy_rbac.roles` table before policies reference it.

**Important:** There are two different "admin" concepts:

1. **`galaxy_rbac.roles` table entry** - Application-level role used by the `authorize()` function
2. **`supabase_auth_admin`** PostgreSQL role - Supabase system role for authentication

The rbac-functions migration should seed the application roles:

```sql
-- Insert into galaxy_rbac.roles table (NOT a PostgreSQL role!)
insert into galaxy_rbac.roles (name) values ('admin');
insert into galaxy_rbac.roles (name) values ('user');
```

**In schema files:** All policies use `authenticatedRole`. The `authorize()` function checks roles at runtime by querying the `galaxy_rbac.roles` table.

## Seeding Data

After all migrations are applied, seed the database with required parameters:

```bash
npx ts-node src/runtime/server/db/seed.ts --url "https://usegalaxy.org" --name "Galaxy Main"
```

Or with short flags:

```bash
npx ts-node src/runtime/server/db/seed.ts -u "https://usegalaxy.org" -n "Galaxy Main"
```

### Required Parameters

- `--url` / `-u`: Galaxy instance URL (required)
- `--name` / `-n`: Galaxy instance name (required)

### Optional Parameters

- `--userEmail` / `-e`: User email to create an initial user (optional)

### Example with all parameters

```bash
npx ts-node src/runtime/server/db/seed.ts \
  --url "https://usegalaxy.org" \
  --name "Galaxy Main" \
  --userEmail "user@example.com"
```

### What gets seeded

The seed creates:

- **Galaxy instance** with the provided URL and name (e.g., `usegalaxy.org`)
- **Initial user** (if `--userEmail` provided) linked to the instance
- **Role permissions** - Links admin role to permissions like:
  - `workflows.insert`, `workflows.delete`
  - `instances.insert`, `instances.delete`
  - `users.delete`

**Prerequisites:**

- Roles (`admin`, `user`) must already exist in `galaxy_rbac.roles` table (created in Step 3 migration)
- The seed only creates the `role_permissions` junction entries linking roles to permissions

## Schema Files

Key files to understand:

- `schema/galaxy/index.ts` - Galaxy schema definition
- `schema/galaxyRbac/index.ts` - RBAC schema definition
- `schema/galaxyRbac/roles.ts` - Roles table (contains 'admin', 'user' data)
- `schema/galaxyRbac/userRoles.ts` - User-roles junction
- `schema/storage/objects.ts` - Storage policies (external table)

### How Admin Access Works in RLS Policies

In schema files like `workflows.ts`, `instances.ts`, or `users.ts`:

```typescript
import { authenticatedRole } from 'drizzle-orm/supabase';

// All policies use authenticatedRole (any authenticated user)
(pgPolicy('Users can query instances', {
  for: 'select',
  to: authenticatedRole,
  using: sql`true`, // Public access for SELECT
}),
pgPolicy('Admin can insert instances', {
  for: 'insert',
  to: authenticatedRole, // Any authenticated user can try to insert
  withCheck: sql`(SELECT galaxy_rbac.authorize('instances.insert')) = TRUE`, // But authorize() checks if they have admin role
}))
```

**How it works:**

1. All policies grant access to `authenticatedRole` (any logged-in Supabase user)
2. The **access control** happens in the `withCheck`/`using` SQL via `authorize()` function
3. `authorize()` checks the user's JWT token (set by `custom_access_token_hook`) for the `user_role` claim
4. It queries `galaxy_rbac.role_permissions` to verify if the user has the required permission

**Key points:**

- No `pgRole('admin')` is used - all policies use `authenticatedRole`
- The "admin" check is done at **runtime** via the `authorize()` function
- The `authorize()` function checks the `galaxy_rbac.roles` and `role_permissions` tables
- This allows dynamic permission checking without modifying PostgreSQL roles

## Best Practices

1. **Always create custom migrations for functions** - Don't put PL/pgSQL functions in schema files
2. **Check migration order** - Run `ls migrations/ | sort` to verify
3. **Test in order** - Use `drizzle-kit migrate` to test all in sequence
4. **Clean slate** - For major changes, clear migrations and regenerate all
5. **Document dependencies** - Add comments in custom migrations explaining order constraints

## Contributing

When adding new schema:

1. If it needs RBAC: Put in `galaxyRbac/` folder, use `rbac` config
2. If it's application data: Put in `galaxy/` folder, use main or `galaxy` config
3. If it needs functions: Create custom migration AFTER its dependencies
4. Always test migrations in order before committing

Questions? Check the existing migrations for examples!
