import type { Coordinator } from '@uwdata/mosaic-core'

import { coordinator as defaultCoordinator, DuckDBWASMConnector } from '@uwdata/mosaic-core'

export function useMosaicCoordinator(tableName: MaybeRef<string>) {
  const coordinator = shallowRef<Coordinator>(defaultCoordinator())

  async function init() {
    const tableNameVal = toValue(tableName)
    if (tableNameVal) {
      const wasm = new DuckDBWASMConnector()
      coordinator.value.databaseConnector(wasm)
    }
  }
  init()
  watchEffect(() => {
    const tableNameVal = toValue(tableName)
    if (tableNameVal) {
      init()
    }
  })
  return {
    coordinator,
  }
}
