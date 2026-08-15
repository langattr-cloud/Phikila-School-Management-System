/**
 * Rasterise the vector brand assets into the sizes browsers, iOS, Android and
 * PWA installers ask for, plus a multi-resolution favicon.ico.
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const src = new URL('./out/', import.meta.url)
const dest = process.argv[2]
fs.mkdirSync(dest, { recursive: true })

const read = (n) => fs.readFileSync(new URL(n, src))

const render = async (svg, size, file, { background = null, padRatio = 0 } = {}) => {
  const inner = Math.round(size * (1 - padRatio * 2))
  let img = sharp(read(svg), { density: 1200 }).resize(inner, inner, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  if (padRatio > 0) {
    const pad = Math.round((size - inner) / 2)
    img = img.extend({
      top: pad,
      bottom: size - inner - pad,
      left: pad,
      right: size - inner - pad,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    })
  }
  if (background) img = img.flatten({ background })
  const out = path.join(dest, file)
  await img.png({ compressionLevel: 9 }).toFile(out)
  return out
}

/* ---- favicons + app icons ---- */
for (const size of [16, 32, 48, 64, 96, 180, 192, 256, 512]) {
  await render('favicon.svg', size, `favicon-${size}.png`)
}
await render('app-icon.svg', 512, 'app-icon-512.png')
await render('app-icon.svg', 192, 'app-icon-192.png')
// Apple touch icons are composited on an opaque tile (iOS ignores alpha).
await render('favicon.svg', 180, 'apple-touch-icon.png', { background: '#0F2A47' })
// Maskable icon: extra padding so Android's circular/squircle crop is safe.
await render('favicon.svg', 512, 'maskable-icon-512.png', {
  background: '#0F2A47',
  padRatio: 0.14,
})

/* ---- multi-resolution favicon.ico (16/32/48) ---- */
const icoSizes = [16, 32, 48]
const pngs = await Promise.all(
  icoSizes.map((s) =>
    sharp(read('favicon.svg'), { density: 1200 }).resize(s, s).png({ compressionLevel: 9 }).toBuffer(),
  ),
)
// ICO container: 6-byte header + 16-byte directory entry per image.
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(pngs.length, 4)
let offset = 6 + 16 * pngs.length
const entries = pngs.map((png, i) => {
  const e = Buffer.alloc(16)
  const s = icoSizes[i]
  e.writeUInt8(s === 256 ? 0 : s, 0)
  e.writeUInt8(s === 256 ? 0 : s, 1)
  e.writeUInt8(0, 2) // palette
  e.writeUInt8(0, 3) // reserved
  e.writeUInt16LE(1, 4) // colour planes
  e.writeUInt16LE(32, 6) // bits per pixel
  e.writeUInt32LE(png.length, 8)
  e.writeUInt32LE(offset, 12)
  offset += png.length
  return e
})
fs.writeFileSync(path.join(dest, 'favicon.ico'), Buffer.concat([header, ...entries, ...pngs]))

/* ---- social / open-graph card ---- */
const ogW = 1200
const ogH = 630
const lockup = await sharp(read('logo-horizontal-dark.svg'), { density: 1200 })
  .resize({ width: 760 })
  .png()
  .toBuffer()
const { height: lh } = await sharp(lockup).metadata()
await sharp({
  create: { width: ogW, height: ogH, channels: 4, background: '#0A1E34' },
})
  .composite([{ input: lockup, left: Math.round((ogW - 760) / 2), top: Math.round((ogH - lh) / 2) }])
  .png({ compressionLevel: 9 })
  .toFile(path.join(dest, 'og-image.png'))

console.log('exported to', dest)
console.log(fs.readdirSync(dest).sort().join('\n'))
