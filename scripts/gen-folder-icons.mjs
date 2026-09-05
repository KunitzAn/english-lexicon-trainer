import { readFileSync, writeFileSync } from 'node:fs'

const DIR = 'node_modules/lucide-static/icons'
const KEYS = [
  'plane','map','mountain','building-2','globe','car',
  'utensils','coffee','pizza','wine','apple','shopping-cart',
  'leaf','tree-pine','flower-2','dog','bird','fish',
  'waves','sun','snowflake','briefcase','chart-column','coins',
  'landmark','scale','microscope','flask-conical','atom','cpu',
  'bot','rocket','palette','music','film','camera',
  'guitar','drama','dumbbell','bike','heart-pulse','stethoscope',
  'house','bed','key','clock','hammer','book-open',
  'pencil','lightbulb','brain','graduation-cap','languages','star',
]

const inner = (svg) =>
  svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<svg[\s\S]*?>/, '')
    .replace(/<\/svg>/, '')
    .replace(/\s+/g, ' ')
    .trim()

const entries = KEYS.map((k) => {
  const svg = readFileSync(`${DIR}/${k}.svg`, 'utf8')
  return `  '${k}': '${inner(svg).replace(/'/g, "\\'")}',`
})

const out = `// Сгенерировано из lucide-static (ISC). Монохромные штриховые иконки 24×24 —
// заливаются любым цветом через \`currentColor\`. Обновить набор:
// scripts/gen-folder-icons.mjs.

/** key → внутренняя разметка SVG (без обёртки <svg>). */
export const FOLDER_ICON_SVG: Record<string, string> = {
${entries.join('\n')}
}

export const FOLDER_ICON_KEYS = Object.keys(FOLDER_ICON_SVG)
`

writeFileSync('web/src/lib/folderIcons.ts', out)
console.log(`wrote ${KEYS.length} icons -> web/src/lib/folderIcons.ts`)
