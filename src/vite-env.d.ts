/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin for deployed builds, e.g. https://api.example.com. Empty means same origin (dev proxy). */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
