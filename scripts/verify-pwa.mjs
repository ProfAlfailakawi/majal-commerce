#!/usr/bin/env node
/**
 * PWA install-surface guard.
 *
 * Every check here exists because the corresponding bug actually shipped and survived
 * code review: these faults are invisible in a diff and only surface on a real device,
 * which is exactly why they lasted. Run it with the tests so they cannot come back.
 *
 * Zero dependencies on purpose — it must never be the reason an install fails.
 */
import { readFileSync, existsSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(ROOT, 'public')
const failures = []
const notes = []
const fail = (m) => failures.push(m)
const note = (m) => notes.push(m)

/* ---------- helpers ---------- */
const stripQuery = (p) => p.split('?')[0].split('#')[0]
const asFile = (webPath) => join(PUBLIC, stripQuery(webPath).replace(/^\//, ''))

function findManifest(html) {
  const m = html.match(/<link[^>]+rel="manifest"[^>]+href="([^"]+)"/i)
  if (m) return asFile(m[1])
  for (const c of ['manifest.webmanifest', 'manifest.json', 'site.webmanifest']) {
    if (existsSync(join(PUBLIC, c))) return join(PUBLIC, c)
  }
  return null
}

/** PNG/JPEG dimensions straight from the header — no decoder, no dependency. */
function imageInfo(file) {
  const b = readFileSync(file)
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) {
    return {
      kind: 'png',
      width: b.readUInt32BE(16),
      height: b.readUInt32BE(20),
    }
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i < b.length - 9) {
      if (b[i] !== 0xff) { i++; continue }
      const marker = b[i + 1]
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { kind: 'jpeg', height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) }
      }
      i += 2 + b.readUInt16BE(i + 2)
    }
    return { kind: 'jpeg', width: null, height: null }
  }
  if (b.slice(0, 4).toString() === '<svg' || b.slice(0, 5).toString() === '<?xml') return { kind: 'svg' }
  return { kind: 'unknown', head: [...b.slice(0, 4)].map((n) => n.toString(16).padStart(2, '0')).join('') }
}

/* ---------- load ---------- */
const htmlPath = join(ROOT, 'index.html')
if (!existsSync(htmlPath)) { console.error('no index.html at repo root'); process.exit(1) }
const html = readFileSync(htmlPath, 'utf8')
const manifestPath = findManifest(html)
if (!manifestPath || !existsSync(manifestPath)) { console.error('manifest not found'); process.exit(1) }
let manifest
try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) }
catch (e) { console.error('manifest is not valid JSON: ' + e.message); process.exit(1) }

/* ---------- 1. every referenced asset exists, and is really an image ----------
   mirasedu shipped a manifest still pointing at the -v7 icons while the service worker
   and index.html had moved to -v8, so the installed app resolved icons nothing cached.
   Admin linked an apple-touch-icon file that did not exist at all. */
const refs = new Set()
for (const i of manifest.icons ?? []) refs.add(i.src)
for (const s of manifest.screenshots ?? []) refs.add(s.src)
for (const m of html.matchAll(/<link[^>]+rel="(?:apple-touch-icon|icon|shortcut icon|apple-touch-startup-image)"[^>]*href="([^"]+)"/gi)) refs.add(m[1])
for (const r of refs) {
  if (/^(https?:)?\/\//.test(r) || r.startsWith('data:')) continue
  const f = asFile(r)
  if (!existsSync(f)) { fail(`referenced asset is missing: ${r}`); continue }
  const info = imageInfo(f)
  /* order shipped eight files that began with EF BF BD — a binary round-tripped through a
     text pipeline. Two were the push notification icon and badge; one was the og:image, so
     every shared link rendered a broken preview. */
  if (info.kind === 'unknown') fail(`not a valid image (header ${info.head}): ${r}`)
}

/* ---------- 2. declared sizes match the actual pixels ----------
   dr.ahmad declared one 11 KB favicon as both 192x192 and 512x512, so Android upscaled a
   thumbnail into the install icon and the OS splash. */
for (const i of manifest.icons ?? []) {
  if (!i.sizes || i.sizes === 'any') continue
  const f = asFile(i.src)
  if (!existsSync(f)) continue
  const info = imageInfo(f)
  if (info.kind === 'svg' || !info.width) continue
  for (const size of i.sizes.split(/\s+/)) {
    const [w, h] = size.split('x').map(Number)
    if (w && h && (info.width !== w || info.height !== h)) {
      fail(`${i.src} declares ${size} but is ${info.width}x${info.height}`)
    }
  }
}

/* ---------- 3. iOS icons must be opaque at the edges ----------
   mizan's apple-touch-icon carried transparent corners. iOS applies its own rounded mask
   and composites whatever is left against black, so the home screen showed dark notches.
   A declared alpha channel is not enough to fail on — plenty of correct icons are RGBA
   with every pixel opaque — so decode the pixels and judge the border ring, which is the
   only region the iOS mask actually exposes. Interior translucency is reported as a note:
   it still darkens against black, but it degrades gracefully instead of breaking the shape. */
function pngAlpha(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) return null
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  const depth = buf[24]
  const colour = buf[25]
  // Only the two colour types that carry alpha, 8-bit, non-interlaced. Anything else is
  // either opaque by definition or too exotic to guess at, so we decline rather than lie.
  if (![4, 6].includes(colour) || depth !== 8 || buf[28] !== 0) return null
  const channels = colour === 6 ? 4 : 2
  const idat = []
  let off = 8
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len))
    if (type === 'IEND') break
    off += 12 + len
  }
  let raw
  try { raw = inflateSync(Buffer.concat(idat)) } catch { return null }
  const stride = width * channels
  const out = Buffer.alloc(height * stride)
  let pos = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]
    const line = out.subarray(y * stride, (y + 1) * stride)
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const cur = raw[pos + x]
      const a = x >= channels ? line[x - channels] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= channels ? prev[x - channels] : 0
      let v
      switch (filter) {
        case 0: v = cur; break
        case 1: v = cur + a; break
        case 2: v = cur + b; break
        case 3: v = cur + ((a + b) >> 1); break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
          v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
          break
        }
        default: return null
      }
      line[x] = v & 0xff
    }
    pos += stride
  }
  // The iOS mask keeps roughly the middle 96%; the outer ring is what gets clipped and
  // composited, so that is the band a transparent-corner bug always shows up in.
  const ring = Math.max(1, Math.round(Math.min(width, height) * 0.04))
  let minEdge = 255
  let minAny = 255
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = out[y * stride + x * channels + (channels - 1)]
      if (a < minAny) minAny = a
      const onEdge = x < ring || y < ring || x >= width - ring || y >= height - ring
      if (onEdge && a < minEdge) minEdge = a
    }
  }
  return { minEdge, minAny }
}

for (const m of html.matchAll(/<link[^>]+rel="apple-touch-icon"[^>]*href="([^"]+)"/gi)) {
  const f = asFile(m[1])
  if (!existsSync(f)) continue
  const a = pngAlpha(readFileSync(f))
  if (!a) continue
  if (a.minEdge < 250) {
    fail(`apple-touch-icon is transparent at its border (alpha ${a.minEdge}), which iOS composites against black: ${m[1]}`)
  } else if (a.minAny < 250) {
    note(`apple-touch-icon has translucent pixels inside (alpha ${a.minAny}); iOS blends them with black, so flatten it against the icon background: ${m[1]}`)
  }
}

/* ---------- 4. the splash must survive React mounting ----------
   The one that cost the most: the boot splash sat inside <div id="root">, and createRoot
   wipes its container's children, so the element was destroyed at mount rather than faded.
   Three rounds of timing fixes were inert because the node was already gone.
   Set PWA_GUARD_SPLASH_IN_ROOT=ok when a React splash deliberately takes over at mount. */
/** Everything between <div id="root"> and its matching close tag. A non-greedy regex
 *  stops at the first </div>, which is exactly wrong here: a splash is nested markup, so
 *  the naive match would look inside an empty prefix and report all-clear. Count depth. */
function rootInnerHtml(src) {
  const open = src.match(/<div[^>]*\bid="root"[^>]*>/i)
  if (!open) return null
  const start = open.index + open[0].length
  if (/\/>\s*$/.test(open[0])) return ''
  let depth = 1
  const tag = /<(\/?)div\b[^>]*?(\/?)>/gi
  tag.lastIndex = start
  let m
  while ((m = tag.exec(src))) {
    if (m[1]) depth--
    else if (!m[2]) depth++
    if (depth === 0) return src.slice(start, m.index)
  }
  return src.slice(start)
}

if (process.env.PWA_GUARD_SPLASH_IN_ROOT !== 'ok') {
  const inner = rootInnerHtml(html) ?? ''
  const hit = inner.match(/(?:id|class)="([^"]*(?:splash|boot)[^"]*)"/i)
  if (hit) {
    fail(`markup matching "${hit[1]}" sits inside #root, so createRoot deletes it at mount instead of fading it. ` +
         `Move it to a sibling of #root, or set PWA_GUARD_SPLASH_IN_ROOT=ok if a React splash takes over.`)
  }
}

/* ---------- 5. the install surface is complete ---------- */
const sizesOf = (purpose) => (manifest.icons ?? [])
  .filter((i) => (i.purpose ?? 'any').split(/\s+/).includes(purpose))
  .flatMap((i) => (i.sizes ?? '').split(/\s+/))
for (const need of ['192x192', '512x512']) {
  if (!sizesOf('any').includes(need)) fail(`manifest has no ${need} icon with purpose "any"`)
}
if (!sizesOf('maskable').length) fail('manifest has no maskable icon')
for (const i of manifest.icons ?? []) {
  const purposes = (i.purpose ?? 'any').split(/\s+/)
  /* A single file marked "any maskable" is a trap: the same artwork cannot be correctly
     framed for both, and launchers crop the full-bleed version. */
  if (purposes.includes('any') && purposes.includes('maskable')) {
    fail(`${i.src} is both "any" and "maskable" — ship separate files, the maskable needs safe-zone padding`)
  }
}

/* ---------- 6. colours agree ----------
   A manifest background that differs from what the page paints shows as a flash between
   the OS launch screen and the app. */
const themeMetas = [...html.matchAll(/<meta[^>]+name="theme-color"[^>]*content="([^"]+)"/gi)].map((m) => m[1].toLowerCase())
if (manifest.theme_color && themeMetas.length && !themeMetas.includes(manifest.theme_color.toLowerCase())) {
  note(`manifest theme_color ${manifest.theme_color} is not among the page's theme-color metas (${themeMetas.join(', ')})`)
}

/* ---------- report ---------- */
const label = manifest.short_name || manifest.name || 'app'
if (notes.length) for (const n of notes) console.log(`  note  ${n}`)
if (failures.length) {
  console.error(`\n✗ PWA guard failed for ${label}:`)
  for (const f of failures) console.error(`  - ${f}`)
  console.error('')
  process.exit(1)
}
console.log(`✓ PWA guard passed for ${label} (${(manifest.icons ?? []).length} icons, ${(manifest.screenshots ?? []).length} screenshots)`)
