export interface FolderRow {
  id: number
  name: string
  word_count: number
}

export interface WordListItem {
  id: number
  text: string
  transcription: string | null
  is_phrase: boolean
  translations: string[]
  folder_ids?: number[]
}

export interface SenseRow {
  id: number
  translation: string
  part_of_speech: string | null
  definition_en: string | null
  example: string | null
  source: string
  position: number
}

export interface WordDetail {
  id: number
  text: string
  transcription: string | null
  is_phrase: boolean
  folder_ids: number[]
  senses: SenseRow[]
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
