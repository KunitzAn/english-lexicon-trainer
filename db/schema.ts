import {
  bigint,
  boolean,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

/**
 * Схема БД. Растёт по этапам (см. DEV_PLAN.md).
 * Этап 0: folders. Этап 1: users.
 * Этап 2: words, word_folders, word_senses, progress + user_id во всех
 * персональных таблицах (folders тогда же получит user_id).
 */

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull().unique(),
  name: text('name'),
  isOwner: boolean('is_owner').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const folders = pgTable('folders', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type User = typeof users.$inferSelect
