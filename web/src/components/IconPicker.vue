<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ACCENTS } from '@/lib/palette'
import { FOLDER_ICON_KEYS, FOLDER_ICON_SVG } from '@/lib/folderIcons'
import FolderIcon from '@/components/FolderIcon.vue'

const props = defineProps<{ icon: string | null; color: string | null }>()
const emit = defineEmits<{
  save: [{ icon: string | null; color: string | null }]
}>()

const open = ref(false)
const draftIcon = ref<string | null>(null)
const draftColor = ref<string | null>(null)

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
  open.value = true
  await nextTick()
  place()
}

function pick(k: string) {
  draftIcon.value = k
}
function pickColor(c: string | null) {
  draftColor.value = c
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
    <button ref="btnEl" type="button" class="ip-trigger" aria-label="иконка темы" @click="openPanel">
      <FolderIcon :icon="icon" :color="color" :size="34" />
    </button>

    <teleport to="body">
      <div v-if="open" class="ip-backdrop" @click="close(true)">
        <div ref="popEl" class="ip-pop" :style="popStyle" @click.stop>
          <div class="ip-head">
            <span class="label">иконка темы</span>
            <button type="button" class="ip-x" aria-label="закрыть" @click="close(true)">×</button>
          </div>

          <div class="ip-grid" :style="{ '--ic': draftColor || 'var(--fg-dim)' }">
            <button
              v-for="k in FOLDER_ICON_KEYS"
              :key="k"
              type="button"
              class="ip-ic"
              :class="{ sel: k === draftIcon }"
              @click="pick(k)"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                v-html="FOLDER_ICON_SVG[k]"
              />
            </button>
          </div>

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
            <label class="ip-dot ip-custom" :class="{ sel: draftColor != null && !ACCENTS.includes(draftColor) }">
              <span class="ip-custom-swatch" :style="{ background: draftColor && !ACCENTS.includes(draftColor) ? draftColor : 'conic-gradient(from 0deg, #ff6ba6, #ffc23d, #b6f04a, #22d9b3, #8fa8ff, #c98bff, #ff6ba6)' }" />
              <input
                type="color"
                :value="draftColor && /^#[0-9a-f]{6}$/i.test(draftColor) ? draftColor : '#8fa8ff'"
                @input="pickColor(($event.target as HTMLInputElement).value)"
              />
            </label>
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
.ip-trigger {
  all: unset;
  cursor: pointer;
  display: inline-flex;
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
  margin-bottom: 0.6rem;
  max-height: 13rem;
  overflow-y: auto;
}
.ip-ic {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.42rem 0;
  border-radius: var(--r-xs);
  color: var(--ic);
}
.ip-ic svg {
  width: 1.15rem;
  height: 1.15rem;
  display: block;
}
.ip-ic.sel {
  background: var(--raise);
  outline: 2px solid var(--ic);
  outline-offset: -2px;
}

.ip-colors {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
  flex-wrap: wrap;
}
.ip-dot {
  all: unset;
  cursor: pointer;
  box-sizing: border-box;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
  flex: none;
  position: relative;
  overflow: hidden;
}
.ip-dot.sel {
  outline: 2px solid var(--fg);
  outline-offset: 2px;
}
.ip-custom {
  display: inline-flex;
}
.ip-custom-swatch {
  position: absolute;
  inset: 0;
  border-radius: 50%;
}
.ip-custom input {
  position: absolute;
  inset: 0;
  opacity: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  border: none;
  cursor: pointer;
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
