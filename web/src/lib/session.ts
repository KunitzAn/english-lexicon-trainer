import { reactive } from 'vue'
import type { ServerExercise, TrainingFormat, TrainingSet } from './types'

/**
 * Активный набор для тренировки. TrainView его заполняет и уводит на /train/run;
 * SessionView читает. При перезагрузке страницы пусто → SessionView вернёт на /train.
 */
export const session = reactive<{
  set: TrainingSet | null
  context: ServerExercise[]
  format: TrainingFormat
}>({ set: null, context: [], format: 'mix' })

export function startSession(
  set: TrainingSet,
  context: ServerExercise[] = [],
  format: TrainingFormat = 'mix',
) {
  session.set = set
  session.context = context
  session.format = format
}

export function endSession() {
  session.set = null
  session.context = []
  session.format = 'mix'
}
