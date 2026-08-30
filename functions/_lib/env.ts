/** Переменные окружения Pages Functions (secrets + vars). */
export interface Env {
  DATABASE_URL: string
  /** Секрет подписи session-куки. */
  SESSION_SECRET: string
  TELEGRAM_BOT_TOKEN: string
  OPENROUTER_API_KEY?: string
}
