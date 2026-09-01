<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { auth, logout } from '@/auth'

const router = useRouter()

const initial = computed(() => {
  const n = auth.user?.name ?? String(auth.user?.telegram_id ?? '?')
  return n.trim().charAt(0).toUpperCase() || '?'
})

async function onLogout() {
  await logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <header class="app-header">
    <router-link to="/" class="brand disp">lexicon</router-link>
    <span class="spacer" />
    <button class="link" @click="onLogout">выйти</button>
    <span v-if="auth.user" class="ava disp" :title="auth.user.name ?? String(auth.user.telegram_id)">
      {{ initial }}
    </span>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  max-width: 40rem;
  margin: 0 auto;
  padding: 0.85rem 1.125rem;
}
.brand {
  font-weight: 800;
  font-size: 1.15rem;
  letter-spacing: -0.03em;
  color: var(--fg);
}
.brand:hover {
  color: var(--fg);
}
.spacer {
  flex: 1;
}
.link {
  font-size: 0.85rem;
}
.ava {
  width: 30px;
  height: 30px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-sm);
  font-weight: 800;
  font-size: 0.8rem;
  color: var(--hero-ink);
  background: linear-gradient(160deg, var(--hero-a), var(--hero-b));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
}
</style>
