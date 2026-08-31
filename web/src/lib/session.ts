import { reactive } from 'vue'
import type { ServerExercise, TrainingSet } from './types'

/**
 * Активный набор для тренировки. TrainView его заполняет и уводит на /train/run;
 * SessionView читает. При перезагрузке страницы пусто → SessionView вернёт на /train.
 */
export const session = reactive<{
  set: TrainingSet | null
  context: ServerExercise[]
}>({ set: null, context: [] })

export function startSession(set: TrainingSet, context: ServerExercise[] = []) {
  session.set = set
  session.context = context
}

export function endSession() {
  session.set = null
  session.context = []
}
