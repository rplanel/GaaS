/**
 * What a tool is called, from the id Galaxy knows it by.
 *
 * A toolshed guid ends in `…/<name>/<version>`, so the name is its
 * second-to-last segment; a built-in id (`Cut1`, `__BUILD_LIST__`) has no
 * segments and is its own name. The *version* is never read out of the id
 * this way — only the first kind carries one — which is why every caller
 * takes it from the step's `tool_version` instead (#100).
 *
 * On its own rather than inside the graph's derivation, because the invoke
 * form's accordion headers read it too and a form has no business importing
 * from a module that pulls in Vue Flow and dagre.
 */
export function toolDisplayName(toolId: string): string {
  const segments = toolId.split('/')
  return (segments.length >= 2 ? segments.at(-2) : toolId) || toolId
}
