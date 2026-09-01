import { onBeforeUnmount, onMounted } from 'vue'

/**
 * Вызывает `fn`, когда вкладка снова становится видимой или окно получает фокус —
 * чтобы данные, изменённые на другом устройстве, подтягивались без ручной
 * перезагрузки (этап 5). Всплеск сразу после монтирования и частые повторы гасятся.
 */
export function useRefreshOnFocus(fn: () => void, minGapMs = 4000) {
  let last = Date.now()

  const trigger = () => {
    if (document.visibilityState !== 'visible') return
    const now = Date.now()
    if (now - last < minGapMs) return
    last = now
    fn()
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', trigger)
    window.addEventListener('focus', trigger)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', trigger)
    window.removeEventListener('focus', trigger)
  })
}
