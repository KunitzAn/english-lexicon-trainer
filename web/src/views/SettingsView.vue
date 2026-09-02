<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api'
import type { MasterySettings } from '@/lib/types'

const router = useRouter()

const form = reactive<MasterySettings>({
  gainNewDay: 20,
  gainSameDay: 5,
  gainRepeatMore: 2,
  penaltyWrong: 15,
  learnedThreshold: 100,
  decayEnabled: true,
  decayPerDay: 5,
  decayAfterLearned: false,
  decayPerDayLearned: 0,
  decayGraceDays: 3,
})

const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const savedAt = ref(false)

function apply(s: MasterySettings) {
  Object.assign(form, s)
}

onMounted(async () => {
  try {
    const r = await api<{ mastery: MasterySettings }>('/settings')
    apply(r.mastery)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
})

const daysToLearned = computed(() =>
  form.gainNewDay > 0 ? Math.ceil(form.learnedThreshold / form.gainNewDay) : '∞',
)

async function save() {
  saving.value = true
  error.value = null
  savedAt.value = false
  try {
    const r = await api<{ mastery: MasterySettings }>('/settings', {
      method: 'PUT',
      body: JSON.stringify({ mastery: form }),
    })
    apply(r.mastery)
    savedAt.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}

async function resetDefaults() {
  if (!confirm('Сбросить настройки выученности к средним?')) return
  saving.value = true
  error.value = null
  try {
    const r = await api<{ mastery: MasterySettings }>('/settings', { method: 'DELETE' })
    apply(r.mastery)
    savedAt.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="page">
    <button class="ghost back" @click="router.push('/')">← прогресс</button>
    <h1>выученность</h1>
    <p class="sub muted">
      как полоса выученности реагирует на ответы. изменения применяются со
      следующего открытия списка слов.
    </p>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="loading" class="muted">загрузка…</p>

    <template v-else>
      <section class="card">
        <h2>прирост за верный ответ</h2>
        <label class="fld">
          <span>в новый день</span>
          <span class="in"><input type="number" min="1" max="100" v-model.number="form.gainNewDay" />%</span>
        </label>
        <label class="fld">
          <span>повтор в тот же день</span>
          <span class="in"><input type="number" min="0" max="100" v-model.number="form.gainSameDay" />%</span>
        </label>
        <label class="fld">
          <span>2-й и далее повтор за день</span>
          <span class="in"><input type="number" min="0" max="100" v-model.number="form.gainRepeatMore" />%</span>
        </label>
        <p class="hint muted small">
          при +{{ form.gainNewDay }} % / новый день ≈ {{ daysToLearned }} дней до
          {{ form.learnedThreshold }} %
        </p>
      </section>

      <section class="card">
        <h2>штраф и порог</h2>
        <label class="fld">
          <span>за неверный ответ</span>
          <span class="in">−<input type="number" min="0" max="100" v-model.number="form.penaltyWrong" />%</span>
        </label>
        <label class="fld">
          <span>считать выученным с</span>
          <span class="in"><input type="number" min="1" max="100" v-model.number="form.learnedThreshold" />%</span>
        </label>
      </section>

      <section class="card">
        <h2>забывание</h2>
        <label class="fld toggle">
          <span>полоса тает без тренировки</span>
          <input type="checkbox" v-model="form.decayEnabled" />
        </label>
        <label class="fld" :class="{ off: !form.decayEnabled }">
          <span>за день простоя</span>
          <span class="in">−<input type="number" min="0" max="100" :disabled="!form.decayEnabled" v-model.number="form.decayPerDay" />%</span>
        </label>
        <label class="fld" :class="{ off: !form.decayEnabled }">
          <span>дней «форы» без затухания</span>
          <span class="in"><input type="number" min="0" max="60" :disabled="!form.decayEnabled" v-model.number="form.decayGraceDays" /> дн.</span>
        </label>
        <label class="fld toggle" :class="{ off: !form.decayEnabled }">
          <span>тает и после выученности</span>
          <input type="checkbox" :disabled="!form.decayEnabled" v-model="form.decayAfterLearned" />
        </label>
        <label class="fld" :class="{ off: !form.decayEnabled || !form.decayAfterLearned }">
          <span>за день простоя (выученное)</span>
          <span class="in">−<input type="number" min="0" max="100" :disabled="!form.decayEnabled || !form.decayAfterLearned" v-model.number="form.decayPerDayLearned" />%</span>
        </label>
      </section>

      <div class="actions">
        <div class="frame" style="flex: 1">
          <button class="primary wide" :disabled="saving" @click="save">
            {{ saving ? 'сохраняю…' : savedAt ? 'сохранено ✓' : 'сохранить' }}
          </button>
        </div>
        <button class="wide" :disabled="saving" @click="resetDefaults">к средним</button>
      </div>
    </template>
  </main>
</template>

<style scoped>
.back {
  margin: 0 0 0.75rem;
}
.sub {
  margin: -0.4rem 0 1.25rem;
  font-size: 0.85rem;
}
.fld {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.55rem 0;
  border-top: 1px solid var(--line);
}
.fld:first-of-type {
  border-top: none;
}
.fld > span:first-child {
  font-size: 0.9rem;
}
.fld.off {
  opacity: 0.45;
}
.in {
  flex: none;
  display: inline-flex;
  align-items: baseline;
  gap: 0.15rem;
  color: var(--faint);
  font-size: 0.8rem;
  font-weight: 700;
}
.in input[type='number'] {
  width: 3.4rem;
  padding: 0.35rem 0.4rem;
  text-align: right;
  font-weight: 700;
}
.toggle input[type='checkbox'] {
  width: 20px;
  height: 20px;
}
.hint {
  margin: 0.6rem 0 0;
}
.actions {
  display: flex;
  gap: 0.6rem;
  margin-top: 1.25rem;
}
.actions .wide {
  width: 100%;
  padding: 0.85rem;
}
</style>
