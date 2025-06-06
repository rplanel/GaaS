import type { MaybeRef } from '#imports'
import type { UseAsyncQueueResult } from '@vueuse/core'
import type { GalaxyDataToolParameter, GalaxyTool, GalaxyToolParameters } from 'blendtype'
import { computed, ref, toValue, watch } from '#imports'
import { useAsyncQueue } from '@vueuse/core'
import { encodeParam } from 'ufo'

export type ToolInputParameter = Exclude<GalaxyToolParameters, GalaxyDataToolParameter>
export interface ToolQuery {
  toolId: string
  toolVersion: string
}

/**
 * A composable function to fetch Galaxy tools based on provided tool queries.
 * It uses the useAsyncQueue to fetch all tools in parallel and provides computed properties
 * for easy access to tool input parameters and tools as an object.
 *
 * @param {MaybeRef<ToolQuery[]>} toolParamQueries - A reference to an array of ToolQuery objects.
 * @returns {{
 *   tools: Ref<UseAsyncQueueResult<GalaxyTool>[] | undefined>,
 *   toolsObj: ComputedRef<Record<string, GalaxyTool>>,
 *   isLoading: Ref<boolean>,
 *   error: Ref<Error | null>,
 *   toolInputParameters: ComputedRef<Record<string, ToolInputParameter[]>>
 * }} An object containing the tools, toolsObj, loading state, error state, and tool input parameters.
 */
export function useGalaxyTool(toolParamQueries: MaybeRef<ToolQuery[]>) {
  // State
  const tools = ref<UseAsyncQueueResult<GalaxyTool>[] | undefined>(undefined)
  const isLoading = ref(false)
  const error = ref<Error | null>(null)
  // Computed

  /**
   * Extract for each tools, the parameters available.
   * Filter the input paramaters that are data.
   */

  const toolInputParameters = computed(() => {
    const toolsVal = toValue(tools)
    if (toolsVal && toolsVal.length > 0) {
      return Object
        .entries(toolsVal)
        .reduce<Record<string, ToolInputParameter[]>>((acc, [_, tool]) => {
          if (tool?.data?.inputs) {
            const filteredInputs = tool?.data?.inputs.filter((input): input is ToolInputParameter => input.type !== 'data')
            acc[tool.data.id] = filteredInputs
          }
          return acc
        }, {} as Record<string, ToolInputParameter[]>)
    }
    return {}
  })

  /**
   * Convert the tools array into an object with tool IDs as keys.
   * This allows for easier access to tools by their ID.
   * @returns {Record<string, GalaxyTool>} An object where keys are tool IDs and values are GalaxyTool objects.
   */
  const toolsObj = computed(() => {
    const toolsVal = toValue(tools)
    if (toolsVal && toolsVal.length > 0) {
      return toolsVal.reduce<Record<string, GalaxyTool>>((acc, curr) => {
        if (curr?.data) {
          acc[curr.data.id] = curr.data
        }
        return acc
      }, {} as Record<string, GalaxyTool>)
    }
    return {}
  })
  // Methods

  /**
   * Fetch the tools from the Galaxy API based on the toolParamQueries.
   * It uses the useAsyncQueue to fetch all tools in parallel.
   * @throws Error if there is an error fetching the tools
   */
  const fetchTools = async () => {
    isLoading.value = true

    try {
      const promises = toValue(toolParamQueries).map((toolQuery) => {
        const { toolId, toolVersion } = toolQuery
        return () => $fetch<GalaxyTool>(`/api/galaxy/tools/${encodeParam(toolId)}/${toolVersion}`)
      })
      const { result } = useAsyncQueue<GalaxyTool[]>(promises)
      tools.value = result
    }
    catch (err) {
      error.value = err as Error
    }
    finally {
      isLoading.value = false
    }
  }

  watch(toolParamQueries, async () => {
    await fetchTools()
  }, { immediate: true, deep: true })
  // fetchTools()
  return {
    // State
    tools,
    toolsObj,
    isLoading,
    error,
    // Computed
    toolInputParameters,
  }
}
