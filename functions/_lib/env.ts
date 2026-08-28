/** Переменные окружения Pages Functions (secrets + vars). */
export interface Env {
  DATABASE_URL: string
  SESSION_SECRET: string
  TELEGRAM_BOT_TOKEN: string
  /** Список Telegram-ID через запятую, кому разрешён вход. */
  ALLOWED_TELEGRAM_IDS: string
  MYMEMORY_EMAIL?: string
  OPENROUTER_API_KEY?: string
}
