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
      router.push({ name: 'progress' })
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
  <main class="home login">
    <p class="brand disp">lexicon</p>
    <h1>вход</h1>
    <p class="muted sub">English&nbsp;Lexicon&nbsp;Trainer — личный тренажёр лексики C1/C2</p>

    <div ref="widgetHost" class="widget"></div>

    <p v-if="err" class="err">{{ err }}</p>
    <p class="muted small note">
      Первый вошедший становится владельцем. Остальным доступ выдаёт владелец.
    </p>
  </main>
</template>

<style scoped>
.login {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: center;
}
.brand {
  font-weight: 800;
  font-size: 1.05rem;
  letter-spacing: -0.03em;
  color: var(--faint);
  margin: 0 0 0.5rem;
}
.login h1 {
  font-size: 2.4rem;
}
.sub {
  max-width: 20rem;
  margin: 0.25rem auto 2rem;
  font-size: 0.9rem;
}
.widget {
  min-height: 3rem;
  display: flex;
  justify-content: center;
}
.note {
  max-width: 22rem;
  margin: 1.5rem auto 0;
}
</style>
