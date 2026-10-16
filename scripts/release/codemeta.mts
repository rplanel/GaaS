/**
 * The updater `.versionrc.json` names for `codemeta.json`, so that a release
 * bumps its `version` with the packages' and dates it in `dateModified`.
 * commit-and-tag-version loads it with `require`, which Node 22.12 or later
 * answers for an ES module as long as it has no top-level `await`.
 */

interface CodeMeta {
  version: string
  dateModified: string
}

/** The version `codemeta.json` names. */
export function readVersion(contents: string): string {
  return (JSON.parse(contents) as CodeMeta).version
}

/**
 * `codemeta.json` at `version`, modified today. Today is the UTC date, as
 * the changelog's release heading gives it.
 */
export function writeVersion(contents: string, version: string): string {
  const codemeta = JSON.parse(contents) as CodeMeta
  codemeta.version = version
  codemeta.dateModified = new Date().toISOString().slice(0, 10)
  return `${JSON.stringify(codemeta, null, 2)}\n`
}
