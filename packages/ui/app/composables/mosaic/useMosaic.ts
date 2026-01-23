import type { Coordinator } from '@uwdata/mosaic-core'
import type { ShallowRef } from 'vue'
import { loadCSV, loadObjects, loadParquet } from '@uwdata/mosaic-sql'
import { useAsyncState } from '@vueuse/core'

interface UseMosaicBaseParams {
  tableName: Ref<string>
  coordinator: Coordinator
  options?: Record<string, unknown>
}

interface UseMosaicFromFileParams extends UseMosaicBaseParams {
  filePath: Ref<string>
  format?: 'csv' | 'parquet'
}

interface UseMosaicFromObjectParams extends UseMosaicBaseParams {
  object: ShallowRef<Record<string, unknown>[] | undefined>
}

type useMosaicParams = UseMosaicFromFileParams | UseMosaicFromObjectParams

export function useMosaic(params: useMosaicParams) {
  const {
    tableName,
    options,
  } = params

  const error = ref<Error | undefined>(undefined)
  const pending = ref(false)
  const queryResult = ref<unknown | undefined>(undefined)
  const coordinator: Coordinator = params.coordinator

  /**
   * Generate the appropriate query string based on the provided parameters.
   */
  const queryString = computed(() => {
    const tableNameVal = toValue(tableName)
    if ('filePath' in params) {
      const { filePath, format = 'csv' } = params
      const filePathVal = toValue(filePath)
      if (format === 'parquet') {
        return loadParquet(tableNameVal, filePathVal, options)
      }
      else {
        return loadCSV(tableNameVal, filePathVal, options)
      }
    }
    else if ('object' in params) {
      const dataObject = toValue(params.object)
      if (dataObject) {
        const qs = loadObjects(tableNameVal, dataObject, options)
        return qs
      }
    }
    return undefined
  })

  async function execQuery(qs: MaybeRef<string | undefined>) {
    const query = toValue(qs)
    pending.value = true
    if (!query || !coordinator) {
      pending.value = false
      return Promise.resolve('no query to execute')
    }
    return coordinator.exec(query).then((result) => {
      pending.value = false
      return result
    })
  }
  const { state, isReady, isLoading, execute } = useAsyncState(execQuery(queryString), false, {
    immediate: false,

  })

  // execQuery()
  watch(queryString, () => {
    if (queryString.value && tableName.value) {
      execute(0, execQuery(queryString))
    }
  }, { immediate: true })

  return {
    queryString,
    error,
    pending,
    queryResult,
    state,
    isReady,
    isLoading,
    coordinator,
  }
}
