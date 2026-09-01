<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api'
import { auth } from '@/auth'
import { clearServerSession, fetchServerSession } from '@/lib/session'
import { useRefreshOnFocus } from '@/lib/useRefreshOnFocus'
import Sparkles from '@/components/Sparkles.vue'
import type { StatsInfo } from '@/lib/types'

const router = useRouter()
const stats = ref<StatsInfo | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

/** Незаконченная тренировка (для баннера «продолжить / сбросить»). */
const unfinished = ref<{ idx: number; total: number } | null>(null)

async function checkUnfinished() {
  const s = await fetchServerSession()
  unfinished.value = s
    ? { idx: Math.min(s.idx + 1, s.exercises.length), total: s.exercises.length }
    : null
}

async function refreshStats() {
  try {
    stats.value = await api<StatsInfo>('/stats')
  } catch {
    /* тихо — на экране уже есть данные */
  }
}

function dropUnfinished() {
  clearServerSession()
  unfinished.value = null
}

onMounted(async () => {
  try {
    stats.value = await api<StatsInfo>('/stats')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
  checkUnfinished()
})

useRefreshOnFocus(() => {
  refreshStats()
  checkUnfinished()
})

const pct = (a: number | null) => (a == null ? '—' : Math.round(a * 100) + '%')
</script>

<template>
  <main class="page">
    <Sparkles
      :spots="[
        { pos: { top: '54px', right: '30px' }, size: 15, color: '#ffc23d', delay: 0 },
        { pos: { top: '90px', right: '70px' }, size: 10, color: '#c98bff', delay: 1.1 },
      ]"
    />

    <h1>привет{{ auth.user?.name ? ', ' + auth.user.name : '' }}</h1>
    <p class="sub muted">твой прогресс в лексике</p>

    <div v-if="unfinished" class="frame resume-banner-frame">
      <div class="resume-banner">
        <div class="rb-text">
          <span class="label">незаконченная тренировка</span>
          <span class="mono rb-where">{{ unfinished.idx }} / {{ unfinished.total }}</span>
        </div>
        <div class="rb-acts">
          <button class="primary" @click="router.push('/train/run')">продолжить</button>
          <button class="ghost" @click="dropUnfinished">сбросить</button>
        </div>
      </div>
    </div>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="loading" class="muted">загрузка…</p>

    <template v-else-if="stats">
      <div class="grid">
        <div class="stat">
          <span class="mono n">{{ stats.streak_days }}</span>
          <span class="label">дней подряд</span>
        </div>
        <div class="stat">
          <span class="mono n hero">{{ pct(stats.accuracy) }}</span>
          <span class="label">точность</span>
        </div>
        <div class="stat">
          <span class="mono n">{{ stats.senses_attempted }}<span class="of mono">/{{ stats.senses_total }}</span></span>
          <span class="label">тронуто значений</span>
        </div>
        <div class="stat">
          <span class="mono n">{{ stats.words_total }}</span>
          <span class="label">слов в словаре</span>
        </div>
      </div>

      <p v-if="!stats.senses_total" class="empty-hint muted">
        начни с добавления слов — вкладка «слова»
      </p>

      <div class="frame cta-frame">
        <button class="primary cta" @click="router.push('/train')">
          тренировка
          <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5v14l11-7-11-7Z" fill="currentColor" />
          </svg>
        </button>
      </div>

      <div class="nav2">
        <button class="tile sapphire" @click="router.push('/folders')">
          <span class="disp t">темы</span>
        </button>
        <button class="tile amethyst" @click="router.push('/words')">
          <span class="disp t">слова</span>
        </button>
      </div>
    </template>
  </main>
</template>

<style scoped>
.sub {
  margin: -0.4rem 0 1.5rem;
  font-size: 0.9rem;
}

.resume-banner-frame {
  margin-bottom: 1.25rem;
}
.resume-banner {
  background: var(--card);
  border-radius: calc(var(--r-xl) - 2px);
  padding: 0.85rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.rb-text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.rb-where {
  font-size: 0.9rem;
  color: var(--fg);
  font-weight: 700;
}
.rb-acts {
  display: flex;
  gap: 0.4rem;
}
.rb-acts .primary {
  padding: 0.5rem 0.9rem;
  font-size: 0.85rem;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}
.stat {
  background: var(--card);
  border-radius: var(--r-lg);
  padding: 0.9rem 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.stat .n {
  font-weight: 700;
  font-size: 1.9rem;
  line-height: 1;
  color: var(--fg);
}
.stat .n.hero {
  color: var(--hero-a);
}
.stat .of {
  font-weight: 500;
  font-size: 1.1rem;
  color: var(--faint);
}

.empty-hint {
  margin: -0.75rem 0 1.5rem;
  font-size: 0.85rem;
}

.cta-frame {
  margin-bottom: 0.6rem;
}
.cta {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem;
  font-size: 1.1rem;
}

.nav2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}
.tile {
  padding: 1rem;
  border-radius: var(--r-lg);
  text-align: center;
}
.tile .t {
  font-size: 0.95rem;
}
.tile.sapphire {
  background: linear-gradient(160deg, var(--sapphire-a), var(--sapphire-b));
  color: #0c1230;
}
.tile.amethyst {
  background: linear-gradient(160deg, var(--amethyst-a), var(--amethyst-b));
  color: #1f0836;
}
</style>
