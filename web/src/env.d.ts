interface ImportMetaEnv {
  readonly VITE_TELEGRAM_BOT_USERNAME: string
  readonly VITE_MYMEMORY_EMAIL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
