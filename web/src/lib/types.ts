export interface FolderRow {
  id: number
  name: string
  word_count: number
  /** Иконка темы: эмодзи + цвет (бэклог этапа 6). */
  icon?: string | null
  color?: string | null
}

export interface WordListItem {
  id: number
  text: string
  transcription: string | null
  is_phrase: boolean
  translations: string[]
  folder_ids?: number[]
  /** выученность слова 0..100 — минимум по значениям (этап 5.1) */
  mastery?: number
}

export interface SenseRow {
  id: number
  translation: string
  part_of_speech: string | null
  definition_en: string | null
  example: string | null
  source: string
  position: number
  /** выученность значения 0..100 (этап 5.1) */
  mastery?: number
}

export interface WordDetail {
  id: number
  text: string
  transcription: string | null
  is_phrase: boolean
  folder_ids: number[]
  senses: SenseRow[]
  /** выученность слова 0..100 — минимум по значениям (этап 5.1) */
  mastery?: number
}

export interface LookupVariant {
  translation: string
  source: 'api'
}

export interface LookupResult {
  query: string
  cached: boolean
  degraded?: boolean
  detail?: string
  variants: LookupVariant[]
}

/** Черновик значения в форме добавления. */
export interface SenseDraft {
  translation: string
  definition_en: string
  example: string
  expanded: boolean
}

// --- Этап 3: тренировка ---

export interface TrainingCard {
  word_sense_id: number
  word_id: number
  text: string
  transcription: string | null
  is_phrase: boolean
  translation: string
  definition_en: string | null
  example: string | null
}

export interface TrainingSet {
  mode: 'auto' | 'manual'
  limit: number
  new_count: number
  cards: TrainingCard[]
  distractor_pool: string[]
}

export type ExerciseType = 'match' | 'flashcard' | 'choice' | 'gap' | 'clickable'

/** Формат тренировки: всё вперемешку / только контекст (ИИ) / только карточки (без ИИ). */
export type TrainingFormat = 'mix' | 'context' | 'cards'

export interface AttemptDraft {
  client_id: string
  word_sense_id: number
  exercise_id?: number
  exercise_type: ExerciseType
  is_correct: boolean | null
  hint_used: boolean
}

export interface ProgressRow {
  word_sense_id: number
  correct_count: number
  incorrect_count: number
}

// --- Этап 4: контекстные упражнения от ИИ ---

export interface GlossItem {
  word_sense_id: number
  text: string
  transcription: string | null
  translation: string
  definition_en: string | null
  example: string | null
}

export interface GapPayload {
  kind: 'gap'
  word_sense_id: number
  text: string
  bank: string[]
  answer: string
  glossary: GlossItem[]
}
export interface ClickablePayload {
  kind: 'clickable'
  word_sense_id: number
  text: string
  target: string
  options: string[]
  answer: string
  glossary: GlossItem[]
}

export interface ServerExercise {
  id: number
  type: 'gap' | 'clickable'
  payload: GapPayload | ClickablePayload
}

export interface GenerateResult {
  exercises: ServerExercise[]
  quota_left: number
  degraded: string | null
  gen_detail?: string | null
}

export interface QuotaInfo {
  left: number
  limit: number
  enabled: boolean
}

// --- этап 5.1: настройки модели выученности ---

export interface MasterySettings {
  gainNewDay: number
  gainSameDay: number
  gainRepeatMore: number
  penaltyWrong: number
  learnedThreshold: number
  decayEnabled: boolean
  decayPerDay: number
  decayAfterLearned: boolean
  decayPerDayLearned: number
  decayGraceDays: number
}

// --- этап 5: разбор сессии (сохраняется на сервер) ---

export interface SessionSenseRef {
  sense_id: number
  text: string
  translation: string
  transcription: string | null
  example: string | null
}
export type SessionOutcome = 'correct' | 'wrong' | 'hint'
export type SessionReviewRow = SessionSenseRef & { outcome: SessionOutcome }

// --- этап 6: прогресс (главная) ---

export interface StatsInfo {
  words_total: number
  senses_total: number
  senses_attempted: number
  correct: number
  incorrect: number
  accuracy: number | null
  streak_days: number
  active_days: number
  // v2 (этап 5.1, пункт D)
  buckets: { new: number; in_progress: number; learned: number }
  themes: {
    id: number
    name: string
    word_count: number
    mastery: number
    icon?: string | null
    color?: string | null
  }[]
  heatmap: { day: string; count: number }[]
  weak: { word_id: number; text: string; translation: string; mastery: number }[]
}
