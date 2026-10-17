#!/usr/bin/env node
/**
 * Deterministic generator for MAJAL's house dish illustrations (public/dishes/*.svg).
 * Plain Node ESM, no dependencies:  node scripts/generate-dish-art.mjs
 *
 * Each file: 800x600 (4:3), opaque background, no text/fonts/raster/external refs.
 * The hero object sits in the centre ~60% so object-cover crops (wide or square) survive.
 * Four variants per slug differ in palette, background motif (arabesque / sadu / dates / sunburst)
 * and in the hero composition itself.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'dishes');
const W = 800, H = 600, CX = 400;
const HERO_SCALE = 1.22; // heroes are authored ~540px wide; scale up so they own the frame

// ---------- utilities ----------
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const hash = (s) => { let h = 7; for (const ch of s) h = (h * 33 + ch.charCodeAt(0)) >>> 0; return h; };
const n = (x) => Math.round(x * 10) / 10;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const lit = (c, t) => mix(c, '#ffffff', t);
const drk = (c, t) => mix(c, '#000000', t);

class Ctx {
  constructor(seed) { this.defs = []; this.body = []; this.id = 0; this.r = rng(seed); this.memo = {}; }
  add(s) { this.body.push(s); return this; }
  uid(p = 'g') { return p + (this.id++).toString(36); }
  lg(stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) { const k = 'l' + stops.join() + x1 + y1 + x2 + y2; if (this.memo[k]) return this.memo[k]; const id = this.uid('l'); this.defs.push(`<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map((s, i) => `<stop offset="${n(i / (stops.length - 1) * 100)}%" stop-color="${s}"/>`).join('')}</linearGradient>`); return this.memo[k] = `url(#${id})`; }
  rg(stops, cx = .5, cy = .5, r = .5, fx, fy) { const k = 'r' + stops.join() + cx + cy + r + fx + fy; if (this.memo[k]) return this.memo[k]; const id = this.uid('r'); this.defs.push(`<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}"${fx != null ? ` fx="${fx}" fy="${fy}"` : ''}>${stops.map((s, i) => { const [col, op] = Array.isArray(s) ? s : [s, 1]; return `<stop offset="${n(i / (stops.length - 1) * 100)}%" stop-color="${col}"${op < 1 ? ` stop-opacity="${op}"` : ''}/>`; }).join('')}</radialGradient>`); return this.memo[k] = `url(#${id})`; }
  /** glossy sphere-ish fill for a base colour */
  gl(col, fx = .35, fy = .3) { return this.rg([lit(col, .35), col, drk(col, .35)], .5, .5, .75, fx, fy); }
  /** vertical shading */
  vs(col, a = .25, b = .3) { return this.lg([lit(col, a), col, drk(col, b)]); }
  shadow(cx, cy, rx, ry, op = .5) { this.add(`<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${this.rg([['#000', op], ['#000', 0]])}"/>`); }
}
const E = (cx, cy, rx, ry, fill, x = '') => `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}"${x ? ' ' + x : ''}/>`;
const C = (cx, cy, r, fill, x = '') => E(cx, cy, r, r, fill, x);
const P = (d, fill, x = '') => `<path d="${d}" fill="${fill}"${x ? ' ' + x : ''}/>`;
const S = (d, stroke, w, x = '') => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${x ? ' ' + x : ''}/>`;
const G = (t, inner) => `<g transform="${t}">${inner}</g>`;
const rot = (cx, cy, a) => `rotate(${n(a)} ${n(cx)} ${n(cy)})`;
const star8 = (cx, cy, R, r) => { let d = ''; for (let i = 0; i < 16; i++) { const a = Math.PI * i / 8 - Math.PI / 2, q = i % 2 ? r : R; d += (i ? 'L' : 'M') + n(cx + q * Math.cos(a)) + ' ' + n(cy + q * Math.sin(a)); } return d + 'Z'; };

// ---------- palettes & backgrounds ----------
const PALS = [
  { n: 'midnight', bg1: '#1b2a4a', bg2: '#0a101c', motif: '#d6b66a', glow: '#d6b66a', plate: '#f4ecd8', rim: '#c9a85a', cloth: '#223559', light: 0 },
  { n: 'emerald', bg1: '#16574a', bg2: '#06231f', motif: '#8fdcb4', glow: '#7fd6a8', plate: '#f6efdc', rim: '#d9bd72', cloth: '#1b6b5a', light: 0 },
  { n: 'sadu', bg1: '#7a2a20', bg2: '#2b0d0b', motif: '#f0b565', glow: '#f1a860', plate: '#f7ead2', rim: '#e0b060', cloth: '#9b3a2a', light: 0 },
  { n: 'cream', bg1: '#f8ecd2', bg2: '#d8bf93', motif: '#a8742e', glow: '#fff4d6', plate: '#1f5f66', rim: '#d1a64e', cloth: '#e9d3a8', light: 1 },
];

function pattern(c, kind, pal) {
  const m = pal.motif, op = pal.light ? 0.2 : 0.17, id = c.uid('p');
  let tile;
  if (kind === 0) { // arabesque lattice: eight-point stars + linking diamonds
    tile = `<pattern id="${id}" width="100" height="100" patternUnits="userSpaceOnUse"><g fill="none" stroke="${m}" stroke-width="1.6" opacity="${op * 1.5}"><path d="${star8(50, 50, 34, 20)}"/><path d="M50 8l42 42-42 42L8 50z" stroke-width="1"/><circle cx="50" cy="50" r="7"/><path d="M0 0l14 14M100 0L86 14M0 100l14-14M100 100L86 86"/></g></pattern>`;
  } else if (kind === 1) { // sadu weaving: zig-zag bands and diamond rows
    tile = `<pattern id="${id}" width="96" height="96" patternUnits="userSpaceOnUse"><g fill="${m}" opacity="${op * 1.4}"><path d="M0 8h96v6H0zM0 82h96v6H0z"/><path d="M0 48l12-14 12 14-12 14zM24 48l12-14 12 14-12 14zM48 48l12-14 12 14-12 14zM72 48l12-14 12 14-12 14z" opacity=".9"/></g><path d="M0 24l8 8 8-8 8 8 8-8 8 8 8-8 8 8 8-8 8 8 8-8 8 8 8-8 8 8" fill="none" stroke="${m}" stroke-width="2" opacity="${op * 1.6}"/><path d="M0 72l8-8 8 8 8-8 8 8 8-8 8 8 8-8 8 8 8-8 8 8 8-8 8 8 8-8" fill="none" stroke="${m}" stroke-width="2" opacity="${op * 1.6}"/></pattern>`;
  } else if (kind === 2) { // dates & cardamom pods scattered
    tile = `<pattern id="${id}" width="110" height="110" patternUnits="userSpaceOnUse"><g fill="${m}" opacity="${op * 1.5}"><ellipse cx="22" cy="24" rx="12" ry="6" transform="rotate(-30 22 24)"/><ellipse cx="78" cy="70" rx="12" ry="6" transform="rotate(35 78 70)"/><path d="M70 12q14 8 0 22q-14-8 0-22z"/><path d="M20 80q14 8 0 22q-14-8 0-22z"/></g><g fill="none" stroke="${m}" stroke-width="1.4" opacity="${op * 1.5}"><path d="M70 14v18M20 82v18"/><circle cx="55" cy="55" r="3"/></g></pattern>`;
  } else { // sunburst of rays + rosettes
    tile = `<pattern id="${id}" width="120" height="120" patternUnits="userSpaceOnUse"><g fill="none" stroke="${m}" stroke-width="1.5" opacity="${op * 1.6}"><circle cx="60" cy="60" r="12"/><circle cx="60" cy="60" r="26"/><circle cx="60" cy="60" r="44" stroke-dasharray="3 7"/><path d="M60 0v120M0 60h120M17 17l86 86M103 17L17 103" stroke-width="0.8"/></g></pattern>`;
  }
  c.defs.push(tile);
  return id;
}

function background(c, v, pal, kind) {
  const pid = pattern(c, kind, pal);
  const bg = c.lg([pal.bg1, pal.bg2], 0.2, 0, 0.8, 1);
  c.add(`<rect width="${W}" height="${H}" fill="${bg}"/>`);
  if (kind === 3) { // rays from the middle
    let rays = ''; for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12, b = a + Math.PI / 24; rays += `M400 300L${n(400 + 900 * Math.cos(a))} ${n(300 + 900 * Math.sin(a))}L${n(400 + 900 * Math.cos(b))} ${n(300 + 900 * Math.sin(b))}Z`; }
    c.add(P(rays, pal.motif, `opacity="${pal.light ? .09 : .07}"`));
  }
  c.add(`<rect width="${W}" height="${H}" fill="url(#${pid})"/>`);
  // bands near top/bottom echo woven borders (only visible on wide crops, harmless otherwise)
  const bandY = v % 2 ? [0, 560] : [18, 550];
  for (const y of bandY) c.add(`<rect y="${y}" width="${W}" height="${v % 2 ? 40 : 6}" fill="${pal.motif}" opacity=".12"/>`);
  c.add(E(400, 310, 360, 270, c.rg([[pal.glow, pal.light ? .75 : .32], [pal.glow, 0]])));
}

function finish(c, pal) {
  const id = c.uid('n'); const r = rng(11); let d = '';
  for (let i = 0; i < 26; i++) d += `M${n(r() * 60)} ${n(r() * 60)}h1.6`;
  c.defs.push(`<pattern id="${id}" width="60" height="60" patternUnits="userSpaceOnUse"><path d="${d}" stroke="${pal.light ? '#5a3a10' : '#fff'}" stroke-width="1.4" opacity=".16"/></pattern>`);
  c.add(`<rect width="${W}" height="${H}" fill="url(#${id})"/>`);
  c.add(`<rect width="${W}" height="${H}" fill="${c.rg([['#000', 0], ['#000', 0], ['#000', pal.light ? .28 : .5]], .5, .5, .72)}"/>`);
}

// ---------- shared props ----------
/** 3/4-view plate. returns inner surface geometry */
function plate(c, pal, cx, cy, rx, ry, o = {}) {
  const col = o.color || pal.plate;
  c.shadow(cx + 6, cy + ry * 0.35, rx * 1.12, ry * 0.9, .55);
  c.add(E(cx, cy + 10, rx, ry, drk(col, .45)));                 // thickness
  c.add(E(cx, cy, rx, ry, c.lg([lit(col, .25), col, drk(col, .18)])));
  c.add(E(cx, cy, rx * .97, ry * .97, 'none', `stroke="${pal.rim}" stroke-width="3" opacity=".9"`));
  c.add(E(cx, cy + 2, rx * .74, ry * .72, c.lg([drk(col, .12), lit(col, .12)]), `stroke="${drk(col, .25)}" stroke-width="1.2"`));
  c.add(E(cx, cy, rx * .87, ry * .85, 'none', `stroke="${pal.rim}" stroke-width="1.6" stroke-dasharray="2 9" stroke-linecap="round" opacity=".85"`));
}
function bowl(c, pal, cx, cy, rx, ry, depth, o = {}) {
  const col = o.color || pal.plate;
  c.shadow(cx + 4, cy + depth, rx * 1.1, ry * 1.1, .55);
  c.add(P(`M${cx - rx} ${cy}Q${cx - rx * .85} ${cy + depth * 1.1} ${cx} ${cy + depth}Q${cx + rx * .85} ${cy + depth * 1.1} ${cx + rx} ${cy}Z`, c.lg([lit(col, .18), col, drk(col, .35)], 0, 0, 1, .2)));
  c.add(S(`M${cx - rx * .8} ${cy + depth * .55}Q${cx} ${cy + depth * .9} ${cx + rx * .8} ${cy + depth * .55}`, pal.rim, 2.5, 'opacity=".8"'));
  c.add(E(cx, cy, rx, ry, c.lg([lit(col, .3), col]), `stroke="${pal.rim}" stroke-width="3"`));
  c.add(E(cx, cy + 3, rx * .9, ry * .86, drk(col, .75)));
}
function sprinkle(c, cx, cy, rx, ry, count, make) { for (let i = 0; i < count; i++) { const a = c.r() * 6.283, d = Math.sqrt(c.r()); c.add(make(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, c.r())); } }
const pistachio = (x, y, a = 0) => G(rot(x, y, a), E(x, y, 7, 4, '#7aa63a') + E(x - 1, y - 1, 4, 2, '#b4d768'));
const almond = (x, y, a = 0) => G(rot(x, y, a), E(x, y, 9, 5, '#d9a766') + S(`M${x - 6} ${y}Q${x} ${y - 3} ${x + 6} ${y}`, '#f2d19b', 1.4));
const date = (c, x, y, a = 0) => G(rot(x, y, a), E(x, y, 15, 8, c.rg(['#a06a3b', '#5a3018', '#2e1609'], .5, .5, .8, .35, .3)) + S(`M${x - 9} ${y - 1}Q${x} ${y - 4} ${x + 9} ${y - 1}`, '#c99468', 1.2, 'opacity=".6"'));
const cardamom = (x, y, a = 0) => G(rot(x, y, a), P(`M${x - 11} ${y}Q${x} ${y - 9} ${x + 11} ${y}Q${x} ${y + 9} ${x - 11} ${y}Z`, '#a7b36a') + S(`M${x - 9} ${y}Q${x} ${y - 3} ${x + 9} ${y}`, '#dce5a0', 1.2));
const saffron = (x, y, a = 0) => S(`M${x} ${y}q8 -4 16 -1`, '#ff7a1a', 1.8, `transform="${rot(x, y, a)}"`);
const leaf = (x, y, a, L = 40, col = '#3f8a45') => G(rot(x, y, a), P(`M${x} ${y}Q${x + L * .5} ${y - L * .35} ${x + L} ${y}Q${x + L * .5} ${y + L * .35} ${x} ${y}Z`, col) + S(`M${x + 2} ${y}H${x + L - 4}`, lit(col, .4), 1.2));
const sesame = (x, y, a = 0) => E(x, y, 3.2, 1.7, '#f6ecd0', `transform="${rot(x, y, a)}"`);
const chili = (c, x, y, a, col = '#d62a1c', L = 70) => G(rot(x, y, a), P(`M${x} ${y}Q${x + L * .55} ${y - 14} ${x + L} ${y + 6}Q${x + L * .5} ${y + 12} ${x} ${y + 9}Z`, c.vs(col, .3, .35)) + P(`M${x - 2} ${y + 1}q-6 -2 -10 2q6 4 10 6z`, '#2f7a3a') + S(`M${x + 8} ${y + 2}Q${x + L * .5} ${y - 4} ${x + L * .85} ${y + 3}`, lit(col, .6), 1.5, 'opacity=".7"'));
const lemonWheel = (c, x, y, r, col = '#f3d23a') => { let seg = ''; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; seg += `M${n(x + Math.cos(a) * 5)} ${n(y + Math.sin(a) * 5)}L${n(x + Math.cos(a) * (r - 8))} ${n(y + Math.sin(a) * (r - 8))}`; } return C(x, y, r, col) + C(x, y, r - 4, '#fff6c2') + C(x, y, r - 7, c.rg(['#fff1a0', '#f1cf3b'], .5, .5, .6)) + S(seg, '#fff8da', 2.2) + C(x, y, 3, '#fff8da'); };
const steam = (x, y, col = '#fff', op = .5) => S(`M${x} ${y}q-12 -20 0 -38t0 -38`, col, 5, `opacity="${op}"`);

// ---------- hero drawers: (c, pal, v, kind) ----------
const heroes = {};

// rice mound builder (rice / machboos)
function riceMound(c, pal, cx, cy, rw, hh, tones) {
  c.add(P(`M${cx - rw} ${cy}Q${cx - rw * .85} ${cy - hh * 1.25} ${cx} ${cy - hh}Q${cx + rw * .85} ${cy - hh * 1.25} ${cx + rw} ${cy}Q${cx} ${cy + rw * .2} ${cx - rw} ${cy}Z`, c.rg([lit(tones[0], .25), tones[0], drk(tones[0], .35)], .5, .3, .8, .45, .25)));
  const groups = tones.map(() => ''), r = c.r;
  for (let i = 0; i < 260; i++) {
    const x = (r() * 2 - 1), top = hh * Math.pow(1 - x * x, .75), y = cy - r() * top * .95 + (r() - .3) * 6;
    const px = cx + x * rw * .94, a = r() * 3.14, g = Math.floor(r() * tones.length);
    groups[g] += `M${n(px)} ${n(y)}l${n(Math.cos(a) * 7)} ${n(Math.sin(a) * 3)}`;
  }
  groups.forEach((d, i) => c.add(S(d, i ? lit(tones[i], .3) : lit(tones[0], .5), 3.4, 'opacity=".8"')));
}
const drum = (c, x, y, a, s = 1, col = '#b8651f') => G(`${rot(x, y, a)} translate(${n(x)} ${n(y)}) scale(${s}) translate(${-n(x)} ${-n(y)})`,
  P(`M${x - 50} ${y}Q${x - 52} ${y - 26} ${x - 14} ${y - 26}Q${x + 14} ${y - 28} ${x + 40} ${y - 20}Q${x + 62} ${y - 14} ${x + 60} ${y + 2}Q${x + 50} ${y + 20} ${x + 18} ${y + 18}Q${x - 20} ${y + 24} ${x - 50} ${y}Z`, c.gl(col, .4, .25)) +
  C(x + 57, y - 4, 7, '#efe0c0') + C(x + 61, y - 5, 4, '#d1bd94') + P(`M${x - 38} ${y - 10}Q${x - 6} ${y - 24} ${x + 30} ${y - 14}`, 'none', 'stroke="#f5b673" stroke-width="3" opacity=".6" stroke-linecap="round"'));

heroes.rice = (c, pal, v) => {
  const cy = 360, toneSets = [['#f0c43a', '#fff0b0', '#e49a1d'], ['#f4efe0', '#e9d9a6', '#e8b34a'], ['#b0692f', '#d99654', '#6e3a1a'], ['#e9d46a', '#8dbd5a', '#f8f1c6']];
  plate(c, pal, CX, cy, 255, 120);
  const t = toneSets[v];
  riceMound(c, pal, CX, cy - 8, 175, 135, t);
  const rz = c.r;
  for (let i = 0; i < 9; i++) c.add(C(CX - 120 + rz() * 240, cy - 90 + rz() * 80, 4.5, '#6b2d5c')); // raisins
  if (v === 0 || v === 2) sprinkle(c, CX, cy - 100, 90, 40, 8, (x, y, r) => almond(x, y, r * 180));
  if (v === 1 || v === 3) sprinkle(c, CX, cy - 100, 90, 40, 8, (x, y, r) => pistachio(x, y, r * 180));
  if (v === 1) { c.add(S(`M${CX - 20} ${cy - 150}q-10 -24 4 -34`, '#fff', 4, 'opacity=".4"')); sprinkle(c, CX, cy - 90, 120, 30, 5, (x, y) => saffron(x, y, c.r() * 90)); }
  if (v === 3) { c.add(leaf(CX + 150, cy + 50, -30, 36)); c.add(leaf(CX - 190, cy + 40, 200, 36)); }
  if (v === 0) c.add(date(c, CX + 190, cy + 40, 10));
  if (v === 2) { c.add(cardamom(CX - 200, cy + 30, 20)); c.add(cardamom(CX + 200, cy + 54, -30)); }
};

heroes.machboos = (c, pal, v) => {
  const cy = 365;
  plate(c, pal, CX, cy, 270, 128, { color: v === 3 ? pal.plate : pal.plate });
  riceMound(c, pal, CX, cy - 6, 170, 120, ['#c47a2e', '#e8b25a', '#7a3e18']);
  drum(c, CX - 105, cy - 16, 28, 1.05); drum(c, CX + 118, cy - 10, -20, 1); drum(c, CX + 10, cy - 100, 8, 1.1, '#a85a1c');
  sprinkle(c, CX, cy - 60, 150, 40, 7, (x, y) => C(x, y, 4.5, '#5a1f4d'));
  c.add(chili(c, CX - 210, cy + 60, -10, '#d62a1c', 60));
  c.add(C(CX + 210, cy + 50, 20, c.gl('#f0e6c0'))); c.add(S(`M${CX + 196} ${cy + 50}h28M${CX + 210} ${cy + 36}v28`, '#b9a46c', 1.5));
  c.add(leaf(CX + 30, cy + 90, 150, 38)); c.add(leaf(CX - 40, cy + 92, 20, 38));
  c.add(cardamom(CX + 160, cy + 80, 15)); c.add(cardamom(CX - 150, cy + 90, -20));
  steam(c, 0, 0);
};

heroes.asida = (c, pal, v) => {
  const cy = 330;
  const ce = [['#9a5f2b', '#5e3414'], ['#c28a3f', '#7d4f1e'], ['#6f4a2a', '#3a2412'], ['#d1a566', '#8a5f2d']][v];
  bowl(c, pal, CX, cy, 185, 56, 130, { color: v === 3 ? '#2a6f78' : pal.plate });
  c.add(P(`M${CX - 168} ${cy + 2}Q${CX - 150} ${cy - 120} ${CX} ${cy - 112}Q${CX + 150} ${cy - 120} ${CX + 168} ${cy + 2}Q${CX} ${cy + 112} ${CX - 168} ${cy + 2}Z`, c.rg([lit(ce[0], .3), ce[0], ce[1]], .45, .25, .9, .4, .2)));
  c.add(E(CX, cy - 70, 66, 20, c.rg(['#ffe28a', '#e0a82a', '#a8741a'], .5, .4, .7), 'stroke="#fff0b3" stroke-width="1.5" stroke-opacity=".5"'));
  c.add(E(CX - 18, cy - 76, 22, 5, '#fff7d6', 'opacity=".6"'));
  for (let i = 0; i < 6; i++) c.add(S(`M${CX - 140 + i * 6} ${cy - 20 - i * 12}Q${CX} ${cy - 50 - i * 14 + 50} ${CX + 140 - i * 6} ${cy - 20 - i * 12}`, lit(ce[0], .3), 2, 'opacity=".4"'));
  c.add(S(`M${CX - 168} ${cy + 2}Q${CX} ${cy + 112} ${CX + 168} ${cy + 2}`, pal.rim, 3));
  if (v === 0) { c.add(date(c, CX - 70, cy - 108, 20)); c.add(date(c, CX + 80, cy - 100, -10)); sprinkle(c, CX, cy - 92, 40, 12, 5, (x, y) => almond(x, y, 20)); }
  if (v === 1) { c.add(date(c, CX, cy - 120, 0)); sprinkle(c, CX, cy - 70, 60, 14, 8, (x, y) => sesame(x, y, 30)); sprinkle(c, CX, cy - 70, 60, 14, 6, (x, y) => saffron(x, y, 20)); }
  if (v === 2) { sprinkle(c, CX, cy - 95, 70, 24, 10, (x, y) => pistachio(x, y, c.r() * 180)); c.add(cardamom(CX + 205, cy + 80, 10)); }
  if (v === 3) { c.add(date(c, CX - 205, cy + 85, 10)); c.add(date(c, CX + 205, cy + 90, -20)); c.add(date(c, CX + 170, cy + 105, 5)); }
  steam(c, CX + 60, cy - 130, '#fff', .35);
};

heroes.balaleet = (c, pal, v) => {
  const cy = 365;
  plate(c, pal, CX, cy, 260, 122);
  const nood = ['#f2c14a', '#f7d77a', '#e7a43a', '#f5e08a'][v];
  c.add(E(CX, cy - 8, 190, 78, c.rg([lit(nood, .2), nood, drk(nood, .3)], .5, .4, .7)));
  const r = c.r; let d = '';
  for (let i = 0; i < 34; i++) { const x = CX - 170 + r() * 340, y = cy - 40 + r() * 70, L = 50 + r() * 70; d += `M${n(x)} ${n(y)}q${n(L * .3)} ${n(-18 - r() * 12)} ${n(L * .6)} ${n(-4)}t${n(L * .4)} ${n(10 + r() * 8)}`; }
  c.add(S(d, lit(nood, .45), 3.2, 'opacity=".75"'));
  c.add(S(d.replace(/M(\S+) (\S+)/g, (m, a, b) => `M${n(+a + 3)} ${n(+b + 6)}`), drk(nood, .25), 2, 'opacity=".4"'));
  if (v % 2 === 0) { // omelette cap
    c.add(E(CX, cy - 20, 120, 42, c.rg(['#fff1a8', '#f3c640', '#c58f1c'], .5, .4, .7), 'stroke="#fff3b0" stroke-opacity=".5"'));
    c.add(S(`M${CX - 80} ${cy - 24}Q${CX} ${cy - 50} ${CX + 70} ${cy - 22}`, '#fff9d4', 3, 'opacity=".7"'));
  } else { // sunny egg
    c.add(P(`M${CX - 70} ${cy - 18}Q${CX - 100} ${cy - 60} ${CX - 30} ${cy - 58}Q${CX + 20} ${cy - 84} ${CX + 70} ${cy - 50}Q${CX + 110} ${cy - 10} ${CX + 40} ${cy - 2}Q${CX - 20} ${cy + 14} ${CX - 70} ${cy - 18}Z`, '#fff8ec'));
    c.add(C(CX, cy - 38, 26, c.gl('#f6a912', .35, .3))); c.add(C(CX - 8, cy - 47, 7, '#fff3c0', 'opacity=".7"'));
  }
  sprinkle(c, CX, cy - 20, 170, 56, 16, (x, y) => saffron(x, y, c.r() * 180));
  c.add(cardamom(CX + 215, cy + 50, 20)); c.add(cardamom(CX - 215, cy + 60, -20));
  if (v === 3) sprinkle(c, CX, cy - 10, 150, 40, 8, (x, y) => pistachio(x, y, c.r() * 180));
};

heroes.burger = (c, pal, v) => {
  const cy = 425, bun = ['#d99a4a', '#c27a32', '#e7b268', '#b86b2a'][v], cx = CX;
  c.shadow(cx, cy + 36, 230, 30, .55);
  c.add(E(cx, cy + 10, 235, 50, v % 2 ? '#2a2018' : '#d8c7a4', ''));
  c.add(E(cx, cy + 4, 235, 50, v % 2 ? '#43332a' : '#efe3c6'));
  c.add(P(`M${cx - 170} ${cy - 6}Q${cx - 170} ${cy + 24} ${cx - 130} ${cy + 24}H${cx + 130}Q${cx + 170} ${cy + 24} ${cx + 170} ${cy - 6}Z`, c.vs(bun, .15, .35)));
  c.add(P(`M${cx - 178} ${cy - 22}q10 -28 60 -18l6 12 8 -16 12 14 8 -14 12 16 10 -14 14 12 12 -14 10 12 14 -14 12 14 10 -14 12 14 10 -12 14 12 8 -10 12 14 38 -4q8 10 -8 30H${cx - 170}z`, '#5aa23c'));
  c.add(P(`M${cx - 182} ${cy - 40}Q${cx - 180} ${cy - 66} ${cx - 140} ${cy - 66}H${cx + 140}Q${cx + 182} ${cy - 66} ${cx + 182} ${cy - 40}Q${cx} ${cy - 20} ${cx - 182} ${cy - 40}Z`, c.vs('#5a2d17', .25, .4)));
  for (let i = 0; i < 12; i++) c.add(S(`M${cx - 160 + i * 28} ${cy - 56}l8 8`, '#2b140a', 2, 'opacity=".5"'));
  c.add(P(`M${cx - 176} ${cy - 62}H${cx + 176}L${cx + 150} ${cy - 40}L${cx + 120} ${cy - 62}L${cx + 90} ${cy - 40}L${cx + 60} ${cy - 62}L${cx - 160} ${cy - 62}Z`, '#f4b91f'));
  c.add(E(cx - 90, cy - 72, 38, 9, '#d62a1c')); c.add(E(cx + 70, cy - 72, 38, 9, '#d62a1c'));
  c.add(P(`M${cx - 176} ${cy - 76}Q${cx - 176} ${cy - 90} ${cx - 140} ${cy - 90}H${cx + 140}Q${cx + 176} ${cy - 90} ${cx + 176} ${cy - 76}Z`, '#6bbb43'));
  c.add(P(`M${cx - 180} ${cy - 90}Q${cx - 190} ${cy - 215} ${cx} ${cy - 220}Q${cx + 190} ${cy - 215} ${cx + 180} ${cy - 90}Q${cx} ${cy - 76} ${cx - 180} ${cy - 90}Z`, c.rg([lit(bun, .4), bun, drk(bun, .38)], .4, .25, .85, .35, .2)));
  c.add(S(`M${cx - 120} ${cy - 170}Q${cx - 60} ${cy - 205} ${cx} ${cy - 205}`, '#fbe0ac', 5, 'opacity=".55"'));
  sprinkle(c, cx, cy - 150, 110, 40, 22, (x, y, r) => sesame(x, y, r * 180));
  if (v === 1 || v === 3) { c.add(S(`M${cx + 20} ${cy - 215}V${cy - 270}`, '#e8d1a0', 4)); c.add(C(cx + 20, cy - 276, 9, '#d62a1c')); }
  if (v === 2) { c.add(C(cx - 260, cy - 8, 20, c.gl('#e8a43a'))); c.add(C(cx + 270, cy - 12, 20, c.gl('#c43a25'))); }
};

heroes.coffee = (c, pal, v) => {
  const metal = ['#c9a24a', '#b9703a', '#cfd3d6', '#2f2a26'][v], hi = lit(metal, .5), cy = 430;
  c.shadow(CX - 50, cy + 18, 190, 26, .6);
  c.add(E(CX + 100, cy + 22, 130, 20, 'rgba(0,0,0,.25)'));
  // dallah
  const px = CX - 60, m = c.lg([drk(metal, .35), metal, hi, metal, drk(metal, .45)], 0, 0, 1, 0);
  c.add(P(`M${px - 90} ${cy + 6}Q${px - 120} ${cy - 90} ${px - 40} ${cy - 130}L${px - 24} ${cy - 210}H${px + 24}L${px + 40} ${cy - 130}Q${px + 120} ${cy - 90} ${px + 90} ${cy + 6}Z`, m));
  c.add(P(`M${px - 98} ${cy + 6}H${px + 98}V${cy + 22}H${px - 98}Z`, c.lg([hi, drk(metal, .3)])));
  c.add(P(`M${px + 84} ${cy - 70}Q${px + 150} ${cy - 130} ${px + 200} ${cy - 214}L${px + 214} ${cy - 224}Q${px + 218} ${cy - 206} ${px + 204} ${cy - 196}Q${px + 168} ${cy - 120} ${px + 100} ${cy - 40}Z`, c.vs(metal)));
  c.add(S(`M${px - 90} ${cy - 56}Q${px - 170} ${cy - 120} ${px - 120} ${cy - 170}Q${px - 96} ${cy - 192} ${px - 36} ${cy - 160}`, drk(metal, .2), 14));
  c.add(S(`M${px - 90} ${cy - 56}Q${px - 170} ${cy - 120} ${px - 120} ${cy - 170}Q${px - 96} ${cy - 192} ${px - 36} ${cy - 160}`, hi, 4, 'opacity=".6"'));
  c.add(P(`M${px - 34} ${cy - 210}Q${px} ${cy - 250} ${px + 34} ${cy - 210}Z`, c.vs(metal, .4)));
  c.add(C(px, cy - 258, 9, c.gl(metal)));
  for (let i = 0; i < 5; i++) c.add(S(`M${px - 88 + i * 8} ${cy - 40 + i * 6}Q${px} ${cy - 18 + i * 6} ${px + 88 - i * 8} ${cy - 40 + i * 6}`, hi, 1.8, 'opacity=".5"'));
  c.add(S(`M${px - 62} ${cy - 90}Q${px} ${cy - 70} ${px + 62} ${cy - 90}`, '#fff', 2, 'opacity=".25"'));
  c.add(S(`M${px - 78} ${cy - 20}Q${px} ${cy + 2} ${px + 78} ${cy - 20}`, drk(metal, .4), 3, 'opacity=".5"'));
  // finjan cups
  const cup = (x, y, s) => { c.add(E(x, y + 22 * s, 56 * s, 12 * s, 'rgba(0,0,0,.3)')); c.add(P(`M${x - 40 * s} ${y - 26 * s}H${x + 40 * s}Q${x + 38 * s} ${y + 20 * s} ${x + 14 * s} ${y + 26 * s}H${x - 14 * s}Q${x - 38 * s} ${y + 20 * s} ${x - 40 * s} ${y - 26 * s}Z`, c.lg(['#f6efe0', '#cfc3a6'], 0, 0, 1, 0))); c.add(S(`M${x - 40 * s} ${y - 14 * s}H${x + 40 * s}`, '#c9a24a', 3 * s)); c.add(E(x, y - 26 * s, 40 * s, 10 * s, '#3a1d0e', `stroke="#e7d9ae" stroke-width="${2 * s}"`)); c.add(E(x - 8 * s, y - 28 * s, 16 * s, 3 * s, '#a0683a', 'opacity=".6"')); c.add(E(x, y + 26 * s, 20 * s, 4 * s, '#c9a24a')); };
  cup(CX + 190, cy - 4, 1); if (v !== 2) cup(CX + 270, cy + 30, .8);
  if (v === 2) c.add(date(c, CX + 270, cy + 22, 10));
  c.add(cardamom(CX + 120, cy + 40, 10)); c.add(cardamom(CX + 150, cy + 56, -30));
  sprinkle(c, CX + 20, cy + 54, 150, 6, 8, (x, y, r) => G(rot(x, y, r * 180), E(x, y, 7, 4.5, '#4a2812') + S(`M${x - 5} ${y}h10`, '#1e0f06', 1)));
  if (v === 1) c.add(steam(CX + 190, cy - 50, '#fff', .35));
};

heroes.dakoos = (c, pal, v) => {
  const cy = 360, red = ['#c4261b', '#d9531e', '#8e1f26', '#b32d1e'][v];
  bowl(c, pal, CX, cy, 190, 62, 120, { color: v === 3 ? '#2a6f78' : pal.plate });
  c.add(E(CX, cy + 4, 170, 50, c.rg([lit(red, .2), red, drk(red, .45)], .5, .4, .7)));
  c.add(E(CX - 30, cy - 10, 70, 12, lit(red, .45), 'opacity=".5"'));
  const r = c.r; for (let i = 0; i < 40; i++) c.add(C(CX - 150 + r() * 300, cy - 24 + r() * 56, 1.5 + r() * 3, r() > .5 ? '#f4a15a' : '#7f1a16', 'opacity=".7"'));
  const tom = (x, y, s) => c.add(C(x, y, 42 * s, c.gl('#d9301f')) + P(`M${x - 14 * s} ${y - 40 * s}l14 ${10 * s} 14 -${10 * s}l-6 -${6 * s}l-8 4 -8 -4z`, '#2f8a3c') + E(x - 14 * s, y - 14 * s, 9 * s, 5 * s, '#ffd9cf', `opacity=".6" transform="${rot(x - 14 * s, y - 14 * s, -30)}"`));
  tom(CX - 235, cy + 20, .8); tom(CX + 240, cy + 40, .95); if (v > 1) tom(CX + 190, cy + 110, .6);
  for (let i = 0; i < 4; i++) c.add(leaf(CX - 40 + i * 24, cy - 30, -80 + i * 40, 36, '#4a9a3f'));
  c.add(chili(c, CX - 190, cy + 112, 5, '#e03c1c', 90));
  c.add(P(`M${CX + 100} ${cy + 110}q-16 -40 0 -48q16 8 0 48z`, '#f5ecd2')); c.add(P(`M${CX + 126} ${cy + 114}q-16 -40 0 -48q16 8 0 48z`, '#eadfbf'));
  if (v === 2) c.add(S(`M${CX + 20} ${cy - 40}L${CX + 150} ${cy - 120}`, '#c7a55b', 6)); // spoon
};

heroes.ghraiba = (c, pal, v) => {
  const cy = 370, dough = ['#f0dcae', '#ead2a0', '#f4e6c6', '#e2c389'][v];
  plate(c, pal, CX, cy, 270, 124);
  const cookie = (x, y, s, a = 0) => {
    c.add(E(x + 3, y + 10 * s, 62 * s, 22 * s, 'rgba(60,30,0,.35)'));
    c.add(P(`M${x - 60 * s} ${y}Q${x - 60 * s} ${y + 18 * s} ${x} ${y + 20 * s}Q${x + 60 * s} ${y + 18 * s} ${x + 60 * s} ${y}Z`, drk(dough, .2)));
    c.add(E(x, y, 60 * s, 30 * s, c.rg([lit(dough, .35), dough, drk(dough, .1)], .45, .4, .7)));
    c.add(S(`M${x - 38 * s} ${y - 6 * s}l16 ${3 * s}M${x + 26 * s} ${y - 12 * s}l18 ${5 * s}M${x + 20 * s} ${y + 12 * s}l12 -${4 * s}M${x - 34 * s} ${y + 10 * s}l12 -${3 * s}`, drk(dough, .25), 1.6 * s));
    c.add(G(rot(x, y - 2 * s, a), pistachio(x, y - 2 * s).replace(/7/g, String(7 * s)))); };
  const pos = [[[-130, -10], [130, -6], [0, 52], [-60, -52], [70, -50], [-170, 40], [170, 44]], [[-90, 20], [90, 20], [0, -46]], [[-150, 0], [-50, 30], [50, 30], [150, 0], [0, -40]], [[-60, 20], [60, 20]]][v];
  pos.forEach(([dx, dy], i) => cookie(CX + dx, cy - 10 + dy, v === 3 ? 1.35 : v === 1 ? 1.2 : 1, 0));
  if (v === 3) { cookie(CX, cy - 70, 1.2); }
  sprinkle(c, CX, cy, 240, 100, 14, (x, y, r) => (r > .5 ? E(x, y, 3, 2, '#fff', 'opacity=".7"') : cardamom(x, y, r * 200)));
  c.add(date(c, CX + 235, cy + 80, 20));
};

heroes.hala = (c, pal, v) => {
  const cy = 375, amber = ['#d98a1c', '#b8601a', '#e1a830', '#9b4a1a'][v];
  c.shadow(CX, cy + 40, 270, 60, .55);
  c.add(P(`M${CX - 250} ${cy - 20}L${CX - 210} ${cy + 80}H${CX + 210}L${CX + 250} ${cy - 20}Z`, c.lg([lit(pal.rim, .1), drk(pal.rim, .4)])));
  c.add(E(CX, cy - 20, 250, 96, c.lg([lit(pal.rim, .4), pal.rim, drk(pal.rim, .2)])));
  c.add(E(CX, cy - 14, 228, 84, c.rg([amber, drk(amber, .5)], .5, .5, .7)));
  const tile = (x, y, s, t) => { c.add(G(`translate(${n(x)} ${n(y)})`, P(`M0 ${-34 * s}L${54 * s} 0L0 ${34 * s}L${-54 * s} 0Z`, c.rg([lit(amber, .6), amber, drk(amber, .35)], .4, .3, .9, .35, .2), `stroke="${lit(amber, .55)}" stroke-width="1.6"`) + P(`M${-34 * s} ${-6 * s}L0 ${-24 * s}L${30 * s} ${-8 * s}`, 'none', 'stroke="#fff" stroke-width="3" opacity=".35" stroke-linecap="round"'))); if (t === 0) c.add(almond(x, y - 4)); else if (t === 1) c.add(pistachio(x, y - 4, 20)); else c.add(G(`translate(${n(x)} ${n(y - 4)})`, S(`M-12 0q6 -6 12 0t12 0`, '#ff9a2a', 2.4))); };
  const grid = v === 0 ? [[-110, -48], [0, -64], [110, -48], [-110, 6], [0, -4], [110, 6], [-55, 40], [55, 40]] : v === 1 ? [[-90, -40], [20, -52], [-50, 8], [70, 0], [-130, 30], [140, -20]] : v === 2 ? [[-120, -30], [-40, -48], [40, -48], [120, -30], [-80, 22], [0, 12], [80, 22]] : [[-60, -30], [60, -30], [0, 20]];
  grid.forEach(([dx, dy], i) => tile(CX + dx, cy + dy, v === 3 ? 1.5 : 1.1, i % 3));
  c.add(cardamom(CX - 215, cy + 90, 10)); c.add(date(c, CX + 220, cy + 96, -10));
  steam(c, CX + 40, cy - 120, '#fff', .3);
};

heroes.kibba = (c, pal, v) => {
  const cy = 365, crust = ['#b8651f', '#c9822f', '#9c4e1a', '#d49b45'][v];
  plate(c, pal, CX, cy, 275, 126);
  const fb = (x, y, a, s = 1) => {
    const f = `M${-78 * s} 0Q${-30 * s} ${-52 * s} ${78 * s} 0Q${-30 * s} ${52 * s} ${-78 * s} 0Z`;
    c.add(G(`translate(${n(x)} ${n(y)}) rotate(${a})`, E(4, 16 * s, 70 * s, 14 * s, 'rgba(40,15,0,.4)') + P(f, c.rg([lit(crust, .4), crust, drk(crust, .45)], .4, .3, .8, .35, .2)) + S(`M${-50 * s} ${-12 * s}Q${-10 * s} ${-34 * s} ${40 * s} ${-18 * s}`, lit(crust, .6), 3, 'opacity=".5"') + [...Array(14)].map((_, i) => C(-60 * s + (i * 37 % 120) * s, (-18 + (i * 53 % 36)) * s, 1.8, drk(crust, .5), 'opacity=".55"')).join('')));
  };
  const L = v === 0 ? [[-110, -10, -12], [90, -20, 14], [-20, 56, 6]] : v === 1 ? [[-130, 30, 20], [0, -30, -4], [130, 30, -20], [0, 62, 0]] : v === 2 ? [[-90, 16, -26], [100, 0, 24]] : [[-120, -4, 8], [110, -10, -8], [-30, 60, -4], [60, 62, 6]];
  L.forEach(([dx, dy, a]) => fb(CX + dx, cy - 18 + dy, a, v === 2 ? 1.25 : 1));
  // cut-open kibba showing filling
  const cx = CX + (v === 2 ? 0 : 0), cyy = cy - 80;
  c.add(G(`translate(${cx} ${cyy})`, E(0, 8, 80, 20, 'rgba(40,15,0,.35)') + P('M-80 0Q-30 -56 80 0Q-30 56 -80 0Z', crust) + P('M-66 0Q-26 -40 66 0Q-26 40 -66 0Z', c.rg(['#a24a22', '#5a2511'], .5, .5, .7)) + [...Array(9)].map((_, i) => C(-40 + i * 12, -6 + (i * 7 % 14), 3.2, i % 3 ? '#d9b36a' : '#f1e3b8')).join('')));
  c.add(P(`M${CX + 200} ${cy + 70}q30 -50 74 -10q-30 40 -74 10z`, '#f3d23a')); c.add(S(`M${CX + 212} ${cy + 66}q22 -22 46 -8`, '#fff6c2', 2));
  c.add(leaf(CX - 230, cy + 60, -40, 40)); c.add(leaf(CX - 220, cy + 70, 10, 36, '#2f7a3a'));
};

heroes.lemon = (c, pal, v) => {
  const cy = 380, y1 = ['#f2cf2f', '#f6dc4b', '#efc02a', '#f8e068'][v];
  c.shadow(CX, cy + 60, 280, 52, .5);
  const whole = (x, y, s, a) => c.add(G(`translate(${n(x)} ${n(y)}) rotate(${a}) scale(${s})`, P('M-92 0Q-86 -66 0 -68Q86 -66 92 0Q86 66 0 68Q-86 66 -92 0Z', c.rg([lit(y1, .5), y1, drk(y1, .38)], .4, .28, .85, .35, .22)) + P('M-92 0q-14 -4 -18 4q6 8 18 2z', drk(y1, .15)) + P('M92 0q14 -4 18 4q-6 8 -18 2z', drk(y1, .15)) + [...Array(26)].map((_, i) => C(-70 + (i * 41 % 140), -44 + (i * 29 % 88), 1.4, drk(y1, .3), 'opacity=".5"')).join('') + E(-30, -34, 34, 10, '#fffbd0', 'opacity=".55"')));
  if (v % 2 === 0) { c.add(leaf(CX - 20, cy - 110, -140, 90)); c.add(leaf(CX + 20, cy - 108, -50, 90, '#2f7a3a')); }
  c.add(E(CX, cy + 36, 120, 20, c.vs('#8a5a2a', .3, .3).replace(/.*/, c.lg(['#a8723a', '#5a3818'])))); // board shadow-ish
  whole(CX - 70, cy - 20, 1.2, -12); whole(CX + 130, cy + 20, .95, 18);
  if (v !== 3) whole(CX - 205, cy + 36, .7, 25);
  c.add(lemonWheel(c, CX + 20, cy + 62, 58, y1)); c.add(lemonWheel(c, CX + 215, cy - 40, 48, y1));
  if (v === 1 || v === 3) { c.add(leaf(CX + 150, cy - 90, -70, 80)); }
  c.add(G(`translate(${CX - 190} ${cy - 110})`, P('M0 0A70 70 0 0 1 100 0Z', y1, 'transform="scale(1 .9)"')));
};

heroes.lugaimat = (c, pal, v) => {
  const cy = 390;
  plate(c, pal, CX, cy, 265, 118);
  const ball = (x, y, r) => { c.add(C(x, y, r, c.rg(['#f6c048', '#d98a1c', '#8a4a10'], .5, .5, .85, .35, .25))); c.add(S(`M${x - r * .5} ${y - r * .45}q${r * .5} ${-r * .3} ${r * .9} ${r * .1}`, '#ffe9a8', 2.4, 'opacity=".6"')); };
  const layers = [[[-80, 0], [0, 6], [80, 0], [-40, -46], [40, -46], [0, -90]], [[-120, 14], [-40, 20], [40, 20], [120, 14], [-80, -34], [0, -42], [80, -34], [-40, -90], [40, -90], [0, -134]], [[-150, 10], [-70, 22], [10, 24], [90, 22], [160, 10], [-30, -40], [60, -36], [-100, -36], [20, -96]], [[-60, 0], [60, 0], [0, -56]]][v];
  const R = v === 3 ? 56 : v === 1 ? 42 : 48;
  layers.slice().sort((a, b) => a[1] - b[1]).forEach(([dx, dy]) => ball(CX + dx, cy - 30 + dy, R));
  const top = layers.reduce((a, b) => (b[1] < a[1] ? b : a));
  let d = ''; for (let i = 0; i < 6; i++) d += `M${CX + top[0] - 30 + i * 12} ${cy - 30 + top[1] - R * .9}q${(i % 2 ? 1 : -1) * 10} 40 ${(i % 2 ? -1 : 1) * 4} ${70 + i * 8}`;
  c.add(S(d, '#7a3a0e', 4.5, 'opacity=".85"')); c.add(S(d, '#c77a2a', 1.6, 'opacity=".8"'));
  sprinkle(c, CX, cy - 30, 120, 60, 18, (x, y, r) => sesame(x, y, r * 180));
  c.add(C(CX + 232, cy + 62, 22, c.rg(['#e8b55a', '#7a3a0e'], .5, .5, .8), 'opacity=".95"')); // syrup pot
  c.add(date(c, CX - 225, cy + 70, 12));
};

heroes.maamoul = (c, pal, v) => {
  const cy = 375, dough = ['#d8a867', '#e6bd80', '#c9904e', '#ecc88e'][v];
  plate(c, pal, CX, cy, 275, 124);
  const mold = (x, y, s, k) => {
    c.add(E(x + 4, y + 22 * s, 66 * s, 22 * s, 'rgba(60,30,0,.4)'));
    c.add(P(`M${x - 70 * s} ${y}Q${x - 74 * s} ${y + 26 * s} ${x} ${y + 28 * s}Q${x + 74 * s} ${y + 26 * s} ${x + 70 * s} ${y}Z`, drk(dough, .22)));
    c.add(P(`M${x - 70 * s} ${y}Q${x - 60 * s} ${y - 50 * s} ${x} ${y - 50 * s}Q${x + 60 * s} ${y - 50 * s} ${x + 70 * s} ${y}Q${x} ${y + 24 * s} ${x - 70 * s} ${y}Z`, c.rg([lit(dough, .4), dough, drk(dough, .15)], .4, .2, .9, .4, .15)));
    const mk = k % 4, t = (px, py) => [x + px * s, y + py * s]; let d = '';
    if (mk === 0) for (let i = 0; i < 6; i++) { const [a, b] = t(-40 + i * 16, -20); d += `M${n(a)} ${n(b)}l${n(8 * s)} ${n(-10 * s)}l${n(8 * s)} ${n(10 * s)}`; }
    if (mk === 1) { const [a, b] = t(0, -22); d = star8(a, b, 24 * s, 12 * s); }
    if (mk === 2) for (let i = 0; i < 4; i++) { const [a, b] = t(-36 + i * 24, -22); d += `M${n(a)} ${n(b - 14 * s)}q${n(8 * s)} ${n(14 * s)} 0 ${n(28 * s)}`; }
    if (mk === 3) for (let i = 0; i < 5; i++) { const [a, b] = t(-36 + i * 18, -14); d += `M${n(a)} ${n(b)}l${n(12 * s)} ${n(-18 * s)}M${n(a)} ${n(b)}l${n(-4 * s)} ${n(-20 * s)}`; }
    c.add(S(d, drk(dough, .35), 2.2 * s, 'opacity=".75"'));
    c.add(S(`M${x - 56 * s} ${y - 8 * s}Q${x - 36 * s} ${y - 40 * s} ${x - 6 * s} ${y - 44 * s}`, '#fff6dc', 3, 'opacity=".5"'));
    for (let i = 0; i < 10; i++) c.add(C(x - 50 * s + (i * 23 % 100) * s, y - 40 * s + (i * 17 % 50) * s, 2.4, '#fff', 'opacity=".5"')); };
  const P3 = v === 0 ? [[-130, -4], [130, -4], [0, 56], [0, -52]] : v === 1 ? [[-100, 20], [100, 20], [0, -40]] : v === 2 ? [[-150, 10], [-50, 40], [50, 40], [150, 10], [0, -34]] : [[-70, 20], [70, 20]];
  P3.forEach(([dx, dy], i) => mold(CX + dx, cy - 6 + dy, v === 3 ? 1.35 : v === 1 ? 1.15 : 1, i + v));
  c.add(date(c, CX - 240, cy + 82, 20)); c.add(date(c, CX + 235, cy + 80, -30));
};

heroes.pickles = (c, pal, v) => {
  const cy = 450, brine = ['#c9d98a', '#e6c76a', '#d9a0a0', '#b5d8a0'][v], veg = [['#4f9a3a', '#e07a1f', '#d62a1c'], ['#7ab13c', '#e8b83a', '#c0392b'], ['#b04a7a', '#e8c0c8', '#8a2f5a'], ['#3f8a45', '#f0a830', '#e0491c']][v];
  c.shadow(CX, cy + 8, 190, 30, .6);
  const x0 = CX - 95, x1 = CX + 95, top = 160;
  c.add(P(`M${x0} ${top + 40}Q${x0 - 20} ${top + 70} ${x0 - 12} ${top + 140}V${cy - 20}Q${x0 - 12} ${cy + 6} ${x0 + 24} ${cy + 6}H${x1 - 24}Q${x1 + 12} ${cy + 6} ${x1 + 12} ${cy - 20}V${top + 140}Q${x1 + 20} ${top + 70} ${x1} ${top + 40}Z`, c.lg([brine, drk(brine, .1)], 0, 0, 0, 1) + '" opacity="1'));
  const bd = c.add;
  // contents
  const stick = (x, y0, y1, w, col, a) => c.add(G(rot(x, (y0 + y1) / 2, a), `<rect x="${x - w / 2}" y="${y0}" width="${w}" height="${y1 - y0}" rx="${w / 2}" fill="${c.lg([lit(col, .3), col, drk(col, .35)], 0, 0, 1, 0)}"/>` + S(`M${x - w * .15} ${y0 + 8}V${y1 - 14}`, lit(col, .6), 2, 'opacity=".5"')));
  stick(x0 + 30, top + 80, cy - 14, 34, veg[0], -3); stick(CX - 20, top + 60, cy - 18, 38, veg[0], 2); stick(CX + 50, top + 90, cy - 14, 30, veg[1], 4); stick(x1 - 24, top + 100, cy - 14, 28, veg[1], -4);
  c.add(chili(c, CX - 40, top + 200, -70, veg[2], 90)); c.add(chili(c, CX + 20, top + 240, -100, veg[2], 80));
  sprinkle(c, CX, cy - 80, 80, 80, 14, (x, y, r) => C(x, y, 3 + r * 3, '#fff', 'opacity=".35"'));
  c.add(leaf(CX - 60, top + 70, -90, 50));
  // glass
  c.add(P(`M${x0} ${top + 40}Q${x0 - 20} ${top + 70} ${x0 - 12} ${top + 140}V${cy - 20}Q${x0 - 12} ${cy + 6} ${x0 + 24} ${cy + 6}H${x1 - 24}Q${x1 + 12} ${cy + 6} ${x1 + 12} ${cy - 20}V${top + 140}Q${x1 + 20} ${top + 70} ${x1} ${top + 40}Z`, c.lg(['#fff', '#fff', '#fff'], 0, 0, 1, 0), 'opacity=".12" stroke="#fff" stroke-width="3" stroke-opacity=".6"'));
  c.add(S(`M${x0 - 2} ${top + 110}V${cy - 30}`, '#fff', 8, 'opacity=".35"'));
  c.add(`<rect x="${x0 - 6}" y="${top - 8}" width="${x1 - x0 + 12}" height="52" rx="10" fill="${c.vs(pal.rim, .3, .35)}"/>`);
  for (let i = 0; i < 6; i++) c.add(S(`M${x0 + 10 + i * 34} ${top}v38`, drk(pal.rim, .35), 2, 'opacity=".5"'));
  c.add(S(`M${x0} ${top + 4}H${x1}`, lit(pal.rim, .6), 3, 'opacity=".6"'));
  // side items
  if (v % 2 === 0) { stick(CX - 215, cy - 60, cy - 20, 30, veg[0], 80); c.add(C(CX + 220, cy - 4, 22, c.gl(veg[2]))); } else { c.add(chili(c, CX + 140, cy + 5, -5, veg[2], 80)); stick(CX - 200, cy - 44, cy - 6, 28, veg[1], 80); }
};

heroes.qurs = (c, pal, v) => qurs(c, pal, v);
function qurs(c, pal, v) {
  const cy = 350, gold = ['#e5a526', '#d9941a', '#f0bd3a', '#c9821a'][v];
  const cake = (x, y, rx, ry, h, dusted) => {
    c.add(E(x + 4, y + h + 6, rx * 1.03, ry * 1.05, 'rgba(50,20,0,.4)'));
    c.add(P(`M${x - rx} ${y}V${y + h}Q${x} ${y + h + ry * 2} ${x + rx} ${y + h}V${y}Z`, c.lg([lit(gold, .15), drk(gold, .45)], 0, 0, 1, 0)));
    c.add(E(x, y, rx, ry, c.rg([lit(gold, .5), gold, drk(gold, .3)], .5, .4, .75, .4, .3)));
    c.add(E(x, y, rx * .8, ry * .78, 'none', `stroke="${lit(gold, .55)}" stroke-width="2" stroke-dasharray="4 7" stroke-linecap="round"`));
    if (dusted) { sprinkle(c, x, y, rx * .7, ry * .7, 20, (px, py, r) => C(px, py, 1.6 + r * 2.4, '#fff7dc', 'opacity=".7"')); }
    c.add(S(`M${x - rx * .6} ${y - ry * .3}Q${x - rx * .2} ${y - ry * .75} ${x + rx * .25} ${y - ry * .7}`, '#fff2c0', 3, 'opacity=".55"')); };
  const tray = () => { c.shadow(CX, cy + 56, 280, 50, .5); c.add(E(CX, cy + 40, 262, 84, c.lg([lit(pal.rim, .2), drk(pal.rim, .45)]))); c.add(E(CX, cy + 28, 262, 84, c.lg([lit(pal.rim, .5), pal.rim]))); c.add(E(CX, cy + 32, 238, 72, c.vs(pal.cloth, .1, .3))); };
  if (v === 0) { tray(); cake(CX, cy + 10, 128, 44, 28, 1); cake(CX - 130, cy + 42, 82, 28, 20, 0); cake(CX + 140, cy + 46, 82, 28, 20, 1); c.add(saffron(CX - 20, cy - 10, 10)); }
  else if (v === 1) { tray(); cake(CX, cy + 40, 150, 52, 32, 1); cake(CX, cy + 8, 120, 42, 32, 1); cake(CX, cy - 24, 90, 30, 32, 1); }
  else if (v === 2) { plate(c, pal, CX, cy + 20, 250, 110); cake(CX, cy + 10, 170, 60, 36, 1); c.add(P(`M${CX} ${cy + 10}L${CX + 120} ${cy - 30}A170 60 0 0 0 ${CX + 170} ${cy + 10}Z`, '#c1790f')); c.add(P(`M${CX} ${cy + 10}L${CX + 120} ${cy - 30}V${cy + 8}L${CX} ${cy + 46}Z`, '#f1d28c', 'opacity=".95"')); }
  else { plate(c, pal, CX, cy + 24, 258, 112); cake(CX - 100, cy + 26, 90, 32, 24, 1); cake(CX + 110, cy + 36, 90, 32, 24, 1); cake(CX, cy - 14, 100, 34, 26, 1); }
  sprinkle(c, CX, cy - 26, 80, 20, 8, (x, y) => saffron(x, y, c.r() * 180));
  c.add(cardamom(CX + 220, cy + 100, -10)); c.add(cardamom(CX - 215, cy + 96, 25)); c.add(saffron(CX + 40, cy - 14, 0));
}

heroes.ragag = (c, pal, v) => {
  const cy = 365, sheet = ['#f1dfb2', '#f6e8c4', '#e9cf94', '#efd9a8'][v];
  c.shadow(CX, cy + 40, 280, 52, .5);
  c.add(E(CX, cy + 14, 258, 96, c.lg([lit(pal.cloth, .1), drk(pal.cloth, .4)]))); c.add(E(CX, cy + 4, 258, 96, c.lg([lit(pal.cloth, .3), pal.cloth])));
  const fold = (x, y, s, a, k) => c.add(G(`${rot(x, y, a)} translate(${n(x)} ${n(y)}) scale(${s}) translate(${-n(x)} ${-n(y)})`,
    P(`M${x - 150} ${y}Q${x - 140} ${y - 130} ${x} ${y - 132}Q${x + 140} ${y - 130} ${x + 150} ${y}Z`, c.rg([lit(sheet, .35), sheet, drk(sheet, .25)], .5, 1, 1.1, .5, .9), `stroke="${drk(sheet, .25)}" stroke-width="1.5"`) +
    S(`M${x - 130} ${y - 10}Q${x} ${y - 30} ${x + 130} ${y - 10}`, drk(sheet, .2), 1.6, 'opacity=".6"') +
    [...Array(7)].map((_, i) => S(`M${x - 120 + i * 40} ${y - 6}q${i % 2 ? 6 : -6} -50 ${i % 2 ? -4 : 8} -100`, drk(sheet, .15), 1.5, 'opacity=".5"')).join('') +
    [...Array(18)].map((_, i) => C(x - 110 + (i * 47 % 220), y - 15 - (i * 31 % 100), 2.4, '#b9803a', 'opacity=".5"')).join('')));
  if (v === 0) { fold(CX - 20, cy + 40, 1.0, -4); fold(CX + 20, cy + 20, .92, 3); fold(CX, cy, .8, 0); }
  if (v === 1) { fold(CX - 120, cy + 24, .75, -10); fold(CX + 130, cy + 30, .75, 8); fold(CX, cy + 40, .95, 0); }
  if (v === 2) { fold(CX, cy + 50, 1.05, 0); fold(CX, cy + 30, .9, 0); fold(CX, cy + 8, .75, 0); }
  if (v === 3) { fold(CX - 80, cy + 46, .85, -6); fold(CX + 100, cy + 30, .85, 6); }
  if (v % 2 === 0) { c.add(C(CX + 210, cy + 90, 42, '#fff9ee')); c.add(C(CX + 210, cy + 88, 18, c.gl('#f6a912'))); c.add(date(c, CX - 220, cy + 100, 10)); }
  else { c.add(P(`M${CX + 170} ${cy + 100}L${CX + 250} ${cy + 80}L${CX + 240} ${cy + 120}Z`, '#f4c84a')); c.add(date(c, CX - 220, cy + 100, 10)); c.add(date(c, CX - 180, cy + 118, -20)); }
  steam(c, CX - 10, cy - 100, '#fff', .3);
};

heroes.shatta = (c, pal, v) => {
  const cy = 380, red = ['#c4261b', '#e0521c', '#8e1f26', '#d61f3a'][v];
  c.shadow(CX, cy + 60, 250, 40, .55);
  if (v % 2 === 0) { // jar with lid
    const x0 = CX - 110, x1 = CX + 110, t = cy - 150;
    c.add(P(`M${x0} ${t + 20}Q${x0 - 14} ${t + 60} ${x0 - 10} ${t + 120}V${cy + 36}Q${x0 - 8} ${cy + 66} ${x0 + 30} ${cy + 66}H${x1 - 30}Q${x1 + 8} ${cy + 66} ${x1 + 10} ${cy + 36}V${t + 120}Q${x1 + 14} ${t + 60} ${x1} ${t + 20}Z`, c.lg([lit(red, .1), red, drk(red, .5)], 0, 0, 1, 0)));
    c.add(S(`M${x0 + 2} ${t + 110}V${cy + 20}`, '#fff', 9, 'opacity=".28"'));
    c.add(`<rect x="${x0 - 6}" y="${t - 16}" width="${x1 - x0 + 12}" height="44" rx="9" fill="${c.vs('#2a2420', .3, .4)}"/>`);
    c.add(`<rect x="${x0 + 20}" y="${t + 90}" width="${x1 - x0 - 40}" height="${(cy + 36) - (t + 90) - 20}" rx="14" fill="${pal.light ? '#fff4d6' : '#f6e8c4'}" opacity=".9"/>`);
    c.add(star8(CX, cy - 30, 30, 15).replace(/^/, '').replace(/^(.*)$/, (m) => P(m, red))); c.add(C(CX, cy - 30, 8, '#f6e8c4'));
    c.add(S(`M${x0 + 40} ${cy + 20}h${x1 - x0 - 80}`, drk(red, .1), 3));
  } else { // bowl
    bowl(c, pal, CX, cy - 20, 175, 56, 110, { color: v === 1 ? '#2a6f78' : '#2a2420' });
    c.add(E(CX, cy - 17, 155, 45, c.rg([lit(red, .25), red, drk(red, .5)], .5, .4, .7)));
    c.add(E(CX - 40, cy - 32, 60, 8, lit(red, .5), 'opacity=".5"'));
    sprinkle(c, CX, cy - 17, 130, 32, 30, (x, y, r) => C(x, y, 1.4 + r * 2, r > .5 ? '#ffd0a0' : '#5a1010', 'opacity=".7"'));
  }
  c.add(chili(c, CX - 260, cy + 60, -12, red, 100)); c.add(chili(c, CX + 160, cy + 80, 8, '#2f9a3a', 110)); c.add(chili(c, CX + 190, cy + 50, -20, red, 90));
  c.add(P(`M${CX - 250} ${cy + 90}q-16 -40 0 -48q16 8 0 48z`, '#f5ecd2'));
  sprinkle(c, CX + 100, cy + 100, 120, 14, 8, (x, y) => cardamom(x, y, c.r() * 90));
};

heroes.sobia = (c, pal, v) => {
  const cy = 450, liq = ['#fbf3de', '#f7d9d6', '#f6e3a8', '#e4f1d6'][v], top = 150;
  c.shadow(CX, cy + 14, 150, 24, .6);
  c.add(E(CX, cy + 4, 92, 18, 'rgba(0,0,0,.3)'));
  const gl = `M${CX - 98} ${top}H${CX + 98}L${CX + 70} ${cy - 10}Q${CX + 66} ${cy + 8} ${CX + 40} ${cy + 8}H${CX - 40}Q${CX - 66} ${cy + 8} ${CX - 70} ${cy - 10}Z`;
  c.add(P(gl, c.lg(['#eef6f6', '#dfeeee'], 0, 0, 1, 0), 'opacity=".4"'));
  c.add(P(`M${CX - 92} ${top + 40}H${CX + 92}L${CX + 66} ${cy - 12}Q${CX + 62} ${cy + 2} ${CX + 38} ${cy + 2}H${CX - 38}Q${CX - 62} ${cy + 2} ${CX - 66} ${cy - 12}Z`, c.lg([lit(liq, .3), liq, drk(liq, .22)], 0, 0, 1, 0)));
  const r = c.r; for (let i = 0; i < 10; i++) c.add(E(CX - 52 + r() * 104, top + 80 + r() * 200, 8, 4.5, '#6b2d5c', 'opacity=".85"'));
  c.add(E(CX, top + 40, 92, 14, lit(liq, .5))); c.add(E(CX, top + 38, 80, 9, '#fff', 'opacity=".5"'));
  sprinkle(c, CX, top + 38, 60, 6, 14, (x, y, r) => C(x, y, 1.6, '#a0683a', 'opacity=".8"'));
  c.add(S(`M${CX - 80} ${top + 40}L${CX - 54} ${cy - 20}`, '#fff', 7, 'opacity=".5"'));
  c.add(P(gl, 'none', 'stroke="#fff" stroke-width="3" stroke-opacity=".7"'));
  c.add(E(CX, top, 98, 14, 'none', 'stroke="#fff" stroke-width="3" stroke-opacity=".8"'));
  // straw
  c.add(G(rot(CX, top, 14), `<rect x="${CX + 20}" y="${top - 90}" width="14" height="260" rx="6" fill="${pal.light ? '#1f5f66' : '#d9bd72'}"/>`.replace('/>', '/>') + S(`M${CX + 24} ${top - 80}v240`, '#fff', 2.5, 'opacity=".5"')));
  if (v === 0) { c.add(date(c, CX + 190, cy - 4, 20)); c.add(date(c, CX + 230, cy + 10, -20)); c.add(date(c, CX - 200, cy)); }
  if (v === 1) { c.add(P(`M${CX + 150} ${cy}q30 -40 60 0q-30 20 -60 0z`, '#e86a8a')); c.add(P(`M${CX - 220} ${cy + 4}q16 -40 36 0q-18 14 -36 0z`, '#e86a8a')); c.add(C(CX - 170, cy + 14, 14, c.gl('#e86a8a'))); }
  if (v === 2) { sprinkle(c, CX - 200, cy + 10, 40, 8, 6, (x, y) => saffron(x, y, c.r() * 60)); c.add(cardamom(CX + 200, cy + 8, 10)); c.add(lemonWheel(c, CX + 120, top + 20, 0.01)); c.add(lemonWheel(c, CX - 130, cy - 20, 30)); }
  if (v === 3) { c.add(leaf(CX + 120, top - 20, -120, 70)); c.add(leaf(CX + 110, top - 14, -60, 70, '#2f7a3a')); c.add(lemonWheel(c, CX + 160, cy - 6, 34, '#9fd64a')); }
};

heroes.tannour = (c, pal, v) => {
  const cy = 370, bread = ['#d9a05a', '#e3b571', '#c98a45', '#ecc88e'][v];
  c.shadow(CX, cy + 70, 280, 50, .5);
  if (v === 1 || v === 3) { c.add(E(CX, cy + 20, 260, 108, c.lg([drk('#8a5a2a', .1), drk('#8a5a2a', .55)]))); c.add(E(CX, cy + 8, 260, 108, c.vs('#a8723a', .3, .3))); for (let i = 0; i < 8; i++) c.add(S(`M${CX - 220 + i * 56} ${cy - 90}Q${CX - 240 + i * 56} ${cy + 10} ${CX - 200 + i * 56} ${cy + 100}`, '#6b4420', 3, 'opacity=".5"')); }
  else { c.add(E(CX, cy + 16, 262, 104, c.lg([lit(pal.cloth, .1), drk(pal.cloth, .5)]))); c.add(E(CX, cy + 4, 262, 104, c.lg([lit(pal.cloth, .3), pal.cloth]))); c.add(S(`M${CX - 240} ${cy + 20}h480`, pal.motif, 3, 'opacity=".5" stroke-dasharray="10 10"')); }
  const loaf = (x, y, rx, ry, a) => {
    c.add(G(`translate(${n(x)} ${n(y)}) rotate(${a})`, E(4, 14, rx, ry, 'rgba(40,15,0,.4)') + E(0, 8, rx, ry, drk(bread, .28)) + E(0, 0, rx, ry, c.rg([lit(bread, .35), bread, drk(bread, .22)], .45, .4, .8)) +
      [...Array(22)].map((_, i) => E(-rx * .8 + (i * 61 % 160) / 160 * rx * 1.6, -ry * .7 + (i * 37 % 100) / 100 * ry * 1.4, 4 + (i % 3) * 3, 2.4 + (i % 3) * 1.6, i % 4 ? '#6b3a14' : '#4a260c', 'opacity=".5"')).join('') +
      S(`M${-rx * .6} ${-ry * .2}Q0 ${-ry * .6} ${rx * .6} ${-ry * .2}M${-rx * .7} ${ry * .15}Q0 ${-ry * .25} ${rx * .7} ${ry * .15}`, drk(bread, .3), 2, 'opacity=".4"') + E(-rx * .3, -ry * .5, rx * .35, ry * .1, '#fff0d0', 'opacity=".45"'))); };
  if (v === 0) { loaf(CX + 40, cy - 6, 190, 78, 0); loaf(CX - 60, cy + 28, 170, 70, -4); }
  if (v === 1) { loaf(CX, cy, 205, 86, 2); }
  if (v === 2) { loaf(CX - 120, cy + 10, 130, 56, -10); loaf(CX + 120, cy + 10, 130, 56, 8); loaf(CX, cy - 36, 130, 54, 0); }
  if (v === 3) { loaf(CX + 20, cy + 20, 190, 74, -3); c.add(P(`M${CX - 140} ${cy - 20}Q${CX} ${cy - 130} ${CX + 160} ${cy - 20}Q${CX} ${cy - 50} ${CX - 140} ${cy - 20}Z`, c.vs(bread, .25, .3))); }
  sprinkle(c, CX, cy, 160, 56, 20, (x, y, r) => sesame(x, y, r * 180));
  steam(c, CX - 40, cy - 80, '#fff', .3); steam(c, CX + 70, cy - 90, '#fff', .25);
};

// ---- category fallbacks ----
heroes.bakery = (c, pal, v) => {
  const cy = 380;
  c.shadow(CX, cy + 70, 270, 44, .55);
  c.add(E(CX, cy + 30, 238, 90, c.lg(['#8a5a2a', '#3d2610'])));
  const loaf = (x, y, rx, ry, a, col) => c.add(G(`translate(${n(x)} ${n(y)}) rotate(${a})`, E(2, 10, rx, ry, 'rgba(0,0,0,.35)') + E(0, 0, rx, ry, c.rg([lit(col, .4), col, drk(col, .4)], .4, .3, .85, .35, .2)) + [...Array(4)].map((_, i) => S(`M${-rx * .5 + i * rx * .3} ${-ry * .7}q${rx * .12} ${ry * .7} ${-rx * .1} ${ry * 1.3}`, drk(col, .35), 3, 'opacity=".6"')).join('') + E(-rx * .3, -ry * .5, rx * .3, ry * .12, '#fff0d0', 'opacity=".5"')));
  loaf(CX - 100, cy - 10, 120, 54, -18, '#d49b45'); loaf(CX + 110, cy - 18, 110, 50, 16, '#c27a32'); loaf(CX, cy + 20, 100, 60, 0, '#e3b571');
  c.add(`<rect x="${CX - 250}" y="${cy + 40}" width="500" height="64" rx="30" fill="${c.vs('#a8723a', .3, .35)}"/>`);
  for (let i = 0; i < 12; i++) c.add(S(`M${CX - 240 + i * 42} ${cy + 46}q14 24 0 54`, '#5c3818', 3, 'opacity=".5"'));
  c.add(`<rect x="${CX - 260}" y="${cy + 30}" width="520" height="20" rx="10" fill="${c.vs('#b9803a', .4, .3)}"/>`);
  for (let i = 0; i < 4; i++) c.add(P(`M${CX - 180 + i * 120} ${cy - 120}l-8 -40 ${28} 14z`, 'none'));
  c.add(leaf(CX - 40, cy - 94, -100, 60, '#c9a24a')); c.add(leaf(CX - 38, cy - 94, -60, 60, '#d9bd72'));
  c.add(cardamom(CX + 230, cy + 120, 20)); c.add(date(c, CX - 240, cy + 124, 5));
};
heroes.meal = (c, pal) => {
  const cy = 380;
  plate(c, pal, CX, cy, 280, 130);
  riceMound(c, pal, CX - 70, cy - 4, 120, 82, ['#f0c43a', '#fff0b0', '#e49a1d']);
  drum(c, CX + 110, cy - 20, -10, 1.1); drum(c, CX + 60, cy + 30, 20, .9, '#a85a1c');
  c.add(E(CX - 30, cy + 62, 60, 18, '#4a9a3f')); sprinkle(c, CX - 30, cy + 60, 50, 12, 10, (x, y, r) => C(x, y, 5 + r * 4, r > .5 ? '#d62a1c' : '#7ab13c'));
  sprinkle(c, CX - 70, cy - 60, 70, 20, 6, (x, y) => C(x, y, 4.5, '#5a1f4d'));
  c.add(lemonWheel(c, CX + 180, cy + 60, 26)); c.add(leaf(CX + 140, cy + 82, 10, 40));
  steam(c, CX - 80, cy - 100, '#fff', .35); steam(c, CX + 20, cy - 110, '#fff', .3);
};
heroes.sauce = (c, pal) => {
  const cy = 420;
  c.shadow(CX, cy + 40, 260, 40, .55);
  const b = (x, w, h, col, neck) => { c.add(P(`M${x - w} ${cy}V${cy - h * .6}Q${x - w} ${cy - h * .75} ${x - neck} ${cy - h * .85}V${cy - h}H${x + neck}V${cy - h * .85}Q${x + w} ${cy - h * .75} ${x + w} ${cy - h * .6}V${cy}Q${x} ${cy + 16} ${x - w} ${cy}Z`, c.lg([drk(col, .2), lit(col, .25), drk(col, .5)], 0, 0, 1, 0))); c.add(`<rect x="${x - neck - 4}" y="${cy - h - 22}" width="${neck * 2 + 8}" height="26" rx="6" fill="${c.vs('#e8d8a8', .2, .35)}"/>`); c.add(`<rect x="${x - w + 8}" y="${cy - h * .55}" width="${w * 2 - 16}" height="${h * .34}" rx="10" fill="#f6e8c4" opacity=".92"/>`); c.add(C(x, cy - h * .38, h * .09, col)); c.add(S(`M${x - w + 10} ${cy - h * .7}V${cy - 14}`, '#fff', 6, 'opacity=".25"')); };
  b(CX - 120, 56, 220, '#c4261b', 24); b(CX + 20, 60, 180, '#d9941a', 28); b(CX + 140, 44, 140, '#3f8a45', 22);
  bowl(c, pal, CX - 20, cy + 44, 90, 22, 40, { color: '#2a2420' }); c.add(E(CX - 20, cy + 46, 76, 15, '#c4261b'));
  c.add(chili(c, CX - 250, cy + 30, -10, '#d62a1c', 80)); c.add(leaf(CX + 200, cy + 30, -20, 50)); c.add(cardamom(CX + 220, cy + 64, 15));
};
heroes.starter = (c, pal) => {
  const cy = 380;
  plate(c, pal, CX, cy, 275, 125);
  const sam = (x, y, a, s) => c.add(G(`translate(${n(x)} ${n(y)}) rotate(${a}) scale(${s})`, E(3, 14, 50, 12, 'rgba(40,15,0,.4)') + P('M-54 20L0 -48L54 20Q0 34 -54 20Z', c.rg(['#e2a447', '#b8651f', '#7a3e12'], .4, .3, .9, .4, .2)) + S('M-34 8Q0 -24 34 8', '#f2cf88', 3, 'opacity=".55"') + S('M-48 18q10 6 20 0t20 0t20 0t20 0t20 0', '#6b3a14', 3)));
  sam(CX - 90, cy - 12, -6, 1.15); sam(CX + 60, cy - 8, 8, 1.15); sam(CX - 10, cy - 70, 0, 1.0);
  sprinkle(c, CX + 190, cy + 40, 36, 14, 4, (x, y) => C(x, y, 13, c.gl('#5b6b2a'))); sprinkle(c, CX - 200, cy + 44, 30, 12, 3, (x, y) => C(x, y, 12, c.gl('#d62a1c')));
  c.add(lemonWheel(c, CX + 20, cy + 64, 32)); c.add(leaf(CX - 120, cy + 70, 20, 50));
  steam(c, CX - 40, cy - 100, '#fff', .3);
};
heroes.placeholder = (c, pal) => {
  const cy = 400;
  plate(c, pal, CX, cy, 250, 108);
  c.shadow(CX, cy - 10, 200, 90, .1);
  const dome = c.lg(['#fbfaf6', '#d6d2c6', '#9a968a'], 0, 0, 1, 0);
  c.add(P(`M${CX - 200} ${cy - 6}Q${CX - 200} ${cy - 200} ${CX} ${cy - 200}Q${CX + 200} ${cy - 200} ${CX + 200} ${cy - 6}Q${CX} ${cy + 36} ${CX - 200} ${cy - 6}Z`, dome, 'opacity=".72" stroke="#fff" stroke-width="3" stroke-opacity=".7"'));
  c.add(S(`M${CX - 150} ${cy - 60}Q${CX - 140} ${cy - 150} ${CX - 60} ${cy - 175}`, '#fff', 8, 'opacity=".6"'));
  c.add(C(CX, cy - 214, 14, c.gl('#d1a64e')));
  c.add(E(CX, cy - 20, 120, 38, c.rg(['#eadfc0', '#c9b58a'], .5, .4, .7), 'opacity=".5"'));
  for (let i = 0; i < 3; i++) c.add(C(CX - 40 + i * 40, cy - 30 + (i % 2) * 8, 8, '#b9a478', 'opacity=".55"'));
  const sp = (x, y, s) => P(`M${x} ${y - s}Q${x + s * .2} ${y - s * .2} ${x + s} ${y}Q${x + s * .2} ${y + s * .2} ${x} ${y + s}Q${x - s * .2} ${y + s * .2} ${x - s} ${y}Q${x - s * .2} ${y - s * .2} ${x} ${y - s}Z`, '#d1a64e');
  c.add(sp(CX + 240, cy - 150, 20)); c.add(sp(CX - 250, cy - 100, 14)); c.add(sp(CX + 200, cy - 220, 10));
};
heroes['qurs-ageili'] = (c, pal, v) => qurs(c, pal, 0);
heroes['sobia-single'] = heroes.sobia;

// ---------- build ----------
function render(slug, v, palIdx, kind, drawer) {
  const pal = PALS[palIdx];
  const c = new Ctx(hash(slug) * 7 + v);
  background(c, v, pal, kind);
  const mark = c.body.length;
  drawer(c, pal, v);
  const hero = c.body.splice(mark).join('');
  c.add(`<g transform="translate(400 335) scale(${HERO_SCALE}) translate(-400 -335)">${hero}</g>`);
  finish(c, pal);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${slug}"><defs>${c.defs.join('')}</defs>${c.body.join('')}</svg>\n`;
}

mkdirSync(OUT, { recursive: true });
const DISHES = ['asida', 'balaleet', 'burger', 'coffee', 'dakoos', 'ghraiba', 'hala', 'kibba', 'lemon', 'lugaimat', 'maamoul', 'pickles', 'qurs', 'ragag', 'rice', 'shatta', 'sobia', 'tannour'];
const written = [];
for (const slug of DISHES) {
  const h = hash(slug);
  for (let v = 0; v < 4; v++) {
    const f = `d-${slug}-${v}.svg`;
    writeFileSync(join(OUT, f), render(slug, v, (v + h) % 4, (v * 3 + (h >> 3)) % 4 === (v + h) % 4 ? (v * 3 + (h >> 3) + 1) % 4 : (v * 3 + (h >> 3)) % 4, heroes[slug]));
    written.push(f);
  }
}
// fallbacks: fixed variant/palette choices
const FALL = { bakery: [0, 2, 1], machboos: [0, 1, 0], meal: [0, 0, 1], placeholder: [0, 3, 3], 'qurs-ageili': [0, 2, 0], sauce: [0, 1, 3], sobia: [1, 0, 2], starter: [0, 2, 1] };
for (const [slug, [v, pi, kind]] of Object.entries(FALL)) {
  const f = `${slug}.svg`;
  writeFileSync(join(OUT, f), render(slug, v, pi, kind, slug === 'sobia' ? heroes.sobia : heroes[slug]));
  written.push(f);
}
console.log(`wrote ${written.length} files to ${OUT}`);
