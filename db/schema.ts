import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Схема БД. На этапе 0 — только `folders`, чтобы прогнать toolchain миграций.
 * Полная схема (words, word_folders, word_senses, progress, attempts, exercises,
 * quota_usage, generation_log) приезжает на этапе 2 — см. DEV_PLAN.md.
 */

export const folders = pgTable('folders', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
