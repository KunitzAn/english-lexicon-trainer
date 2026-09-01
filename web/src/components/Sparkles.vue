<script setup lang="ts">
/** Лёгкая россыпь мерцающих звёзд для заполнения пустого пространства. */
interface Spot {
  /** css-позиция, напр. { top: '80px', right: '40px' } */
  pos: Record<string, string>
  size?: number
  color?: string
  delay?: number
}

withDefaults(defineProps<{ spots?: Spot[] }>(), {
  spots: () => [
    { pos: { top: '58px', right: '92px' }, size: 15, color: '#ffc23d', delay: 0 },
    { pos: { top: '46px', right: '62px' }, size: 9, color: '#b6f04a', delay: 0.9 },
    { pos: { top: '96px', right: '120px' }, size: 11, color: '#ff6ba6', delay: 1.6 },
    { pos: { top: '132px', right: '26px' }, size: 10, color: '#8fa8ff', delay: 2.1 },
  ],
})
</script>

<template>
  <svg
    v-for="(s, i) in spots"
    :key="i"
    class="tw"
    :style="{ ...s.pos, animationDelay: (s.delay ?? 0) + 's' }"
    :width="s.size ?? 12"
    :height="s.size ?? 12"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      d="M12 2c1 5 4 8 9 9-5 1-8 4-9 9-1-5-4-8-9-9 5-1 8-4 9-9Z"
      :fill="s.color ?? '#ffc23d'"
    />
  </svg>
</template>
