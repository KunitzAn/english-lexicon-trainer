<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { loginWithTelegram } from '@/auth'

const router = useRouter()
const err = ref<string | null>(null)
const widgetHost = ref<HTMLElement | null>(null)
const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME

function humanError(message: string): string {
  if (message.includes('not invited')) {
    return 'Доступ не выдан. Попроси владельца добавить твой Telegram.'
  }
  if (message.includes('telegram auth failed')) {
    return 'Не удалось проверить подпись Telegram. Попробуй ещё раз.'
  }
  return message
}

onMounted(() => {
  ;(window as unknown as Record<string, unknown>).onTelegramAuth = async (
    user: unknown,
  ) => {
    err.value = null
    try {
      await loginWithTelegram(user)
      router.push({ name: 'folders' })
    } catch (e) {
      err.value = humanError(e instanceof Error ? e.message : String(e))
    }
  }

  if (!botUsername) {
    err.value = 'VITE_TELEGRAM_BOT_USERNAME не задан при сборке'
    return
  }

  const s = document.createElement('script')
  s.src = 'https://telegram.org/js/telegram-widget.js?22'
  s.async = true
  s.setAttribute('data-telegram-login', botUsername)
  s.setAttribute('data-size', 'large')
  s.setAttribute('data-onauth', 'onTelegramAuth(user)')
  widgetHost.value?.appendChild(s)
})
</script>

<template>
  <main class="home">
    <h1>Вход</h1>
    <p class="muted">English Lexicon Trainer</p>

    <div ref="widgetHost" class="card"></div>

    <p v-if="err" class="err">{{ err }}</p>
    <p class="muted small">
      Первый вошедший становится владельцем. Остальным доступ выдаёт владелец.
    </p>
  </main>
</template>
