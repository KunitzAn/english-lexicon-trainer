<script setup lang="ts">
import { computed } from 'vue'
import { FOLDER_ICON_SVG } from '@/lib/folderIcons'

const props = withDefaults(
  defineProps<{
    icon?: string | null
    color?: string | null
    /** Диаметр кружка-свотча в px. 0 — без кружка, только глиф. */
    size?: number
    bare?: boolean
  }>(),
  { icon: null, color: null, size: 34, bare: false },
)

const svg = computed(() => (props.icon ? FOLDER_ICON_SVG[props.icon] : undefined))
/** Старое значение-эмодзи (до перехода на SVG-иконки) — показываем как есть. */
const emoji = computed(() =>
  props.icon && !svg.value ? props.icon : null,
)
const tint = computed(() => props.color || 'var(--muted)')
const glyph = computed(() =>
  props.bare ? props.size || 18 : Math.round((props.size || 34) * 0.56),
)
</script>

<template>
  <span
    class="fi"
    :class="{ bare }"
    :style="{
      '--ic': tint,
      width: bare ? undefined : size + 'px',
      height: bare ? undefined : size + 'px',
    }"
  >
    <svg
      v-if="svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      :style="{ width: glyph + 'px', height: glyph + 'px' }"
      v-html="svg"
    />
    <span v-else-if="emoji" class="fi-emoji">{{ emoji }}</span>
    <span v-else class="fi-empty">+</span>
  </span>
</template>

<style scoped>
.fi {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--ic) 16%, var(--card-2));
  border: 1px solid color-mix(in srgb, var(--ic) 40%, transparent);
  color: var(--ic);
}
.fi.bare {
  background: none;
  border: none;
}
.fi svg {
  display: block;
}
.fi-emoji {
  font-size: 1.05rem;
  line-height: 1;
}
.fi-empty {
  color: var(--faint);
  font-weight: 800;
  font-size: 0.95rem;
}
</style>
