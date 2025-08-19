import { coordinator as defaultCoordinator, DuckDBWASMConnector } from '@uwdata/mosaic-core'

export function useMosaicCoordinator() {
  const coordinator = defaultCoordinator()
  const wasm = new DuckDBWASMConnector()
  coordinator.databaseConnector(wasm)

  return {
    coordinator,
  }
}
