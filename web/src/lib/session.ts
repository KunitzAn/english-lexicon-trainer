import { reactive } from 'vue'
import { api } from '../api'
import type { Exercise } from './exercises'
import type {
  AttemptDraft,
  ServerExercise,
  SessionReviewRow,
  TrainingFormat,
  TrainingSet,
} from './types'

/**
 * Активный набор для тренировки. TrainView его заполняет и уводит на /train/run;
 * SessionView читает. При перезагрузке страницы пусто → SessionView спросит
 * сервер, есть ли незаконченная сессия (этап 5).
 */
export const session = reactive<{
  set: TrainingSet | null
  context: ServerExercise[]
  format: TrainingFormat
}>({ set: null, context: [], format: 'mix' })

export function startSession(
  set: TrainingSet,
  context: ServerExercise[] = [],
  format: TrainingFormat = 'mix',
) {
  session.set = set
  session.context = context
  session.format = format
}

export function endSession() {
  session.set = null
  session.context = []
  session.format = 'mix'
}

// --- серверное сохранение прогресса сессии (этап 5) ---

/** Снимок хода сессии — переживает перезагрузку и переезд на другое устройство. */
export interface PersistedSession {
  exercises: Exercise[]
  idx: number
  attempts: AttemptDraft[]
  review: SessionReviewRow[]
  format: TrainingFormat
}

function looksLikeSession(s: unknown): s is PersistedSession {
  const o = s as Partial<PersistedSession> | null
  return (
    !!o &&
    Array.isArray(o.exercises) &&
    o.exercises.length > 0 &&
    typeof o.idx === 'number' &&
    Array.isArray(o.attempts) &&
    Array.isArray(o.review)
  )
}

/** Есть ли на сервере незаконченная сессия. null — нет / ошибка / мусор. */
export async function fetchServerSession(): Promise<PersistedSession | null> {
  try {
    const r = await api<{ session: { state: unknown } | null }>('/sessions')
    return r.session && looksLikeSession(r.session.state) ? r.session.state : null
  } catch {
    return null
  }
}

// простой антидребезг: один PUT в полёте, последнее состояние — следом
let putInFlight = false
let putQueued: PersistedSession | null = null

/** Сохранить снимок на сервер (fire-and-forget). */
export function saveServerSession(state: PersistedSession): void {
  if (putInFlight) {
    putQueued = state
    return
  }
  putInFlight = true
  api('/sessions', { method: 'PUT', body: JSON.stringify({ state }) })
    .catch(() => {})
    .finally(() => {
      putInFlight = false
      if (putQueued) {
        const q = putQueued
        putQueued = null
        saveServerSession(q)
      }
    })
}

/** Удалить серверную сессию (по завершении / сбросу). */
export function clearServerSession(): void {
  putQueued = null
  api('/sessions', { method: 'DELETE' }).catch(() => {})
}
