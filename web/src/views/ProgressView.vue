<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api'
import { auth } from '@/auth'
import { clearServerSession, fetchServerSession } from '@/lib/session'
import { useRefreshOnFocus } from '@/lib/useRefreshOnFocus'
import Sparkles from '@/components/Sparkles.vue'
import MasteryBar from '@/components/MasteryBar.vue'
import type { StatsInfo } from '@/lib/types'

const router = useRouter()
const stats = ref<StatsInfo | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

/** Незаконченная тренировка (для баннера «продолжить / сбросить»). */
const unfinished = ref<{ idx: number; total: number } | null>(null)

/** Серию дней считаем по локальной полуночи — шлём свой сдвиг от UTC. */
const statsPath = () => `/stats?tz_offset=${-new Date().getTimezoneOffset()}`

async function checkUnfinished() {
  const s = await fetchServerSession()
  unfinished.value = s
    ? { idx: Math.min(s.idx + 1, s.exercises.length), total: s.exercises.length }
    : null
}

async function refreshStats() {
  try {
    stats.value = await api<StatsInfo>(statsPath())
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
    stats.value = await api<StatsInfo>(statsPath())
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

/** 84 ячейки (12 недель), от старых к новым, с числом попыток за день. */
const heatCells = computed(() => {
  const s = stats.value
  if (!s) return []
  const map = new Map(s.heatmap.map((h) => [h.day, h.count]))
  const out: { day: string; count: number }[] = []
  const now = Date.now()
  for (let i = 83; i >= 0; i--) {
    const day = new Date(now - i * 86_400_000).toISOString().slice(0, 10)
    out.push({ day, count: map.get(day) ?? 0 })
  }
  return out
})
const heatLevel = (c: number) =>
  c === 0 ? 0 : c <= 2 ? 1 : c <= 5 ? 2 : c <= 10 ? 3 : 4

const bucketBar = computed(() => {
  const b = stats.value?.buckets
  const total = b ? b.new + b.in_progress + b.learned : 0
  if (!b || !total) return null
  return {
    ...b,
    total,
    newPct: (b.new / total) * 100,
    progPct: (b.in_progress / total) * 100,
    learnedPct: (b.learned / total) * 100,
  }
})
</script>

<template>
  <main class="page">
    <Sparkles
      :spots="[
        { pos: { top: '54px', right: '30px' }, size: 15, color: '#ffc23d', delay: 0 },
        { pos: { top: '90px', right: '70px' }, size: 10, color: '#c98bff', delay: 1.1 },
      ]"
    />

    <div class="hrow">
      <h1>привет{{ auth.user?.name ? ', ' + auth.user.name : '' }}</h1>
      <button class="ghost gear" aria-label="настройки выученности" @click="router.push('/settings')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" stroke-width="2" />
          <path d="M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" stroke="currentColor" stroke-width="2" />
        </svg>
      </button>
    </div>
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

      <!-- разбивка по выученности -->
      <template v-if="bucketBar">
        <p class="label sec">по выученности</p>
        <div class="buckets">
          <span class="b-seg b-new" :style="{ width: bucketBar.newPct + '%' }" />
          <span class="b-seg b-prog" :style="{ width: bucketBar.progPct + '%' }" />
          <span class="b-seg b-learned" :style="{ width: bucketBar.learnedPct + '%' }" />
        </div>
        <div class="b-legend mono">
          <span>новое {{ bucketBar.new }}</span>
          <span class="amber">в процессе {{ bucketBar.in_progress }}</span>
          <span class="ok">выучено {{ bucketBar.learned }}</span>
        </div>
      </template>

      <!-- выученность по темам -->
      <template v-if="stats.themes.length">
        <p class="label sec">темы</p>
        <ul class="themes">
          <li v-for="t in stats.themes" :key="t.id" @click="router.push(`/folders/${t.id}`)">
            <div class="t-head">
              <span class="t-name disp">{{ t.name }}</span>
              <span class="t-meta mono">{{ t.mastery }}%</span>
            </div>
            <MasteryBar :value="t.mastery" :label="false" />
          </li>
        </ul>
      </template>

      <!-- тепловая карта активности -->
      <template v-if="stats.active_days">
        <p class="label sec">активность · 12 недель</p>
        <div class="heat">
          <span
            v-for="c in heatCells"
            :key="c.day"
            class="hc"
            :class="'l' + heatLevel(c.count)"
            :title="`${c.day}: ${c.count}`"
          />
        </div>
      </template>

      <!-- стоит повторить -->
      <template v-if="stats.weak.length">
        <p class="label sec">стоит повторить</p>
        <ul class="weak">
          <li v-for="(w, i) in stats.weak" :key="i" @click="router.push(`/words/${w.word_id}`)">
            <span class="mono w-t">{{ w.text }}</span>
            <span class="muted w-tr">{{ w.translation }}</span>
            <span class="mono w-m">{{ w.mastery }}%</span>
          </li>
        </ul>
      </template>
    </template>
  </main>
</template>

<style scoped>
.hrow {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}
.gear {
  flex: none;
  padding: 0.45rem;
  display: flex;
}
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

/* --- v2 --- */
.sec {
  display: block;
  margin: 1.75rem 0 0.6rem;
}

.buckets {
  display: flex;
  height: 10px;
  border-radius: var(--r-pill);
  overflow: hidden;
  background: var(--raise);
}
.b-seg {
  height: 100%;
}
.b-new {
  background: var(--raise);
}
.b-prog {
  background: var(--amber);
}
.b-learned {
  background: var(--ok-a);
}
.b-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
  margin-top: 0.5rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--faint);
}
.b-legend .amber {
  color: var(--amber);
}
.b-legend .ok {
  color: var(--ok-a);
}

.themes {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.themes li {
  background: var(--card);
  border-radius: var(--r-lg);
  padding: 0.75rem 1rem;
  cursor: pointer;
}
.themes li:hover {
  filter: brightness(1.1);
}
.t-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  margin-bottom: 0.45rem;
}
.t-name {
  font-weight: 800;
  font-size: 0.9rem;
}
.t-meta {
  flex: none;
  font-weight: 700;
  font-size: 0.72rem;
  color: var(--faint);
}

.heat {
  display: grid;
  grid-template-rows: repeat(7, 1fr);
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 3px;
}
.hc {
  aspect-ratio: 1;
  border-radius: 3px;
  background: var(--raise);
}
.hc.l1 {
  background: color-mix(in srgb, var(--hero-a) 28%, var(--raise));
}
.hc.l2 {
  background: color-mix(in srgb, var(--hero-a) 50%, var(--raise));
}
.hc.l3 {
  background: color-mix(in srgb, var(--hero-a) 72%, var(--raise));
}
.hc.l4 {
  background: var(--hero-a);
}

.weak {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.weak li {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  background: var(--card);
  border-radius: var(--r-md);
  padding: 0.6rem 0.9rem;
  cursor: pointer;
}
.weak li:hover {
  filter: brightness(1.1);
}
.w-t {
  font-weight: 700;
  color: var(--fg-dim);
}
.w-tr {
  flex: 1;
  min-width: 0;
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.w-m {
  flex: none;
  font-weight: 700;
  font-size: 0.72rem;
  color: var(--bad-text);
}
</style>
