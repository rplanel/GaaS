import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface Migration {
  name: string
  sql: string
}

export interface RoutineNotRevokedFromPublic {
  migration: string
  routine: string
}

type RoutineKind = 'function' | 'procedure'

const SCHEMA = 'galaxy'
const STATEMENT_BREAKPOINT = '--> statement-breakpoint'

// The patterns read statements whose whitespace is collapsed to single spaces.
const IDENTIFIER = String.raw`"(?:[^"]|"")+"|[a-z_][\w$]*`
const QUALIFIED_NAME = String.raw`(?<schema>${IDENTIFIER}) ?\. ?(?<name>${IDENTIFIER})`
const LEADING_NAME = new RegExp(String.raw`^${QUALIFIED_NAME}`, 'i')
const CREATE_ROUTINE = new RegExp(String.raw`^create (?:or replace )?(?<kind>function|procedure|aggregate) ${QUALIFIED_NAME} ?\(`, 'i')
const ON_SCHEMA = /^all (?<kinds>functions|procedures|routines) in schema (?<schemas>.+)$/i
const ON_ROUTINES = /^(?:function|procedure|routine) (?<routines>.+)$/i
const DOLLAR_QUOTE = /\$(?:[a-z_]\w*)?\$/iy

// GRANT reads an aggregate as a function.
const KIND_CREATED: Record<string, RoutineKind> = {
  function: 'function',
  aggregate: 'function',
  procedure: 'procedure',
}

// ALL FUNCTIONS leaves the procedures, and ALL PROCEDURES the functions.
const KINDS_COVERED: Record<string, readonly RoutineKind[]> = {
  functions: ['function'],
  procedures: ['procedure'],
  routines: ['function', 'procedure'],
}

// An unquoted identifier folds to lower case, a quoted one is taken as written.
function foldIdentifier(text: string): string {
  return text.startsWith('"') ? text.slice(1, -1).replaceAll('""', '"') : text.toLowerCase()
}

// The statements of a migration, with each comment blanked to a space, each
// string literal to '' and each dollar-quoted body to $$, so that what they
// hold is never read as a statement. Whitespace outside a quoted identifier
// collapses to one space.
function statements(sql: string): string[] {
  const found: string[] = []
  let text = ''
  const endStatement = () => {
    if (text.trim()) {
      found.push(text.trim())
    }
    text = ''
  }
  const space = () => {
    if (!text.endsWith(' ')) {
      text += ' '
    }
  }
  let i = 0
  while (i < sql.length) {
    DOLLAR_QUOTE.lastIndex = i
    const dollarQuote = /\w/.test(sql[i - 1] ?? '') ? null : DOLLAR_QUOTE.exec(sql)
    if (dollarQuote) {
      const end = sql.indexOf(dollarQuote[0], i + dollarQuote[0].length)
      i = end === -1 ? sql.length : end + dollarQuote[0].length
      text += '$$'
    }
    else if (sql[i] === '\'') {
      // An E'…' string escapes with a backslash, any other doubles the quote.
      const escapes = /(?:^|[^\w$])e$/i.test(sql.slice(Math.max(0, i - 2), i))
      i++
      while (i < sql.length) {
        if (escapes && sql[i] === '\\') {
          i += 2
        }
        else if (sql.startsWith('\'\'', i)) {
          i += 2
        }
        else if (sql[i] === '\'') {
          i++
          break
        }
        else {
          i++
        }
      }
      text += '\'\''
    }
    else if (sql[i] === '"') {
      // A quoted identifier is kept as written, doubled quotes included.
      const start = i
      i++
      while (i < sql.length && !(sql[i] === '"' && sql[i + 1] !== '"')) {
        i += sql.startsWith('""', i) ? 2 : 1
      }
      i++
      text += sql.slice(start, i)
    }
    else if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i)
      i = end === -1 ? sql.length : end
      space()
    }
    else if (sql.startsWith('/*', i)) {
      // Postgres nests block comments.
      let depth = 0
      do {
        if (sql.startsWith('/*', i)) {
          depth++
          i += 2
        }
        else if (sql.startsWith('*/', i)) {
          depth--
          i += 2
        }
        else {
          i++
        }
      } while (depth > 0 && i < sql.length)
      space()
    }
    else if (sql[i] === ';') {
      endStatement()
      i++
    }
    else if (/\s/.test(sql[i]!)) {
      space()
      i++
    }
    else {
      text += sql[i]
      i++
    }
  }
  endStatement()
  return found
}

// The text with each quoted identifier's inside blanked to underscores, so
// that a keyword, comma or parenthesis a name holds is not found. Every
// position is kept, so an index into it is an index into the text.
function maskQuoted(text: string): string {
  return text.replace(/"(?:[^"]|"")*"/g, quoted => `"${'_'.repeat(quoted.length - 2)}"`)
}

// Splits a list on its top-level commas, so an argument list stays whole.
function listItems(list: string): string[] {
  const masked = maskQuoted(list)
  const items: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === '(') {
      depth++
    }
    else if (masked[i] === ')') {
      depth--
    }
    else if (masked[i] === ',' && depth === 0) {
      items.push(list.slice(start, i).trim())
      start = i + 1
    }
  }
  items.push(list.slice(start).trim())
  return items
}

function qualifiedName({ schema, name }: Record<string, string>): string {
  return `${foldIdentifier(schema!)}.${foldIdentifier(name!)}`
}

// What a REVOKE that takes a privilege from PUBLIC is on, the text between
// its ON and its FROM, or undefined for any other statement. GRANT OPTION FOR
// takes away only the right to grant on, which leaves the privilege itself in
// place.
function objectsRevokedFromPublic(statement: string): string | undefined {
  const masked = maskQuoted(statement)
  if (!/^revoke /i.test(masked) || /^revoke grant option for /i.test(masked)) {
    return undefined
  }
  const on = masked.search(/ on /i)
  const from = on === -1 ? undefined : [...masked.matchAll(/ from /gi)].find(match => match.index > on)?.index
  if (from === undefined) {
    return undefined
  }
  // The last grantee may be followed by GRANTED BY and by CASCADE or RESTRICT.
  // A role named public is PUBLIC, quoted or not, with or without GROUP.
  const grantees = listItems(statement.slice(from + ' from '.length))
    .map(grantee => foldIdentifier(grantee.replace(/^group /i, '').split(' ')[0]!))
  return grantees.includes('public')
    ? statement.slice(on + ' on '.length, from)
    : undefined
}

const MIGRATIONS = fileURLToPath(new URL('../../../src/runtime/server/db/migrations', import.meta.url))

// In the order drizzle applies them: its readMigrationFiles sorts the folders
// by name with localeCompare and reads the migration.sql of each.
export function readMigrations(): Migration[] {
  return readdirSync(MIGRATIONS)
    .filter(name => existsSync(join(MIGRATIONS, name, 'migration.sql')))
    .sort((a, b) => a.localeCompare(b))
    .map(name => ({ name, sql: readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf8') }))
}

/**
 * The `galaxy` routines the migrations create and no later revoke from PUBLIC
 * covers, each with the migration that last created it (#173).
 *
 * Postgres lets PUBLIC execute a routine from the moment it is created, and no
 * default privilege per schema takes that back (20261019120528_api_role_grants
 * says why), so each migration that adds a routine revokes it itself. A revoke
 * covers a routine when it takes EXECUTE or ALL from PUBLIC and either names
 * the routine or is ON ALL … IN SCHEMA galaxy, which covers only the routines
 * that exist when it runs. Every CREATE OR REPLACE counts as a new routine,
 * and an aggregate counts as a function, as GRANT reads it.
 *
 * This reads SQL text, so that CI can run it without a database.
 * apiRoles.test.ts reads the privileges themselves and stays the authority
 * wherever a database runs. What the text does not show:
 * - overloads share their name here, so a revoke of one covers the others;
 * - a routine named without its schema, one created inside a DO block or by
 *   dynamic SQL, and one moved into galaxy by ALTER … SET SCHEMA go unseen;
 * - a later GRANT … TO PUBLIC is not read;
 * - DROP and RENAME are not read either, so a routine dropped or renamed
 *   before any revoke is still named, which errs the safe way.
 */
export function routinesNotRevokedFromPublic(migrations: readonly Migration[]): RoutineNotRevokedFromPublic[] {
  const uncovered = new Map<string, RoutineNotRevokedFromPublic & { kind: RoutineKind }>()
  for (const migration of migrations) {
    // As drizzle does, which runs each chunk on its own.
    for (const statement of migration.sql.split(STATEMENT_BREAKPOINT).flatMap(statements)) {
      const created = CREATE_ROUTINE.exec(statement)?.groups
      if (created && foldIdentifier(created.schema!) === SCHEMA) {
        const routine = qualifiedName(created)
        uncovered.set(routine, { migration: migration.name, routine, kind: KIND_CREATED[created.kind!.toLowerCase()]! })
        continue
      }
      const objects = objectsRevokedFromPublic(statement)
      if (objects === undefined) {
        continue
      }
      const inSchema = ON_SCHEMA.exec(objects)?.groups
      if (inSchema && listItems(inSchema.schemas!).map(foldIdentifier).includes(SCHEMA)) {
        const kinds = KINDS_COVERED[inSchema.kinds!.toLowerCase()]!
        for (const [routine, { kind }] of uncovered) {
          if (kinds.includes(kind)) {
            uncovered.delete(routine)
          }
        }
      }
      const named = ON_ROUTINES.exec(objects)?.groups
      for (const item of named ? listItems(named.routines!) : []) {
        const name = LEADING_NAME.exec(item)?.groups
        if (name) {
          uncovered.delete(qualifiedName(name))
        }
      }
    }
  }
  return [...uncovered.values()].map(({ migration, routine }) => ({ migration, routine }))
}
