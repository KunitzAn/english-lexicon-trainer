<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '@/api'
import { lookupWord, type WordLookup } from '@/lib/wordLookup'
import type { FolderRow, WordGloss } from '@/lib/types'

const props = defineProps<{ text: string; gloss?: WordGloss }>()

/** Список тем — один запрос на вкладку, лениво при первом открытии всплывашки. */
let foldersPromise: Promise<FolderRow[]> | null = null
function loadFolders(): Promise<FolderRow[]> {
  if (!foldersPromise) {
    foldersPromise = api<{ folders: FolderRow[] }>('/folders')
      .then((r) => r.folders)
      .catch(() => [])
  }
  return foldersPromise
}

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

// свой перевод — не только варианты онлайн-словаря
const customOpen = ref(false)
const customText = ref('')
const customBusy = ref(false)
const customError = ref<string | null>(null)
const customAdded = ref<string[]>([])

const folders = ref<FolderRow[]>([])
const selectedFolder = ref('')

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
  addState.value = {}
  customOpen.value = false
  customText.value = ''
  customBusy.value = false
  customError.value = null
  customAdded.value = []
  selectedFolder.value = ''
  loadFolders().then((f) => {
    folders.value = f
    nextTick(() => place())
  })

  // перевод из упражнения (сгенерирован вместе с ним) — показываем сразу, без запроса
  const fromGloss = props.gloss?.[word.trim().toLowerCase()]?.trim() || null
  if (fromGloss) {
    result.value = {
      variants: [{ translation: fromGloss, source: 'api' }],
      ok: true,
      detail: 'из упражнения',
      inVocabulary: false,
    }
    loading.value = false
  } else {
    result.value = null
    loading.value = true
  }
  await nextTick()
  place()

  const res = await lookupWord(word, fromGloss ? { noRemote: true } : undefined)
  if (active.value?.word !== word) return
  if (fromGloss) {
    const seen = new Set([fromGloss.toLowerCase()])
    const merged = [{ translation: fromGloss, source: 'api' as const }]
    for (const v of res.variants) {
      const k = v.translation.trim().toLowerCase()
      if (!seen.has(k)) {
        seen.add(k)
        merged.push(v)
      }
    }
    result.value = {
      variants: merged,
      ok: true,
      detail: res.detail,
      inVocabulary: res.inVocabulary,
    }
  } else {
    result.value = res
  }
  loading.value = false
  await nextTick()
  place()
}

function close() {
  active.value = null
  result.value = null
  loading.value = false
}

function folderIds(): number[] {
  const fid = Number(selectedFolder.value)
  return fid ? [fid] : []
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
        folder_ids: folderIds(),
      }),
    })
    addState.value = {
      ...addState.value,
      [translation]: r.added_senses > 0 ? 'added' : 'exists',
    }
    if (result.value) result.value = { ...result.value, inVocabulary: true }
  } catch {
    addState.value = { ...addState.value, [translation]: 'error' }
  }
}

async function openCustom() {
  customOpen.value = true
  customError.value = null
  await nextTick()
  place()
  ;(popEl.value?.querySelector<HTMLInputElement>('.tt-input'))?.focus()
}

async function addCustom() {
  const a = active.value
  const t = customText.value.trim()
  if (!a || !t || customBusy.value) return
  customBusy.value = true
  customError.value = null
  try {
    await api('/words', {
      method: 'POST',
      body: JSON.stringify({
        text: a.word,
        senses: [{ translation: t, source: 'manual' }],
        folder_ids: folderIds(),
      }),
    })
    customAdded.value = [...customAdded.value, t]
    customText.value = ''
    if (result.value) result.value = { ...result.value, inVocabulary: true }
  } catch (e) {
    customError.value = e instanceof Error ? e.message : String(e)
  } finally {
    customBusy.value = false
    await nextTick()
    place()
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
        <p v-if="result?.inVocabulary" class="tt-in-vocab">уже в словаре</p>

        <select v-if="folders.length" v-model="selectedFolder" class="tt-folder">
          <option value="">без темы</option>
          <option v-for="f in folders" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>

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

        <div v-if="!loading" class="tt-custom">
          <ul v-if="customAdded.length" class="tt-list">
            <li v-for="t in customAdded" :key="t">
              <span class="tt-tr">{{ t }}</span>
              <span class="tt-add added">добавлено ✓</span>
            </li>
          </ul>
          <button v-if="!customOpen" type="button" class="tt-more" @click="openCustom">
            + свой перевод
          </button>
          <form v-else class="tt-custom-row" @submit.prevent="addCustom">
            <input v-model="customText" class="tt-input" placeholder="свой перевод" />
            <button type="submit" class="tt-add" :disabled="!customText.trim() || customBusy">
              {{ customBusy ? '…' : 'добавить' }}
            </button>
          </form>
          <p v-if="customError" class="tt-muted tt-err">не сохранилось: {{ customError }}</p>
        </div>
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
.tt-in-vocab {
  color: var(--ok-text);
  font-size: 0.72rem;
  font-weight: 700;
  margin: -0.25rem 0 0.5rem;
}
.tt-folder {
  font-size: 0.8rem;
  padding: 0.35rem 0.5rem;
  margin-bottom: 0.5rem;
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

.tt-custom {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--line);
}
.tt-custom .tt-list {
  margin-bottom: 0.35rem;
}
.tt-more {
  all: unset;
  cursor: pointer;
  font-size: 0.82rem;
  color: var(--link);
}
.tt-custom-row {
  display: flex;
  gap: 0.4rem;
}
.tt-input {
  flex: 1;
  min-width: 0;
  font-size: 0.85rem;
  padding: 0.4rem 0.55rem;
}
.tt-err {
  color: var(--bad-text);
  margin-top: 0.35rem;
}
</style>
