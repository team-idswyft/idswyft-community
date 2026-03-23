/// <reference types="vite/client" />
/// <reference types="react" />
/// <reference types="react-dom" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_EDITION: 'community' | 'cloud'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}