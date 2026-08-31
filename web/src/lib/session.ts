import { reactive } from 'vue'
import type { TrainingSet } from './types'

/**
 * Активный набор для тренировки. TrainView его заполняет и уводит на /train/run;
 * SessionView читает. При перезагрузке страницы пусто → SessionView вернёт на /train.
 */
export const session = reactive<{ set: TrainingSet | null }>({ set: null })

export function startSession(set: TrainingSet) {
  session.set = set
}

export function endSession() {
  session.set = null
}
