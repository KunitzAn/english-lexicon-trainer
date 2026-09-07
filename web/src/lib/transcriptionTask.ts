import { reactive } from 'vue'
import { api } from '@/api'
import { fetchPronunciation } from './pronunciation'

/**
 * Фоновая генерация транскрипции. Задача живёт сама по себе — не привязана к
 * компоненту, поэтому переживает уход со страницы: если передан `wordId`,
 * по завершении делает PATCH и слово получит транскрипцию к следующему открытию.
 */

/** Слова (lowercase), для которых транскрипция сейчас генерится — для спиннера. */
const running = reactive(new Set<string>())

export function isTranscribing(word: string): boolean {
  return running.has(word.trim().toLowerCase())
}

interface Opts {
  /** уже сохранённое слово — по завершении сделать PATCH /words/:id */
  wordId?: number
  /** положить результат в UI, если компонент ещё жив */
  onResult?: (ipa: string | null) => void
}

export function generateTranscription(rawWord: string, opts: Opts = {}): void {
  const w = rawWord.trim().toLowerCase()
  if (!w || /\s/.test(w)) return
  if (running.has(w)) return
  running.add(w)

  void (async () => {
    let ipa: string | null = null
    try {
      ipa = await fetchPronunciation(w, { force: true })
      if (ipa && opts.wordId != null) {
        await api(`/words/${opts.wordId}`, {
          method: 'PATCH',
          body: JSON.stringify({ transcription: ipa }),
        })
      }
    } catch (e) {
      console.warn(`[транскрипция] фоновая задача упала для «${w}»:`, e)
    } finally {
      running.delete(w)
      opts.onResult?.(ipa)
    }
  })()
}
