/** Валидация иконки темы (эмодзи) и цвета (hex из самоцветной палитры фронта). */

/** Один эмодзи может занимать несколько code units (модификаторы тона, ZWJ-цепочки) — с запасом. */
export function cleanIcon(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().slice(0, 32)
  return s || null
}

export function cleanColor(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase()
  return /^#[0-9a-f]{6}$/.test(s) ? s : null
}
