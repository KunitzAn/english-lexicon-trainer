<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '@/api'
import { lookupWord, type WordLookup } from '@/lib/wordLookup'

const props = defineProps<{ text: string }>()

/** Разбиваем на слова (латиница + внутр. апострофы/дефисы) и разделители. */
const tokens = computed(() => {
  const parts = props.text.split(/([A-Za-z][A-Za-z'’-]*)/)
  return parts.map((s, i) => ({ s, word: i % 2 === 1 && s.length >= 2 }))
})

type AddState = 'idle' | 'saving' | 'added' | 'exists' | 'error'

const active = ref<{ word: string; cx: number; below: number; above: number } | null>(
  null,
)
const loading = ref(false)
const result = ref<WordLookup | null>(null)
const addState = ref<Record<string, AddState>>({})

const popEl = ref<HTMLElement | null>(null)
const popStyle = ref<Record<string, string>>({})

function place() {
  const a = active.value
  const el = popEl.value
  if (!a || !el) return
  const w = el.offsetWidth || 260
  const h = el.offsetHeight || 160
  const gap = 8
  const openDown = a.below + gap + h < window.innerHeight - 8 || a.above - gap - h < 8
  const left = Math.min(
    Math.max(a.cx - w / 2, 8),
    window.innerWidth - w - 8,
  )
  popStyle.value = openDown
    ? { left: `${left}px`, top: `${a.below + gap}px` }
    : { left: `${left}px`, top: `${a.above - gap - h}px` }
}

async function tap(ev: MouseEvent, word: string) {
  const r = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  active.value = {
    word,
    cx: r.left + r.width / 2,
    below: r.bottom,
    above: r.top,
  }
  loading.value = true
  result.value = null
  addState.value = {}
  await nextTick()
  place()
  const res = await lookupWord(word)
  if (active.value?.word === word) {
    result.value = res
    loading.value = false
    await nextTick()
    place()
  }
}

function close() {
  active.value = null
  result.value = null
  loading.value = false
}

async function add(translation: string) {
  const a = active.value
  if (!a) return
  addState.value = { ...addState.value, [translation]: 'saving' }
  try {
    const r = await api<{ created: boolean; added_senses: number }>('/words', {
      method: 'POST',
      body: JSON.stringify({
        text: a.word,
        senses: [{ translation, source: 'api' }],
        folder_ids: [],
      }),
    })
    addState.value = {
      ...addState.value,
      [translation]: r.added_senses > 0 ? 'added' : 'exists',
    }
  } catch {
    addState.value = { ...addState.value, [translation]: 'error' }
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const addLabel: Record<AddState, string> = {
  idle: '+ в словарь',
  saving: '…',
  added: 'добавлено ✓',
  exists: 'уже в словаре',
  error: 'ошибка',
}
</script>

<template><span class="tt"><template
  v-for="(t, i) in tokens"
  :key="i"
><button
    v-if="t.word"
    type="button"
    class="tap-word"
    @click="tap($event, t.s)"
  >{{ t.s }}</button><template v-else>{{ t.s }}</template></template>

  <teleport to="body">
    <div v-if="active" class="tt-backdrop" @click="close">
      <div ref="popEl" class="tt-pop" :style="popStyle" @click.stop>
        <div class="tt-head">
          <span class="tt-word mono">{{ active.word.toLowerCase() }}</span>
          <button type="button" class="tt-x" aria-label="закрыть" @click="close">×</button>
        </div>

        <p v-if="loading" class="tt-muted">ищем…</p>

        <template v-else-if="result && result.variants.length">
          <ul class="tt-list">
            <li v-for="v in result.variants.slice(0, 6)" :key="v.translation">
              <span class="tt-tr">{{ v.translation }}</span>
              <button
                type="button"
                class="tt-add"
                :class="addState[v.translation] || 'idle'"
                :disabled="['saving', 'added', 'exists'].includes(addState[v.translation] || '')"
                @click="add(v.translation)"
              >
                {{ addLabel[addState[v.translation] || 'idle'] }}
              </button>
            </li>
          </ul>
        </template>

        <p v-else class="tt-muted">перевод не найден</p>
      </div>
    </div>
  </teleport>
</span></template>

<style scoped>
.tt {
  /* прозрачно для потока текста */
}
.tap-word {
  all: unset;
  cursor: pointer;
  border-bottom: 1px dotted color-mix(in srgb, var(--faint) 55%, transparent);
}
.tap-word:active {
  color: var(--hero-a);
  border-bottom-color: var(--hero-a);
}

.tt-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: transparent;
}
.tt-pop {
  position: fixed;
  width: min(17rem, calc(100vw - 1.5rem));
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.55);
  padding: 0.7rem 0.75rem 0.75rem;
  font-family: var(--font-ui);
}
.tt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.tt-word {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--fg);
  word-break: break-word;
}
.tt-x {
  all: unset;
  cursor: pointer;
  font-size: 1.25rem;
  line-height: 1;
  color: var(--faint);
  padding: 0 0.15rem;
}
.tt-muted {
  color: var(--muted);
  font-size: 0.85rem;
  margin: 0.15rem 0 0;
}
.tt-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.tt-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.tt-tr {
  font-size: 0.9rem;
  color: var(--fg-dim);
  min-width: 0;
  word-break: break-word;
}
.tt-add {
  all: unset;
  flex: none;
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.28rem 0.5rem;
  border-radius: var(--r-xs);
  background: var(--raise);
  color: var(--fg-dim);
  white-space: nowrap;
}
.tt-add.added {
  background: var(--grad-ok);
  color: var(--ok-ink);
}
.tt-add.exists {
  background: transparent;
  color: var(--faint);
}
.tt-add.error {
  color: var(--bad-text);
}
</style>
