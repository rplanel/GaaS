/**
 * @file useGalaxyToolInputComponent composable
 * @module app/composables/galaxy/useGalaxyToolInputComponent
 * This composable will map a tool input parameter to a UI component
 * Should live in the same package as the components (i.e. gaas-ui)
 */

import type { GalaxyTool, GalaxyToolParameters } from 'blendtype'
import type { ComputedRef, MaybeRef, MaybeRefOrGetter } from 'vue'

import {
  GalaxyBooleanToolParameter,
  GalaxyConditional,
  GalaxyDataToolParameter,
  GalaxyFloatToolParameter,
  GalaxyIntegerToolParameter,
  GalaxyRepeatToolParameter,
  GalaxySectionToolParameter,
  GalaxySelectToolParameter,
} from '#components'
import { computed, shallowRef, toValue } from 'vue'

export interface GalaxyToolInputComponent {
  component: unknown

}

export function useGalaxyToolInputComponent(toolParameters: MaybeRef<GalaxyToolParameters[] | undefined>): {
  inputComponents: ComputedRef<GalaxyToolInputComponent[] | undefined>
  inputComponentsObject: ComputedRef<Record<string, GalaxyToolInputComponent> | undefined>
} {
  /**
   * Which widget renders which parameter type — the map that has to cover
   * `GalaxyToolParameterType`, because a type without an entry here resolves
   * to `undefined` and `Step.vue` renders that as nothing at all.
   *
   * `section` and `repeat` joined it with #101. Neither is a widget: both are
   * containers that render their own children through this same map, which is
   * how a parameter at any depth reaches a component. `text` and
   * `data_collection` are still missing, for different reasons — `text` has
   * no component yet (#113) and a `data_collection` is fed by an edge, so the
   * filter drops it before this map is consulted (#114).
   */
  const classToComponent = shallowRef({
    select: GalaxySelectToolParameter,
    boolean: GalaxyBooleanToolParameter,
    float: GalaxyFloatToolParameter,
    data: GalaxyDataToolParameter,
    conditional: GalaxyConditional,
    integer: GalaxyIntegerToolParameter,
    section: GalaxySectionToolParameter,
    repeat: GalaxyRepeatToolParameter,
  })

  const inputComponentsObject = computed(() => {
    const classToComponentVal = toValue(classToComponent)
    const toolParametersVal = toValue(toolParameters)
    if (toolParametersVal) {
      return toolParametersVal.reduce((acc, param) => {
        acc[param.name] = {
          component: classToComponentVal?.[param.type]
            ? classToComponentVal[param.type]
            : undefined,
        }

        return acc
      }, {} as Record<string, GalaxyToolInputComponent>)
    }
  })

  const inputComponents = computed(() => {
    const classToComponentVal = toValue(classToComponent)
    const toolParametersVal = toValue(toolParameters)
    if (toolParametersVal) {
      return toolParametersVal.map((param) => {
        return {
          component: classToComponentVal?.[param.type]
            ? classToComponentVal[param.type]
            : undefined,
        }
      })
    }
  })

  return { inputComponents, inputComponentsObject }
}

/**
 * The same mapping for every tool of a workflow at once: which component
 * renders each parameter, by tool id and then by parameter name.
 *
 * One copy of a derivation that #87 found in two screens — `InvokeForm`'s
 * `toolInputParameterComponent` and `AnalysisHistoryPanel`'s
 * `useAnalysisTools` — built the same way from the same `toolsObj` and
 * differing only in how each destructured the reduce. It lives here rather
 * than in `useGalaxyWorkflowDescription` because it resolves `#components`,
 * which belongs to this layer: the fetching moved to `nuxt-galaxy`, the
 * mapping to Vue components could not follow it.
 */
export function useGalaxyToolsInputComponents(
  tools: MaybeRefOrGetter<Record<string, GalaxyTool> | undefined>,
): ComputedRef<Record<string, Record<string, GalaxyToolInputComponent>>> {
  return computed(() => {
    return Object.entries(toValue(tools) ?? {}).reduce<Record<string, Record<string, GalaxyToolInputComponent>>>(
      (acc, [toolId, tool]) => {
        const { inputComponentsObject } = useGalaxyToolInputComponent(tool.inputs)
        if (inputComponentsObject.value) {
          acc[toolId] = inputComponentsObject.value
        }
        return acc
      },
      {},
    )
  })
}
