/** trim + схлопывание пробелов, регистр сохраняется (для отображения). */
export function cleanText(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}

/** Нормализованная форма для уникальности и поиска. */
export function normText(s: string): string {
  return cleanText(s).toLowerCase()
}

export function isPhrase(cleaned: string): boolean {
  return cleaned.includes(' ')
}
