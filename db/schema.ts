import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

/**
 * Схема БД. Растёт по этапам (см. DEV_PLAN.md).
 * Этап 0: folders. Этап 1: users. Этап 2: words, word_folders, word_senses,
 * translation_cache; folders получает user_id. Всё персональное — по user_id.
 */

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull().unique(),
  name: text('name'),
  isOwner: boolean('is_owner').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const folders = pgTable(
  'folders',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('folders_user_idx').on(t.userId)],
)

export const words = pgTable(
  'words',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Как ввёл пользователь (trim + схлопнутые пробелы, регистр сохранён). */
    text: text('text').notNull(),
    /** Нормализованный (lower) — для уникальности и поиска. */
    textNorm: text('text_norm').notNull(),
    transcription: text('transcription'),
    isPhrase: boolean('is_phrase').notNull().default(false),
    source: text('source').notNull().default('manual'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('words_user_norm_uidx')
      .on(t.userId, t.textNorm)
      .where(sql`${t.deletedAt} is null`),
  ],
)

export const wordFolders = pgTable(
  'word_folders',
  {
    wordId: integer('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    folderId: integer('folder_id')
      .notNull()
      .references(() => folders.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.wordId, t.folderId] }),
    index('word_folders_folder_idx').on(t.folderId),
  ],
)

export const wordSenses = pgTable(
  'word_senses',
  {
    id: serial('id').primaryKey(),
    wordId: integer('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    translation: text('translation').notNull(),
    partOfSpeech: text('part_of_speech'),
    definitionEn: text('definition_en'),
    example: text('example'),
    source: text('source').notNull().default('manual'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('word_senses_word_idx').on(t.wordId)],
)

/** Кэш ответов MyMemory. Общий для всех пользователей. */
export const translationCache = pgTable('translation_cache', {
  query: text('query').primaryKey(),
  responseJson: jsonb('response_json').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

/**
 * Этап 3. Каждая попытка ответа — источник истины для прогресса.
 * `client_id` — UUID с клиента, дедуп при ретраях и синке с нескольких устройств.
 * `is_correct` = null → пользователь подсмотрел перевод (нейтральный зачёт).
 */
export const attempts = pgTable(
  'attempts',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull().unique(),
    wordSenseId: integer('word_sense_id')
      .notNull()
      .references(() => wordSenses.id, { onDelete: 'cascade' }),
    /** Заполняется на этапе 4 (сгенерированные упражнения). */
    exerciseId: integer('exercise_id'),
    exerciseType: text('exercise_type').notNull(),
    isCorrect: boolean('is_correct'),
    hintUsed: boolean('hint_used').notNull().default(false),
    answeredAt: timestamp('answered_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('attempts_user_idx').on(t.userId),
    index('attempts_sense_idx').on(t.wordSenseId),
  ],
)

/**
 * Денормализованные счётчики по значению. Не инкрементятся — пересчитываются
 * из `attempts` после каждой записи (устойчиво к дублям и параллельным устройствам).
 */
export const wordSenseProgress = pgTable(
  'word_sense_progress',
  {
    wordSenseId: integer('word_sense_id')
      .primaryKey()
      .references(() => wordSenses.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    correctCount: integer('correct_count').notNull().default(0),
    incorrectCount: integer('incorrect_count').notNull().default(0),
    lastTrainedAt: timestamp('last_trained_at', { withTimezone: true }),
  },
  (t) => [index('word_sense_progress_user_idx').on(t.userId)],
)

export type User = typeof users.$inferSelect
export type Folder = typeof folders.$inferSelect
export type Word = typeof words.$inferSelect
export type WordSense = typeof wordSenses.$inferSelect
export type Attempt = typeof attempts.$inferSelect
export type WordSenseProgress = typeof wordSenseProgress.$inferSelect
