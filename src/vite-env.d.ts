/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_USE_MOCKS?: string
  /** Mock mode only: interval between simulated website requests (ms). */
  readonly VITE_MOCK_INBOUND_MS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
