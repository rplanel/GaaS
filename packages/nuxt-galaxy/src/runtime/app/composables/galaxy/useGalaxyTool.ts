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
  const fetchTools = async () => {
    isLoading.value = true

    try {
      // tools.value = await $fetch<GalaxyTool>(`/api/galaxy/tools/${encodeParam(toValue(toolParamQueries)[0].toolId)}/${toValue(toolParamQueries)[0].toolVersion}`)

      const promises = toValue(toolParamQueries).map((toolQuery) => {
        const { toolId, toolVersion } = toolQuery
        return () => $fetch<GalaxyTool>(`/api/galaxy/tools/${encodeParam(toolId)}/${toolVersion}`)
      })
      const { result } = useAsyncQueue<GalaxyTool[]>(promises)
      tools.value = result
      // tools.value = await Promise.all(promises)
      // console.log(fetchedTools)
      // tools.value = fetchedTools.reduce<Record<string, GalaxyTool>>((acc, curr) => {
      //   acc[curr.id] = curr
      //   return acc
      // }, {} as Record<string, GalaxyTool>)
    }
    catch (err) {
      error.value = err as Error
    }
    finally {
      isLoading.value = false
    }
  }

  watch(toolParamQueries, () => {
    fetchTools()
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
