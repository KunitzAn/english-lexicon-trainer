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
  variants: LookupVariant[]
}

/** Черновик значения в форме добавления/редактирования. */
export interface SenseDraft {
  translation: string
  part_of_speech: string
  definition_en: string
  example: string
  source: 'api' | 'manual'
}
