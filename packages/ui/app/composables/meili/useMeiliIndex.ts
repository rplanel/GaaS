import type { IndexObject, IndexStats, Settings } from 'meilisearch'
import { useAsyncState } from '@vueuse/core'
import { MeiliSearch } from 'meilisearch'

export interface UseMeiliIndexParams {
  index: Ref<string | undefined>
}

export interface IndexInfoReturn {
  state: IndexObject | undefined
  isReady: boolean
  isLoading: boolean
}

export interface IndexSettingsReturn {
  state: Settings | undefined
  isReady: boolean
  isLoading: boolean
}

export interface IndexStatsReturn {
  state: IndexStats | undefined
  isReady: boolean
  isLoading: boolean
}

export function useMeiliIndex({ index }: UseMeiliIndexParams) {
  // console.log('useMeiliIndex for index:', index)
  const config = useRuntimeConfig()
  const { public: { meilisearch: { hostUrl, searchApiKey } } } = config

  const meilisearch = new MeiliSearch({
    host: hostUrl,
    apiKey: searchApiKey,
  })

  // info about the index
  const info = useState<IndexObject | undefined>(`${index}-meili-index-info`, () => undefined)

  const getInfo = async () => {
    if (!index || !index.value) {
      return
    }
    const infoData = await meilisearch.index(index.value).getRawInfo()
    // console.log('Index info data:', infoData)
    info.value = infoData
    return infoData
  }

  const initVal: IndexObject | undefined = undefined
  const { state: infoState, isReady: infoReady, isLoading: infoLoading, execute: executeInfo } = useAsyncState(getInfo(), initVal, { immediate: false })

  executeInfo(0, getInfo())

  const infoReturn = computed<IndexInfoReturn>(() => {
    return {
      state: infoState.value,
      isReady: infoReady.value,
      isLoading: infoLoading.value,
    }
  })

  // get settings of the index

  const settings = useState<Settings | undefined>(`${index}-meili-index-settings`, () => undefined)
  const getSettings = async () => {
    if (!index || !index.value) {
      return
    }
    const settingsData = await meilisearch.index(index.value).getSettings()
    settings.value = settingsData
    return settingsData
  }

  const initSettingsVal: Settings | undefined = undefined
  const {
    state: settingsState,
    isReady: settingsReady,
    isLoading: settingsLoading,
    execute: executeSettings,
  } = useAsyncState(
    getSettings(),
    initSettingsVal,
    { immediate: false },
  )
  executeSettings(0, getSettings())

  const settingsReturn = computed<IndexSettingsReturn>(() => {
    return {
      state: settingsState.value,
      isReady: settingsReady.value,
      isLoading: settingsLoading.value,
    }
  })

  // get stats of the index

  const stats = useState<IndexStats | undefined>(`${index}-meili-index-stats`, () => undefined)

  const getStats = async () => {
    if (!index || !index.value) {
      return
    }
    const statsData = await meilisearch.index(index.value).getStats()
    stats.value = statsData
    return statsData
  }

  const initStatsVal: IndexStats | undefined = undefined
  const {
    state: statsState,
    isReady: statsReady,
    isLoading: statsLoading,
    execute: executeStats,
  } = useAsyncState(
    getStats(),
    initStatsVal,
    { immediate: false },
  )
  executeStats(0, getStats())

  const statsReturn = computed<IndexStatsReturn>(() => {
    return {
      state: statsState.value,
      isReady: statsReady.value,
      isLoading: statsLoading.value,
    }
  })

  return {
    info: infoReturn,
    settings: settingsReturn,
    stats: statsReturn,
  }
}
