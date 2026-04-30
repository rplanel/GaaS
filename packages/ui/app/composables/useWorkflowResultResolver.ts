import type { Ref } from 'vue'
import { resolveComponent } from 'vue'
/**
 * Options for resolving a workflow result component.
 */
export interface UseWorkflowResultResolverOptions {
  /**
   * The unique workflow slug from `workflows.workflow_slug`.
   */
  workflowSlug: Ref<string> | string
  /**
   * Base prefix for the component name. Defaults to `'WorkflowResult'`.
   */
  prefix?: Ref<string> | string
}

/**
 * Return type for useWorkflowResultResolver.
 */
export interface WorkflowResultResolver {
  /**
   * The resolved Vue component, or `'WorkflowResultGeneric'` string as fallback.
   */
  component: object | string
  /**
   * The full component name that was looked up (e.g. `'WorkflowResultNfCoreEpitopeprediction'`).
   */
  componentName: Ref<string>
  /**
   * Whether a custom component was found (not the generic fallback).
   */
  isCustom: Ref<boolean>
}

/**
 * Resolves a Vue component by workflow slug using a naming convention.
 *
 * Downstream apps extending `@gaas/ui` can provide custom result displays
 * by creating a component named `WorkflowResult{PascalCase(workflowSlug)}.vue`
 * in their `app/components/` directory. Nuxt auto-import discovers it across
 * layer boundaries.
 *
 * @example
 * useWorkflowResultResolver({ workflowSlug: ref('nf-core-epitopeprediction') })
 * // → { component: <resolved>, componentName: 'WorkflowResultNfCoreEpitopeprediction', isCustom: true }
 */
export function useWorkflowResultResolver(options: UseWorkflowResultResolverOptions): WorkflowResultResolver {
  const { workflowSlug, prefix = 'WorkflowResult' } = options

  const resolvedWorkflowSlug = computed(() => {
    return typeof workflowSlug === 'string' ? workflowSlug : toValue(workflowSlug)
  })

  const resolvedPrefix = computed(() => {
    return typeof prefix === 'string' ? prefix : toValue(prefix)
  })

  const componentName = computed(() => `${resolvedPrefix.value}${toWorkflowComponentName(resolvedWorkflowSlug.value)}`)

  const resolvedComponent = computed(() => {
    const name = componentName.value
    const resolved = resolveComponent(name)
    // resolveComponent returns the string name itself when the component is not found
    return typeof resolved === 'string' ? undefined : resolved
  })
  const genericComponent = resolveComponent('WorkflowResultGeneric')
  const isCustom = computed(() => !!resolvedComponent.value)

  const component = computed(() => resolvedComponent.value ?? genericComponent)

  return {
    component,
    componentName,
    isCustom,
  }
}
