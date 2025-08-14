/**
 * @file useGalaxyToolInputComponent composable
 * @module app/composables/galaxy/useGalaxyToolInputComponent
 * This composable will map a tool input parameter to a UI component
 * Should live in the same package as the components (i.e. gaas-ui)
 */

import type { GalaxyToolParameters } from 'blendtype'
import type { ComputedRef, MaybeRef } from 'vue'

import {
  GalaxyBooleanToolParameter,
  GalaxyConditional,
  GalaxyDataToolParameter,
  GalaxyFloatToolParameter,
  GalaxyIntegerToolParameter,
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
  const classToComponent = shallowRef({
    select: GalaxySelectToolParameter,
    boolean: GalaxyBooleanToolParameter,
    float: GalaxyFloatToolParameter,
    data: GalaxyDataToolParameter,
    conditional: GalaxyConditional,
    integer: GalaxyIntegerToolParameter,
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
