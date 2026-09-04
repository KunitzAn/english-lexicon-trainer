<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ACCENTS, FOLDER_EMOJI } from '@/lib/palette'

const props = defineProps<{ icon: string | null; color: string | null }>()
const emit = defineEmits<{
  save: [{ icon: string | null; color: string | null }]
}>()

const open = ref(false)
const draftIcon = ref<string | null>(null)
const draftColor = ref<string | null>(null)
const customText = ref('')

const btnEl = ref<HTMLElement | null>(null)
const popEl = ref<HTMLElement | null>(null)
const popStyle = ref<Record<string, string>>({})

function place() {
  const btn = btnEl.value
  const el = popEl.value
  if (!btn || !el) return
  const r = btn.getBoundingClientRect()
  const w = el.offsetWidth || 280
  const h = el.offsetHeight || 260
  const gap = 8
  const openDown = r.bottom + gap + h < window.innerHeight - 8 || r.top - gap - h < 8
  const left = Math.min(Math.max(r.left - 4, 8), window.innerWidth - w - 8)
  popStyle.value = openDown
    ? { left: `${left}px`, top: `${r.bottom + gap}px` }
    : { left: `${left}px`, top: `${r.top - gap - h}px` }
}

async function openPanel() {
  draftIcon.value = props.icon
  draftColor.value = props.color
  customText.value = ''
  open.value = true
  await nextTick()
  place()
}

function pick(e: string) {
  draftIcon.value = e
}
function pickColor(c: string | null) {
  draftColor.value = c
}
function applyCustom() {
  const s = customText.value.trim()
  if (s) draftIcon.value = s
  customText.value = ''
}
function clearAll() {
  draftIcon.value = null
  draftColor.value = null
}

function close(save: boolean) {
  if (save && (draftIcon.value !== props.icon || draftColor.value !== props.color)) {
    emit('save', { icon: draftIcon.value, color: draftColor.value })
  }
  open.value = false
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close(true)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <span class="ip">
    <button
      ref="btnEl"
      type="button"
      class="ip-swatch"
      :style="{ '--sw-color': color ?? 'var(--raise)' }"
      aria-label="иконка темы"
      @click="openPanel"
    >
      <span v-if="icon">{{ icon }}</span>
      <span v-else class="ip-empty">+</span>
    </button>

    <teleport to="body">
      <div v-if="open" class="ip-backdrop" @click="close(true)">
        <div ref="popEl" class="ip-pop" :style="popStyle" @click.stop>
          <div class="ip-head">
            <span class="label">иконка темы</span>
            <button type="button" class="ip-x" aria-label="закрыть" @click="close(true)">×</button>
          </div>

          <div class="ip-grid">
            <button
              v-for="e in FOLDER_EMOJI"
              :key="e"
              type="button"
              class="ip-emoji"
              :class="{ sel: e === draftIcon }"
              @click="pick(e)"
            >
              {{ e }}
            </button>
          </div>

          <form class="ip-custom" @submit.prevent="applyCustom">
            <input v-model="customText" class="ip-input" placeholder="свой эмодзи" maxlength="8" />
            <button type="submit" class="ip-apply" :disabled="!customText.trim()">ок</button>
          </form>

          <div class="ip-colors">
            <button
              v-for="c in ACCENTS"
              :key="c"
              type="button"
              class="ip-dot"
              :class="{ sel: c === draftColor }"
              :style="{ background: c }"
              :aria-label="`цвет ${c}`"
              @click="pickColor(c)"
            />
            <button
              type="button"
              class="ip-dot ip-none"
              :class="{ sel: !draftColor }"
              aria-label="без цвета"
              @click="pickColor(null)"
            >
              –
            </button>
          </div>

          <button type="button" class="ip-clear" @click="clearAll">убрать иконку</button>
        </div>
      </div>
    </teleport>
  </span>
</template>

<style scoped>
.ip {
  display: inline-flex;
}
.ip-swatch {
  all: unset;
  cursor: pointer;
  flex: none;
  width: 2.3rem;
  height: 2.3rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  line-height: 1;
  background: color-mix(in srgb, var(--sw-color) 30%, var(--card-2));
  border: 1px solid color-mix(in srgb, var(--sw-color) 55%, transparent);
}
.ip-empty {
  color: var(--faint);
  font-weight: 800;
  font-size: 1rem;
}

.ip-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: transparent;
}
.ip-pop {
  position: fixed;
  width: min(19rem, calc(100vw - 1.5rem));
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.55);
  padding: 0.7rem 0.75rem 0.8rem;
  font-family: var(--font-ui);
}
.ip-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.55rem;
}
.ip-x {
  all: unset;
  cursor: pointer;
  font-size: 1.25rem;
  line-height: 1;
  color: var(--faint);
  padding: 0 0.15rem;
}

.ip-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 0.2rem;
  margin-bottom: 0.55rem;
}
.ip-emoji {
  all: unset;
  cursor: pointer;
  text-align: center;
  font-size: 1.15rem;
  line-height: 1;
  padding: 0.4rem 0;
  border-radius: var(--r-xs);
}
.ip-emoji.sel {
  background: var(--raise);
  outline: 2px solid var(--hero-a);
  outline-offset: -2px;
}

.ip-custom {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 0.6rem;
}
.ip-input {
  flex: 1;
  min-width: 0;
  font-size: 0.85rem;
  padding: 0.4rem 0.55rem;
}
.ip-apply {
  flex: none;
  font-size: 0.78rem;
  padding: 0.4rem 0.7rem;
}

.ip-colors {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
}
.ip-dot {
  all: unset;
  cursor: pointer;
  box-sizing: border-box;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
  flex: none;
}
.ip-dot.sel {
  outline: 2px solid var(--fg);
  outline-offset: 2px;
}
.ip-none {
  background: var(--card-2);
  border: 1px dashed var(--faint);
  color: var(--faint);
  font-size: 0.9rem;
  text-align: center;
  line-height: 1.5rem;
}

.ip-clear {
  all: unset;
  cursor: pointer;
  font-size: 0.78rem;
  color: var(--link);
}
</style>
