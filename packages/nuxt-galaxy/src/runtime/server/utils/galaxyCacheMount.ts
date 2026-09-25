/**
 * The Nitro storage mount the Galaxy description cache lives in (#87, Q15,
 * Q16).
 *
 * A mount rather than an in-process map: this package is distributed, and a
 * consumer running more than one replica needs one cache behind all of them.
 * The module mounts it with the memory driver by default and exposes the
 * mount's options so a deployment can point it at Redis instead.
 *
 * Alone in this file because `module.ts` names the mount and the runtime
 * reads it, and everything else in `galaxyCache.ts` imports `#imports`,
 * which the module build cannot resolve.
 */
export const GALAXY_CACHE_MOUNT = 'galaxy-cache'
