/**
 * How one tool at one version is named, in the one spelling both halves of
 * the runtime use.
 *
 * A toolshed guid carries its version inside the id
 * (`toolshed.g2.bx.psu.edu/repos/iuc/foo/foo/1.2.3`); a built-in id does not
 * (`Cut1`). So the pair is what names a tool, never the id alone — and a
 * workflow may pin the **same** built-in at two versions in two steps.
 * Keyed by id alone the second definition overwrites the first and one of
 * the two steps is offered the other version's form (#100).
 *
 * This lives outside both `server/` and `app/` because the description
 * endpoint serves its `tools` under this key and the composable resolves a
 * step to a tool with it: two spellings of one key is exactly the drift the
 * defect was made of.
 */
export function toolKey(toolId: string, toolVersion: string): string {
  return `${toolId}@${toolVersion}`
}
