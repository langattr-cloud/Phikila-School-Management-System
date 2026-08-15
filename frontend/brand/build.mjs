import fs from 'node:fs'
import ot from 'opentype.js'

const C = {
  navy: '#0F2A47',
  navyDeep: '#0A1E34',
  emerald: '#12A47C',
  emeraldLight: '#2BC194',
  gold: '#E0A93B',
  white: '#FFFFFF',
  paper: '#F4F7FA',
}

const font700 = ot.parse(fs.readFileSync(new URL('./inter-700.ttf', import.meta.url)))
const font600 = ot.parse(fs.readFileSync(new URL('./inter-600.ttf', import.meta.url)))

/** Convert a string to outlined vector path data with manual letter-spacing. */
function textPath(font, text, size, tracking = 0, x = 0, y = 0) {
  const scale = size / font.unitsPerEm
  let cursor = x
  let d = ''
  for (const ch of text) {
    const glyph = font.charToGlyph(ch)
    const p = glyph.getPath(cursor, y, size)
    d += p.toPathData(3) + ' '
    cursor += glyph.advanceWidth * scale + tracking
  }
  return { d: d.trim(), width: cursor - x - tracking }
}

/* ============================== THE MARK ================================= */
/**
 * 64x64 grid. Shield silhouette (trust) contains an open book (education);
 * a checkmark sits in the page gutter (verified administration) and three
 * ascending nodes read as data/technology.
 */
function mark({ shield, book, check, node, rim }) {
  return `
  <path d="M20 5H44A11 11 0 0 1 55 16V30.6C55 43.4 45.5 52.9 32 58.4 18.5 52.9 9 43.4 9 30.6V16A11 11 0 0 1 20 5Z" fill="${shield}"/>
  <path d="M21 9.2H43A8 8 0 0 1 51 17.2V30.2C51 40.7 43.2 48.5 32 53.2 20.8 48.5 13 40.7 13 30.2V17.2A8 8 0 0 1 21 9.2Z" fill="none" stroke="${rim}" stroke-width="1.05" opacity="0.45"/>

  <!-- open book: the primary education symbol, dominant in the silhouette -->
  <path d="M31.05 21.9C28.3 19.6 24.6 18.2 20.3 18.2A2.3 2.3 0 0 0 18 20.5V36.8A2.3 2.3 0 0 0 20.3 39.1C24.6 39.1 28.3 40.3 31.05 42.3Z" fill="${book}"/>
  <path d="M32.95 21.9C35.7 19.6 39.4 18.2 43.7 18.2A2.3 2.3 0 0 1 46 20.5V36.8A2.3 2.3 0 0 1 43.7 39.1C39.4 39.1 35.7 40.3 32.95 42.3Z" fill="${book}"/>

  <!-- verification badge: trusted, checked school administration -->
  <circle cx="41.6" cy="37.6" r="9.2" fill="${shield}"/>
  <circle cx="41.6" cy="37.6" r="7.3" fill="${check}"/>
  <path d="M38.1 37.7 40.8 40.4 45.3 35.0" fill="none" stroke="${book}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>

  <!-- gold accent bookmark on the spine: the active record -->
  <path d="M30.9 17.6H33.1V25.4L32 24.1 30.9 25.4Z" fill="${node}"/>`
}

// On dark surfaces the shield is lifted a step so it never merges with the
// background, and the rim is brightened for separation.
const markOnNavy = mark({
  shield: '#1B3E63',
  rim: C.emeraldLight,
  book: C.white,
  check: C.emeraldLight,
  node: C.gold,
})

const markOnLight = mark({
  shield: C.navy,
  rim: C.emeraldLight,
  book: C.white,
  check: C.emerald,
  node: C.gold,
})

const markMono = (color, bg) => `
  <path d="M20 5H44A11 11 0 0 1 55 16V30.6C55 43.4 45.5 52.9 32 58.4 18.5 52.9 9 43.4 9 30.6V16A11 11 0 0 1 20 5Z" fill="${color}"/>
  <path d="M31.05 21.9C28.3 19.6 24.6 18.2 20.3 18.2A2.3 2.3 0 0 0 18 20.5V36.8A2.3 2.3 0 0 0 20.3 39.1C24.6 39.1 28.3 40.3 31.05 42.3Z" fill="${bg}"/>
  <path d="M32.95 21.9C35.7 19.6 39.4 18.2 43.7 18.2A2.3 2.3 0 0 1 46 20.5V36.8A2.3 2.3 0 0 1 43.7 39.1C39.4 39.1 35.7 40.3 32.95 42.3Z" fill="${bg}"/>
  <circle cx="41.6" cy="37.6" r="9.2" fill="${color}"/>
  <circle cx="41.6" cy="37.6" r="7.3" fill="${bg}"/>
  <path d="M38.1 37.7 40.8 40.4 45.3 35.0" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M30.9 17.6H33.1V25.4L32 24.1 30.9 25.4Z" fill="${bg}"/>`

/* ============================ WORDMARK =================================== */
const WORD_SIZE = 30
const TRACK = 1.5
const word = textPath(font700, 'PHIKILA', WORD_SIZE, TRACK)
// Size the secondary line so that, with a fixed generous tracking ratio, its
// width matches the wordmark exactly. Tracking stays positive and airy.
const SUB_TRACK_RATIO = 0.155
const SUB_SIZE = (() => {
  const probe = 10
  const w = textPath(font600, 'SCHOOL MANAGEMENT SYSTEM', probe, probe * SUB_TRACK_RATIO).width
  return (probe * word.width) / w
})()
const sub = textPath(font600, 'SCHOOL MANAGEMENT SYSTEM', SUB_SIZE, SUB_SIZE * SUB_TRACK_RATIO)

const svgOpen = (w, h) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" fill="none">`

/* --------------------------- horizontal lockup --------------------------- */
function horizontal({ bg, wordColor, subColor, markSvg, file, pad = 24 }) {
  const markSize = 64
  const gap = 22
  const textX = pad + markSize + gap
  const w = Math.ceil(textX + Math.max(word.width, sub.width) + pad)
  const h = pad * 2 + markSize
  const markY = pad
  // Optically centre the two text lines against the mark.
  const wordBaseline = pad + 34.5
  const subBaseline = pad + 51

  return `${svgOpen(w, h)}
  <title>Phikila School Management System</title>
  ${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''}
  <g transform="translate(${pad} ${markY})">${markSvg}</g>
  <g transform="translate(${textX} ${wordBaseline})" fill="${wordColor}">
    <path d="${word.d}"/>
  </g>
  <g transform="translate(${textX} ${subBaseline})" fill="${subColor}">
    <path d="${sub.d}"/>
  </g>
</svg>
`
}

/* ------------------------------ stacked ---------------------------------- */
function stacked({ bg, wordColor, subColor, markSvg, file }) {
  const w = 360
  const markSize = 84
  const markX = (w - markSize) / 2
  const wordScale = 0.92
  const wordW = word.width * wordScale
  const subW = sub.width
  const h = 232
  return `${svgOpen(w, h)}
  <title>Phikila School Management System</title>
  ${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''}
  <g transform="translate(${markX} 26) scale(${markSize / 64})">${markSvg}</g>
  <g transform="translate(${(w - wordW) / 2} 165) scale(${wordScale})" fill="${wordColor}">
    <path d="${word.d}"/>
  </g>
  <g transform="translate(${(w - subW) / 2} 190)" fill="${subColor}">
    <path d="${sub.d}"/>
  </g>
</svg>
`
}

/* ------------------------------ app icon --------------------------------- */
function appIcon({ tile, markSvg, radius = 112, size = 512 }) {
  // The mark is inset inside the tile so it keeps clear space on iOS/Android.
  const inset = 0.145
  const scale = (size * (1 - inset * 2)) / 64
  const off = size * inset
  return `${svgOpen(size, size)}
  <title>Phikila School Management System</title>
  <rect width="${size}" height="${size}" rx="${radius}" fill="${tile}"/>
  <g transform="translate(${off} ${off}) scale(${scale})">${markSvg}</g>
</svg>
`
}

/* ------------------------------- favicon --------------------------------- */
/**
 * Favicon is a purpose-drawn simplification: at 16px the page blocks, rim and
 * nodes would fill in, so only the shield + book + check survive, with heavier
 * weights and larger gaps.
 */
function faviconMark({ tile, book, check }) {
  // At 16px only three shapes survive: the tile, a bold open book, and a
  // corner verification badge. The book keeps the dominant silhouette.
  return `
  <rect width="64" height="64" rx="13" fill="${tile}"/>
  <path d="M31 20.4C27.7 17.6 23.2 16 18.1 16A2.8 2.8 0 0 0 15.3 18.8V40.6A2.8 2.8 0 0 0 18.1 43.4C23.2 43.4 27.7 44.9 31 47.6Z" fill="${book}"/>
  <path d="M33 20.4C36.3 17.6 40.8 16 45.9 16A2.8 2.8 0 0 1 48.7 18.8V40.6A2.8 2.8 0 0 1 45.9 43.4C40.8 43.4 36.3 44.9 33 47.6Z" fill="${book}"/>
  <circle cx="44.2" cy="42.6" r="10.4" fill="${tile}"/>
  <circle cx="44.2" cy="42.6" r="8.3" fill="${check}"/>
  <path d="M40.2 42.7 43.3 45.8 48.5 39.6" fill="none" stroke="${book}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
}

/* ================================ EMIT =================================== */
const out = new URL('./out/', import.meta.url)
fs.mkdirSync(out, { recursive: true })
const write = (name, content) => {
  fs.writeFileSync(new URL(name, out), content)
  console.log('wrote', name, content.length, 'bytes')
}

write('logo-horizontal-light.svg', horizontal({ bg: null, wordColor: C.navy, subColor: '#5B7183', markSvg: markOnLight }))
write('logo-horizontal-dark.svg', horizontal({ bg: null, wordColor: C.white, subColor: '#9FB3C4', markSvg: markOnNavy }))
write('logo-horizontal-onnavy.svg', horizontal({ bg: C.navyDeep, wordColor: C.white, subColor: '#9FB3C4', markSvg: markOnNavy }))
write('logo-stacked-light.svg', stacked({ bg: null, wordColor: C.navy, subColor: '#5B7183', markSvg: markOnLight }))
write('logo-stacked-dark.svg', stacked({ bg: null, wordColor: C.white, subColor: '#9FB3C4', markSvg: markOnNavy }))
write('mark.svg', `${svgOpen(64, 64)}<title>Phikila</title>${markOnLight}</svg>\n`)
write('mark-mono-navy.svg', `${svgOpen(64, 64)}<title>Phikila</title>${markMono(C.navy, C.white)}</svg>\n`)
write('mark-mono-white.svg', `${svgOpen(64, 64)}<title>Phikila</title>${markMono(C.white, C.navy)}</svg>\n`)
write('app-icon.svg', appIcon({ tile: C.navyDeep, markSvg: markOnNavy }))
write('mark-on-dark.svg', `${svgOpen(64, 64)}<title>Phikila</title>${markOnNavy}</svg>\n`)
write('favicon.svg', `${svgOpen(64, 64)}<title>Phikila</title>${faviconMark({ tile: C.navy, book: C.white, check: C.emeraldLight })}</svg>\n`)
