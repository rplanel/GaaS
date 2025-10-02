import type { Coordinator } from '@uwdata/mosaic-core'
import type { ShallowRef } from 'vue'
import { coordinator as defaultCoordinator, DuckDBWASMConnector } from '@uwdata/mosaic-core'
import { loadCSV, loadObjects } from '@uwdata/mosaic-sql'
import { useAsyncState } from '@vueuse/core'

interface UseMosaicBaseParams {
  tableName: Ref<string>
  coordinator?: Ref<Coordinator>
}

interface UseMosaicFromFileParams extends UseMosaicBaseParams {
  filePath: Ref<string>
}

interface UseMosaicFromObjectParams extends UseMosaicBaseParams {
  object: ShallowRef<Record<string, unknown>[] | undefined>
}

type useMosaicParams = UseMosaicFromFileParams | UseMosaicFromObjectParams

export function useMosaic(params: useMosaicParams) {
  const {
    tableName,
  } = params

  const error = ref<Error | undefined>(undefined)
  const pending = ref(false)
  const queryResult = ref<unknown | undefined>(undefined)

  const coordinator = ref<Coordinator | undefined>(params.coordinator ? toValue(params.coordinator) : undefined)

  onBeforeMount(() => {
    if (coordinator.value === undefined) {
      const wasm = new DuckDBWASMConnector()
      const c = defaultCoordinator()
      c.databaseConnector(wasm)
      coordinator.value = c
    }
  })

  /**
   * Generate the appropriate query string based on the provided parameters.
   */
  const queryString = computed(() => {
    const tableNameVal = toValue(tableName)
    if ('filePath' in params) {
      const { filePath } = params
      const filePathVal = toValue(filePath)
      return loadCSV(tableNameVal, filePathVal)
    }
    else if ('object' in params) {
      const dataObject = toValue(params.object)
      if (dataObject) {
        const qs = loadObjects(tableNameVal, dataObject, { })
        return qs
      }
    }
    return undefined
  })

  async function execQuery(qs: MaybeRef<string | undefined>) {
    const query = toValue(qs)
    const coordinatorVal = toValue(coordinator)
    pending.value = true
    if (!query || !coordinatorVal) {
      pending.value = false
      return Promise.resolve('no query to execute')
    }
    return coordinatorVal.exec(query).then((result) => {
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
  })

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
