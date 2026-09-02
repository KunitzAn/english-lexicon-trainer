<script setup lang="ts">
/** Тонкая полоса выученности 0..100 с меткой (этап 5.1). */
withDefaults(defineProps<{ value?: number; label?: boolean }>(), {
  value: 0,
  label: true,
})
</script>

<template>
  <div class="mb">
    <span class="mb-track"><i :style="{ width: Math.max(0, Math.min(100, value ?? 0)) + '%' }" /></span>
    <span v-if="label" class="mb-val">
      {{ (value ?? 0) === 0 ? 'новое' : Math.round(value ?? 0) + '%' }}
    </span>
  </div>
</template>

<style scoped>
.mb {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}
.mb-track {
  flex: 1;
  height: 5px;
  border-radius: var(--r-pill);
  background: var(--raise);
  overflow: hidden;
}
.mb-track i {
  display: block;
  height: 100%;
  border-radius: var(--r-pill);
  background: linear-gradient(90deg, var(--hero-a), var(--ok-a));
}
.mb-val {
  flex: none;
  min-width: 2.6rem;
  text-align: right;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--faint);
}
</style>
