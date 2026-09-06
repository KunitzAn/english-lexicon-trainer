// Генерация iOS PWA launch-screen картинок (apple-touch-startup-image):
// однотонный фон темы + гем-самоцвет по центру. Портретные размеры актуальных
// iPhone × две схемы (dark/light). Требует qlmanage + sips (macOS).
//
// Приём: рендерим квадратную «плитку» с гемом на фоне темы через qlmanage
// (квадрат он рисует надёжно), затем sips --padToHeightWidth центрирует её на
// холсте нужного размера, заполняя поля тем же цветом фона.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

const OUT = 'web/public/splash'
const TMP = '.splash-tmp'

// физические пиксели портрета: [w, h]
const SIZES = [
  [640, 1136], [750, 1334], [1125, 2436], [1170, 2532], [1179, 2556],
  [1206, 2622], [1242, 2208], [828, 1792], [1242, 2688], [1284, 2778],
  [1290, 2844], [1320, 2868],
]
const SCHEMES = { dark: '#111310', light: '#efe9dc' }
const TILE = 560 // размер квадратной плитки в px

const gem = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 512 512">
<defs>
<linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22d9b3"/><stop offset="1" stop-color="#12b090"/></linearGradient>
</defs>
<rect width="512" height="512" fill="${bg}"/>
<path d="M206,176 L306,176 L256,368 Z" fill="url(#g1)"/>
<path d="M206,176 L306,176 L256,368 Z" fill="#fff" opacity="0.22"/>
<path d="M146,232 L206,176 L256,368 Z" fill="url(#g1)"/>
<path d="M146,232 L206,176 L256,368 Z" fill="#000" opacity="0.24"/>
<path d="M306,176 L366,232 L256,368 Z" fill="url(#g1)"/>
<path d="M206,176 L306,176 L366,232 L256,368 L146,232 Z" fill="none" stroke="#04231d" stroke-width="5" stroke-linejoin="round" opacity="0.55"/>
<path d="M206,176 L256,368 M306,176 L256,368" stroke="#04231d" stroke-width="4" opacity="0.4" stroke-linecap="round"/>
<line x1="230" y1="192" x2="204" y2="226" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="0.4"/>
</svg>`

rmSync(OUT, { recursive: true, force: true })
rmSync(TMP, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
mkdirSync(TMP, { recursive: true })

for (const [scheme, bg] of Object.entries(SCHEMES)) {
  const svgPath = `${TMP}/tile-${scheme}.svg`
  writeFileSync(svgPath, gem(bg))
  execFileSync('qlmanage', ['-t', '-s', String(TILE), '-o', TMP, svgPath], { stdio: 'ignore' })
  const tile = `${TMP}/tile-${scheme}.svg.png`
  const pad = bg.replace('#', '')
  for (const [w, h] of SIZES) {
    execFileSync(
      'sips',
      ['--padToHeightWidth', String(h), String(w), '--padColor', pad, tile, '--out', `${OUT}/${scheme}-${w}x${h}.png`],
      { stdio: 'ignore' },
    )
  }
}
rmSync(TMP, { recursive: true, force: true })
console.log(`splash: ${SIZES.length * 2} файлов -> ${OUT}/`)
