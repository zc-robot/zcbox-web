interface ImportMetaEnv {
  readonly VITE_API_DOMAIN?: string
  readonly VITE_WS_DOMAIN?: string
  readonly VITE_DESKTOP_HOST?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
