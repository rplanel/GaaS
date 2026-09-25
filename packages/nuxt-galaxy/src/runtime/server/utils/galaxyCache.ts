import type { GalaxyTool, GalaxyWorkflow } from 'blendtype'
// `useStorage` is one of Nitro's auto-imports, and `#imports` has it wherever
// this file actually runs. The package typechecks its server code against the
// *app*'s `#imports`, which does not — one tsconfig for both halves of the
// runtime, which is wider a problem than this file. It is the only name this
// file takes from there, so the suppression covers nothing else, and it is
// pinned to `GalaxyCacheStore` at the use site below so what is bought is
// silence about one name rather than about the value's shape. When the
// tsconfig split lands this starts erroring as unused, which is the reminder.
// @ts-expect-error -- see above
import { useStorage } from '#imports'
import { Effect } from 'effect'
import { GALAXY_CACHE_MOUNT } from './galaxyCacheMount'

/**
 * One part of a cache key, percent-encoded.
 *
 * unstorage normalises a key before it reaches the driver: it truncates at
 * the first `?`, turns every `/` into `:` and collapses runs of `:`. A Galaxy
 * URL and a toolshed guid carry both separators, so two distinct keys can
 * normalise to one — and a `?` anywhere would silently cut the rest of the
 * key off. Encoding each part first leaves the key readable, keeps it one
 * segment, and puts those collisions out of reach.
 */
function part(value: string): string {
  return encodeURIComponent(value)
}

/**
 * Where one tool definition is cached: the Galaxy it came from, its id, and
 * **the version Galaxy served** — never the version asked for (Q16).
 *
 * `GET /api/tools/{id}?tool_version=` resolves through `get_tool` without
 * `exact`, so Galaxy answers 200 with another installed version when it lacks
 * the one requested (#75). Written under the asked-for key, that answer would
 * serve the wrong tool's parameters for ever, since this cache has no expiry
 * to heal it. Written under the served version, it is simply the right entry
 * for a caller that pins *that* version, and installing the missing version
 * later fills a fresh key rather than being shadowed by a poisoned one.
 *
 * The Galaxy URL is part of the key because two deployments may share one
 * Redis, and a built-in tool id (`Cut1`) carries no toolshed path to tell
 * them apart.
 */
export function toolCacheKey(galaxyUrl: string, toolId: string, servedVersion: string): string {
  return `tool|${part(galaxyUrl)}|${part(toolId)}@${part(servedVersion)}`
}

/**
 * Where one revision of one workflow is cached (Q15).
 *
 * The `workflow|` prefix is what keeps the two families apart: without it a
 * tool called `wf-7` at version `3` and revision 3 of workflow `wf-7` name
 * the same entry, and a workflow read would be answered with a tool — whose
 * `steps` is `undefined`, so it would describe a revision with no steps and
 * cache that for ever.
 *
 * A pinned revision is immutable, which is what makes caching it for ever
 * correct. There is deliberately no key for the unpinned read: it answers
 * whatever Galaxy's latest revision is, which moves the moment someone saves
 * in the editor, and the endpoint gives it no route.
 */
export function workflowCacheKey(galaxyUrl: string, workflowId: string, revision: number): string {
  return `workflow|${part(galaxyUrl)}|${part(workflowId)}@${revision}`
}

/**
 * The little of a Nitro storage mount this cache uses, so that a caller can
 * hand a fake in without building one.
 */
export interface GalaxyCacheStore {
  getItem: (key: string) => Promise<unknown>
  setItem: (key: string, value: unknown) => Promise<unknown>
}

/**
 * The cache the description endpoint reads and fills.
 *
 * Neither side can fail the request. A miss, a disabled cache and a store
 * that threw are one answer — `undefined`, fetch it — and a write nobody
 * accepted costs the next request a round trip and nothing else.
 */
export interface GalaxyCache {
  readonly tool: (galaxyUrl: string, toolId: string, version: string) => Effect.Effect<GalaxyTool | undefined>
  readonly writeTool: (galaxyUrl: string, toolId: string, servedVersion: string, tool: GalaxyTool) => Effect.Effect<void>
  readonly workflow: (galaxyUrl: string, workflowId: string, revision: number) => Effect.Effect<GalaxyWorkflow | undefined>
  readonly writeWorkflow: (galaxyUrl: string, workflowId: string, revision: number, workflow: GalaxyWorkflow) => Effect.Effect<void>
}

/** A cache that remembers nothing, for the deployment that turned it off. */
export const noGalaxyCache: GalaxyCache = {
  tool: () => Effect.succeed(undefined),
  writeTool: () => Effect.void,
  workflow: () => Effect.succeed(undefined),
  writeWorkflow: () => Effect.void,
}

function read<T>(store: GalaxyCacheStore, key: string): Effect.Effect<T | undefined> {
  return Effect.tryPromise(() => store.getItem(key)).pipe(
    Effect.map(value => (value ?? undefined) as T | undefined),
    Effect.catchAll(() => Effect.succeed(undefined)),
  )
}

function write(store: GalaxyCacheStore, key: string, value: unknown): Effect.Effect<void> {
  return Effect.tryPromise(() => store.setItem(key, value)).pipe(
    Effect.asVoid,
    Effect.catchAll(() => Effect.void),
  )
}

/** The cache backed by `store`, whatever that store is. */
export function makeGalaxyCache(store: GalaxyCacheStore): GalaxyCache {
  return {
    tool: (galaxyUrl, toolId, version) => read<GalaxyTool>(store, toolCacheKey(galaxyUrl, toolId, version)),
    writeTool: (galaxyUrl, toolId, servedVersion, tool) => write(store, toolCacheKey(galaxyUrl, toolId, servedVersion), tool),
    workflow: (galaxyUrl, workflowId, revision) => read<GalaxyWorkflow>(store, workflowCacheKey(galaxyUrl, workflowId, revision)),
    writeWorkflow: (galaxyUrl, workflowId, revision, workflow) => write(store, workflowCacheKey(galaxyUrl, workflowId, revision), workflow),
  }
}

/**
 * The cache the module mounted, or one that remembers nothing when the
 * deployment set `galaxy.cache.enabled` to false.
 *
 * Turning it off is the escape hatch, and the only one: there is no expiry
 * and no runtime invalidation. Galaxy treats a tool's version string as its
 * identity — that is what `require_exact_tool_versions` compares — so a tool
 * changed under a fixed version is an upstream identity problem rather than
 * one to paper over with a TTL here.
 *
 * `enabled` is passed in rather than read here so that this file takes one
 * name from `#imports` instead of two; the handler reads the runtime config
 * already, for the Galaxy URL the keys are built from.
 */
export function useGalaxyCache(enabled: boolean): GalaxyCache {
  if (!enabled) {
    return noGalaxyCache
  }
  const store: GalaxyCacheStore = useStorage(GALAXY_CACHE_MOUNT)
  return makeGalaxyCache(store)
}
