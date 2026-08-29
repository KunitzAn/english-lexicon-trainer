<script setup lang="ts">
import { useRouter } from 'vue-router'
import { auth, logout } from '@/auth'

const router = useRouter()

async function onLogout() {
  await logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <header class="app-header">
    <router-link to="/" class="brand">Lexicon</router-link>
    <span class="spacer" />
    <span v-if="auth.user" class="who">{{ auth.user.name ?? auth.user.telegram_id }}</span>
    <button class="link" @click="onLogout">выйти</button>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #23262e;
}
.brand {
  font-weight: 700;
  color: var(--fg);
  text-decoration: none;
}
.spacer {
  flex: 1;
}
.who {
  color: var(--muted);
  font-size: 0.85rem;
}
.link {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0;
}
</style>
