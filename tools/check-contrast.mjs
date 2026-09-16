#!/usr/bin/env node
/**
 * WCAG 2.1 AA kontrast — Gusto Organik tema renkleri.
 * Tüm oranlar ≥ 4.5 olmalı (normal metin).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(ROOT, 'data/site-data.json'), 'utf8'));
const theme = data.theme || {};
const h = Number.isFinite(theme.accentHue) ? theme.accentHue : 28;
const s = Number.isFinite(theme.accentSat) ? theme.accentSat : 48;
const l = Number.isFinite(theme.accentLight) ? theme.accentLight : 34;

function hslToRgb(hh, ss, ll) {
  const S = ss / 100;
  const L = ll / 100;
  const C = (1 - Math.abs(2 * L - 1)) * S;
  const X = C * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = L - C / 2;
  let r = 0, g = 0, b = 0;
  if (hh < 60) { r = C; g = X; }
  else if (hh < 120) { r = X; g = C; }
  else if (hh < 180) { g = C; b = X; }
  else if (hh < 240) { g = X; b = C; }
  else if (hh < 300) { r = X; b = C; }
  else { r = C; b = X; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function hexToRgb(hex) {
  const h2 = hex.replace('#', '');
  return [parseInt(h2.slice(0, 2), 16), parseInt(h2.slice(2, 4), 16), parseInt(h2.slice(4, 6), 16)];
}

function lin(c) {
  const srgb = c / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function lum(rgb) {
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

function ratio(a, b) {
  const L1 = lum(a);
  const L2 = lum(b);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

const accent = hslToRgb(h, s, l);
const accentDeep = hslToRgb(h, s, Math.max(l - 12, 14));
const white = hexToRgb('#FFFFFF');
const text = hexToRgb('#1d1d1f');
const bg = hexToRgb('#FBF8F3');
const bg2 = hexToRgb('#F3EEE4');
const inverse = hexToRgb('#ffffff');

const pairs = [
  ['Metin / vanilya zemin', text, bg],
  ['Metin / ikincil zemin', text, bg2],
  ['Aksan / beyaz (buton yazısı tersi)', accent, white],
  ['Aksan / vanilya (fiyat, vurgu)', accent, bg],
  ['Aksan derin / vanilya (saat, uyarı)', accentDeep, bg],
  ['Ters metin / aksan (birincil buton)', inverse, accent]
];

let fail = 0;
console.log(`Tema aksanı: hsl(${h} ${s}% ${l}%) → rgb(${accent.join(', ')})`);
pairs.forEach(([label, fg, bgc]) => {
  const r = ratio(fg, bgc);
  const ok = r >= 4.5;
  if (!ok) fail += 1;
  console.log(`${ok ? '✅' : '❌'} ${label}: ${r.toFixed(2)} ${ok ? '≥' : '<'} 4.5`);
});

if (fail) {
  console.error(`❌ ${fail} çift WCAG AA eşiğinin altında.`);
  process.exit(1);
}
console.log('✅ Tüm kontrast oranları ≥ 4.5');
