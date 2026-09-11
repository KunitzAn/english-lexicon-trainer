import { and, eq, inArray, sql } from 'drizzle-orm'
import type { Db } from './db'
import { attempts, users } from '../../db/schema'

/**
 * Модель выученности значения (этап 5.1). Проценты 0–100, считается из `attempts`
 * проходом по дням с активностью + настройки. День — по локальной полуночи юзера.
 */
export interface MasterySettings {
  /** +% за верный ответ в новый (ещё не тренированный) день */
  gainNewDay: number
  /** +% за 1-й повторный верный ответ в тот же день */
  gainSameDay: number
  /** +% за 2-й и последующие повторные верные в тот же день */
  gainRepeatMore: number
  /** −% за неверный ответ */
  penaltyWrong: number
  /** с какого % слово считается выученным */
  learnedThreshold: number
  /** включено ли забывание (полоса тает без тренировки) */
  decayEnabled: boolean
  /** −% за день простоя, пока не выучено */
  decayPerDay: number
  /** тает ли после достижения выученности */
  decayAfterLearned: boolean
  /** −% за день простоя после выучено (если decayAfterLearned) */
  decayPerDayLearned: number
  /** сколько дней простоя не тают */
  decayGraceDays: number
}

export const DEFAULT_MASTERY_SETTINGS: MasterySettings = {
  gainNewDay: 20,
  gainSameDay: 5,
  gainRepeatMore: 2,
  penaltyWrong: 15,
  learnedThreshold: 100,
  decayEnabled: true,
  decayPerDay: 5,
  decayAfterLearned: false,
  decayPerDayLearned: 0,
  decayGraceDays: 3,
}

/**
 * История изменений настроек: пользователь может задать, применяются ли новые
 * настройки ко всей истории (`effectiveFrom` в самое начало) или только с
 * текущего момента (`effectiveFrom` = сегодняшняя локальная дата) — тогда
 * дни ДО этой даты по-прежнему считаются по прежним настройкам. Отсортирована
 * по возрастанию `effectiveFrom`, всегда ≥1 элемент.
 */
export interface MasteryHistoryEntry {
  settings: MasterySettings
  /** локальная дата 'YYYY-MM-DD', с которой действуют эти настройки */
  effectiveFrom: string
}
export type MasteryHistory = MasteryHistoryEntry[]

/** «Всегда были такими» — раньше самой ранней возможной даты попытки. */
export const EPOCH_DAY = '0001-01-01'

export const DEFAULT_MASTERY_HISTORY: MasteryHistory = [
  { settings: DEFAULT_MASTERY_SETTINGS, effectiveFrom: EPOCH_DAY },
]

/** Настройки, действовавшие в конкретный локальный день (история должна быть отсортирована). */
function settingsForDay(history: MasteryHistory, day: string): MasterySettings {
  let cur = history[0]!.settings
  for (const h of history) {
    if (h.effectiveFrom <= day) cur = h.settings
    else break
  }
  return cur
}

/** Настройки, действующие сейчас (последняя запись истории). */
export function currentMasterySettings(history: MasteryHistory): MasterySettings {
  return history.length ? history[history.length - 1]!.settings : DEFAULT_MASTERY_SETTINGS
}

/** Локальная дата 'YYYY-MM-DD' момента `ms` при сдвиге `offsetMin` минут от UTC. */
export function localDay(ms: number, offsetMin: number): string {
  return new Date(ms + offsetMin * 60_000).toISOString().slice(0, 10)
}

const clamp = (x: number) => Math.max(0, Math.min(100, x))
const dayIndex = (d: string) => Math.round(Date.parse(d + 'T00:00:00Z') / 86_400_000)

export interface MasteryDay {
  day: string // 'YYYY-MM-DD' (локальная дата)
  /** вклад ответа 0..1 (1 верно, 0.5 частично, 0 неверно), null — нейтрально (подсказка) */
  answers: (number | null)[]
}

/** `is_correct` → вклад по умолчанию, для типов без частичного балла и старых строк без `score`. */
export function deriveScore(isCorrect: boolean | null): number | null {
  return isCorrect === true ? 1 : isCorrect === false ? 0 : null
}

function decayAmount(s: MasterySettings, gapDays: number, learned: boolean): number {
  if (!s.decayEnabled) return 0
  const applies = s.decayAfterLearned || !learned
  if (!applies) return 0
  const rate = learned ? s.decayPerDayLearned : s.decayPerDay
  const idle = gapDays - 1 // дни строго между активными
  const eff = idle - s.decayGraceDays
  return eff > 0 ? rate * eff : 0
}

/**
 * Прогон выученности значения. `days` — по возрастанию даты, `today` — локальная
 * дата пользователя. Для каждого дня в `days` берутся настройки, действовавшие
 * в этот день по `history` (учитывает «применить только с текущего момента»
 * из настроек выученности) — гэп простоя между двумя днями считается по
 * настройкам, действующим на день, в который «пришли». Возвращает целое 0..100.
 */
export function masteryOf(
  days: MasteryDay[],
  today: string,
  history: MasteryHistory = DEFAULT_MASTERY_HISTORY,
): number {
  if (!days.length) return 0
  const sorted = [...history].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))

  let m = 0
  let prev: number | null = null

  for (const { day, answers } of days) {
    const s = settingsForDay(sorted, day)
    const di = dayIndex(day)
    if (prev !== null) {
      m = Math.max(0, m - decayAmount(s, di - prev, m >= s.learnedThreshold))
    }
    let correctSeen = 0
    for (const a of answers) {
      if (a === null) continue // нейтрально: подсказка, либо намеренно не штрафуемый промах
      if (a > 0) {
        const g =
          correctSeen === 0
            ? s.gainNewDay
            : correctSeen === 1
              ? s.gainSameDay
              : s.gainRepeatMore
        m = clamp(m + g * a) // частичный балл (напр. 0.5 за опечатку) — доля прироста
        correctSeen++
      } else {
        m = clamp(m - s.penaltyWrong)
      }
    }
    prev = di
  }

  if (prev !== null) {
    const s = settingsForDay(sorted, today)
    m = Math.max(0, m - decayAmount(s, dayIndex(today) - prev, m >= s.learnedThreshold))
  }
  return Math.round(clamp(m))
}

/**
 * Выученность указанных значений: `sense_id → 0..100`. Значения без попыток → 0.
 * Один запрос всех попыток по этим значениям, группировка и прогон в JS.
 */
export async function masteryForSenses(
  db: Db,
  userId: number,
  senseIds: number[],
  offsetMin: number,
  history: MasteryHistory = DEFAULT_MASTERY_HISTORY,
): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  for (const id of senseIds) out.set(id, 0)
  if (!senseIds.length) return out

  const rows = await db
    .select({
      senseId: attempts.wordSenseId,
      // старые строки без `score` — выводим из `is_correct` (deriveScore), поведение не меняется
      score: sql<number | null>`coalesce(${attempts.score}, case when ${attempts.isCorrect} then 1 when ${attempts.isCorrect} = false then 0 else null end)`,
      day: sql<string>`to_char((${attempts.answeredAt} at time zone 'UTC') + make_interval(mins => ${offsetMin}), 'YYYY-MM-DD')`,
    })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), inArray(attempts.wordSenseId, senseIds)))
    .orderBy(attempts.wordSenseId, attempts.answeredAt)

  const today = localDay(Date.now(), offsetMin)

  let cur = -1
  let days: MasteryDay[] = []
  const flush = () => {
    if (cur !== -1) out.set(cur, masteryOf(days, today, history))
  }
  for (const r of rows) {
    if (r.senseId !== cur) {
      flush()
      cur = r.senseId
      days = []
    }
    const last = days[days.length - 1]
    if (last && last.day === r.day) last.answers.push(r.score)
    else days.push({ day: r.day, answers: [r.score] })
  }
  flush()
  return out
}

/** Выученность слова = минимум по его значениям (0 значений → 0). */
export function wordMastery(
  senseMastery: Map<number, number>,
  senseIds: number[],
): number {
  if (!senseIds.length) return 0
  return Math.min(...senseIds.map((id) => senseMastery.get(id) ?? 0))
}

/** Парсинг ?tz_offset= (минуты к востоку от UTC), с клампом ±14 ч. */
export function tzOffsetOf(url: URL): number {
  const raw = Number(url.searchParams.get('tz_offset'))
  return Number.isFinite(raw) ? Math.max(-840, Math.min(840, Math.trunc(raw))) : 0
}

/** Слить пришедший объект с дефолтами + кламп диапазонов. Лишние ключи отбрасываются. */
export function mergeMasterySettings(raw: unknown): MasterySettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const num = (k: keyof MasterySettings, min: number, max: number): number => {
    const v = Number(o[k])
    return Number.isFinite(v)
      ? Math.max(min, Math.min(max, Math.round(v)))
      : (DEFAULT_MASTERY_SETTINGS[k] as number)
  }
  const bool = (k: keyof MasterySettings): boolean =>
    typeof o[k] === 'boolean'
      ? (o[k] as boolean)
      : (DEFAULT_MASTERY_SETTINGS[k] as boolean)
  return {
    gainNewDay: num('gainNewDay', 1, 100),
    gainSameDay: num('gainSameDay', 0, 100),
    gainRepeatMore: num('gainRepeatMore', 0, 100),
    penaltyWrong: num('penaltyWrong', 0, 100),
    learnedThreshold: num('learnedThreshold', 1, 100),
    decayEnabled: bool('decayEnabled'),
    decayPerDay: num('decayPerDay', 0, 100),
    decayAfterLearned: bool('decayAfterLearned'),
    decayPerDayLearned: num('decayPerDayLearned', 0, 100),
    decayGraceDays: num('decayGraceDays', 0, 60),
  }
}

const MAX_HISTORY_ENTRIES = 200

function cleanHistoryEntry(v: unknown): MasteryHistoryEntry | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const effectiveFrom =
    typeof o.effectiveFrom === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.effectiveFrom)
      ? o.effectiveFrom
      : null
  if (!effectiveFrom) return null
  return { settings: mergeMasterySettings(o.settings), effectiveFrom }
}

/**
 * История настроек выученности пользователя. Легаси-формат (одиночный объект
 * в `settings.mastery`, до появления истории) оборачивается записью с начала
 * времён — поведение не меняется для тех, кто ни разу не сохранял настройки
 * после этого изменения.
 */
export async function loadMasteryHistory(db: Db, userId: number): Promise<MasteryHistory> {
  const [u] = await db
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, userId))
  const raw = (u?.settings as Record<string, unknown> | null) ?? {}

  if (Array.isArray(raw.masteryHistory) && raw.masteryHistory.length) {
    const cleaned = raw.masteryHistory
      .map(cleanHistoryEntry)
      .filter((h): h is MasteryHistoryEntry => h !== null)
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))
    if (cleaned.length) return cleaned
  }
  if (raw.mastery) {
    return [{ settings: mergeMasterySettings(raw.mastery), effectiveFrom: EPOCH_DAY }]
  }
  return DEFAULT_MASTERY_HISTORY
}

/**
 * Сохранить новые настройки. `applyToPast: true` (по умолчанию — как было до
 * появления этой опции) — заменить всю историю новыми настройками, будто они
 * действовали всегда. `false` — новые настройки действуют только с сегодняшнего
 * локального дня (`today`), дни до него по-прежнему считаются по прежним.
 */
export async function saveMasterySettings(
  db: Db,
  userId: number,
  merged: MasterySettings,
  applyToPast: boolean,
  today: string,
): Promise<void> {
  const [u] = await db
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, userId))
  const prev = (u?.settings as Record<string, unknown> | null) ?? {}

  const newHistory: MasteryHistory = applyToPast
    ? [{ settings: merged, effectiveFrom: EPOCH_DAY }]
    : [
        ...(await loadMasteryHistory(db, userId)).filter((h) => h.effectiveFrom < today),
        { settings: merged, effectiveFrom: today },
      ].slice(-MAX_HISTORY_ENTRIES)

  const next: Record<string, unknown> = { ...prev, masteryHistory: newHistory }
  delete next.mastery // легаси-ключ больше не пишем, история — источник правды
  await db.update(users).set({ settings: next }).where(eq(users.id, userId))
}

/** Сбросить настройки к дефолтам — полностью, ретроактивно (как «к средним»). */
export async function resetMasterySettings(db: Db, userId: number): Promise<void> {
  const [u] = await db
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, userId))
  const prev = { ...((u?.settings as Record<string, unknown> | null) ?? {}) }
  delete prev.mastery
  delete prev.masteryHistory
  await db.update(users).set({ settings: prev }).where(eq(users.id, userId))
}
