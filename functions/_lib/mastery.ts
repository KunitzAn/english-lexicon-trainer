import { and, eq, inArray, sql } from 'drizzle-orm'
import type { Db } from './db'
import { attempts, users } from '../../db/schema'

/**
 * Модель выученности значения (этап 5.1). Проценты 0–100, считается из `attempts`
 * проходом по дням с активностью + настройки. День — по локальной полуночи юзера.
 * Пока настройки не редактируются из UI (этап 5.1, шаг 3) — используем дефолты.
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

/** Локальная дата 'YYYY-MM-DD' момента `ms` при сдвиге `offsetMin` минут от UTC. */
export function localDay(ms: number, offsetMin: number): string {
  return new Date(ms + offsetMin * 60_000).toISOString().slice(0, 10)
}

const clamp = (x: number) => Math.max(0, Math.min(100, x))
const dayIndex = (d: string) => Math.round(Date.parse(d + 'T00:00:00Z') / 86_400_000)

export interface MasteryDay {
  day: string // 'YYYY-MM-DD' (локальная дата)
  answers: (boolean | null)[] // true верно, false неверно, null подсказка — в порядке ответа
}

/**
 * Прогон выученности значения. `days` — по возрастанию даты, `today` — локальная
 * дата пользователя. Возвращает целое 0..100.
 */
export function masteryOf(
  days: MasteryDay[],
  today: string,
  s: MasterySettings = DEFAULT_MASTERY_SETTINGS,
): number {
  if (!days.length) return 0

  const decayFor = (gapDays: number, learned: boolean): number => {
    if (!s.decayEnabled) return 0
    const applies = s.decayAfterLearned || !learned
    if (!applies) return 0
    const rate = learned ? s.decayPerDayLearned : s.decayPerDay
    const idle = gapDays - 1 // дни строго между активными
    const eff = idle - s.decayGraceDays
    return eff > 0 ? rate * eff : 0
  }

  let m = 0
  let prev: number | null = null

  for (const { day, answers } of days) {
    const di = dayIndex(day)
    if (prev !== null) {
      m = Math.max(0, m - decayFor(di - prev, m >= s.learnedThreshold))
    }
    let correctSeen = 0
    for (const a of answers) {
      if (a === true) {
        const g =
          correctSeen === 0
            ? s.gainNewDay
            : correctSeen === 1
              ? s.gainSameDay
              : s.gainRepeatMore
        m = clamp(m + g)
        correctSeen++
      } else if (a === false) {
        m = clamp(m - s.penaltyWrong)
      }
      // подсказка (null) — без изменений
    }
    prev = di
  }

  if (prev !== null) {
    m = Math.max(0, m - decayFor(dayIndex(today) - prev, m >= s.learnedThreshold))
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
  s: MasterySettings = DEFAULT_MASTERY_SETTINGS,
): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  for (const id of senseIds) out.set(id, 0)
  if (!senseIds.length) return out

  const rows = await db
    .select({
      senseId: attempts.wordSenseId,
      isCorrect: attempts.isCorrect,
      day: sql<string>`to_char((${attempts.answeredAt} at time zone 'UTC') + make_interval(mins => ${offsetMin}), 'YYYY-MM-DD')`,
    })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), inArray(attempts.wordSenseId, senseIds)))
    .orderBy(attempts.wordSenseId, attempts.answeredAt)

  const today = localDay(Date.now(), offsetMin)

  let cur = -1
  let days: MasteryDay[] = []
  const flush = () => {
    if (cur !== -1) out.set(cur, masteryOf(days, today, s))
  }
  for (const r of rows) {
    if (r.senseId !== cur) {
      flush()
      cur = r.senseId
      days = []
    }
    const last = days[days.length - 1]
    if (last && last.day === r.day) last.answers.push(r.isCorrect)
    else days.push({ day: r.day, answers: [r.isCorrect] })
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

/** Настройки выученности пользователя (дефолты, поверх — `users.settings.mastery`). */
export async function loadMasterySettings(
  db: Db,
  userId: number,
): Promise<MasterySettings> {
  const [u] = await db
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, userId))
  const raw = (u?.settings as Record<string, unknown> | null)?.mastery
  return mergeMasterySettings(raw)
}
