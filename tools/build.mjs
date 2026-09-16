#!/usr/bin/env node
/**
 * Statik içerik üreticisi — Gusto Organik
 *
 * data/site-data.json → index.html + sitemap.xml + llms.txt
 *
 * Kullanım:
 *   node tools/build.mjs            # dosyaları güncelle
 *   node tools/build.mjs --check    # fark varsa 1 ile çık (CI doğrulaması)
 *
 * Hiçbir npm bağımlılığı gerektirmez (saf Node).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const HBShared = require(join(ROOT, 'js/shared-templates.js'));
const { esc, templates: T, contactVocabulary, groupHours, getLiveStatus, formatLiveLabel, gorunur } = HBShared;

const CHECK_ONLY = process.argv.includes('--check');
const dataPath = join(ROOT, 'data/site-data.json');
const data = JSON.parse(readFileSync(dataPath, 'utf8'));

/* ==========================================================================
   Bölge değiştirme yardımcıları — <title>/<script> gibi "raw text" etiketler
   HTML yorumu barındıramadığından işaretçiler o etiketlerin DIŞINA konur;
   içerik üretimi ilgili etiketi de kapsayacak şekilde yapılır.
   ========================================================================== */
const FLUSH_REGIONS = new Set(['ogTags', 'jsonLd', 'title', 'metaDescription', 'canonical',
  'heroImage', 'aboutImage', 'navCallBtn', 'heroCallBtn', 'drawerCallBtn', 'mapFrame', 'mapActions',
  'instagramLink', 'themeVars', 'attrFeatures', 'featuresEyebrow', 'featuresTitle', 'featuresLead',
  'brandSymbol', 'heroFloat', 'footerBrand', 'attrAbout', 'attrGallery', 'attrMenu',
  'attrTestimonials', 'attrFaq', 'attrMap']);

function reindent(block, indent) {
  const rows = block.split('\n');
  const widths = rows.filter((l) => l.trim().length).map((l) => (/^[ \t]*/.exec(l) || [''])[0].length);
  const min = widths.length ? Math.min(...widths) : 0;
  return rows.map((l) => (l.trim().length ? indent + l.slice(min) : '')).join('\n');
}

function replaceRegion(html, name, content) {
  const open = `<!--BUILD:${name}-->`;
  const close = `<!--/BUILD:${name}-->`;
  const start = html.indexOf(open);
  const end = html.indexOf(close);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Bölge işaretçisi bulunamadı: ${name}`);
  }
  const lineStart = html.lastIndexOf('\n', start) + 1;
  const baseIndent = (/^[ \t]*/.exec(html.slice(lineStart, start)) || [''])[0];

  let body;
  if (content.includes('\n')) {
    const indent = FLUSH_REGIONS.has(name) ? baseIndent : baseIndent + '  ';
    body = '\n' + reindent(content, indent) + '\n' + baseIndent;
  } else {
    body = content;
  }
  return html.slice(0, start) + open + body + close + html.slice(end + close.length);
}

function stampVersion(html, version) {
  return html.replace(/(<html[^>]*\sdata-hb-version=")[^"]*(")/, `$1${esc(version)}$2`);
}

function writeIfChanged(path, next) {
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (current === next) return false;
  if (!CHECK_ONLY) writeFileSync(path, next, 'utf8');
  return true;
}

/* ==========================================================================
   Doğrulama — sessiz veri hatalarını build zamanında yakalar
   ========================================================================== */
function validate() {
  const problems = [];
  const seenIds = new Set();

  (data.menuCategories || []).forEach((cat) => {
    if (!cat.key) problems.push(`Menü kategorisi "${cat.title}" için key eksik.`);
    (cat.items || []).forEach((item) => {
      if (!item.id) problems.push(`"${cat.title}" içindeki "${item.title}" için id eksik.`);
      if (!item.title) problems.push(`Eksik menü adı: ${cat.key} / ${item.id}`);
      if (item.price === undefined || item.price === null || String(item.price).trim() === '') {
        problems.push(`Eksik menü fiyat metni: ${cat.key} / ${item.id}`);
      }
      if (seenIds.has(item.id)) problems.push(`Menü id tekrar ediyor: ${item.id}`);
      seenIds.add(item.id);
      if (!HBShared.ICON_PATHS[cat.icon]) problems.push(`Bilinmeyen kategori ikonu: ${cat.icon} (${cat.title})`);
    });
  });

  (data.features || []).forEach((f) => {
    if (!HBShared.ICON_PATHS[f.icon]) problems.push(`Bilinmeyen özellik ikonu: ${f.icon} (${f.title})`);
  });

  if (!data.contentVersion) problems.push('contentVersion alanı boş.');
  if (data.brand && data.brand.hasWhatsapp && data.brand.phoneType === 'landline') {
    problems.push('brand.phoneType "landline" iken hasWhatsapp true olamaz (KURAL 2 ihlali).');
  }
  return problems;
}

/* ==========================================================================
   Yapı taşları
   ========================================================================== */
function titleTag(text) { return `<title>${esc(text)}</title>`; }
function metaDescTag(text) { return `<meta name="description" content="${esc(text)}">`; }
function canonicalTag(url) { return `<link rel="canonical" href="${esc(url)}">`; }

function ogTags(home, seo) {
  const heroUrl = seo.siteUrl.replace(/\/$/, '') + '/' + (data.hero?.mainImage?.url || 'images/hero-kapak.webp');
  return [
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="' + esc(data.brand.name) + '">',
    `<meta property="og:title" content="${esc(home.ogTitle || home.title)}">`,
    `<meta property="og:description" content="${esc(home.ogDescription || home.description)}">`,
    `<meta property="og:image" content="${esc(heroUrl)}">`,
    `<meta property="og:url" content="${esc(seo.canonical)}">`,
    '<meta property="og:locale" content="tr_TR">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(home.ogTitle || home.title)}">`,
    `<meta name="twitter:description" content="${esc(home.ogDescription || home.description)}">`,
    `<meta name="twitter:image" content="${esc(heroUrl)}">`
  ].join('\n');
}

function jsonLdTag(json) { return `<script type="application/ld+json">\n${json}\n</script>`; }

function imgTag(image, attrs) {
  const a = Object.assign({ decoding: 'async' }, attrs || {});
  if (a.fetchpriority === 'high') a.loading = 'eager';
  else if (!a.loading) a.loading = 'lazy';
  const parts = [`src="${esc(image.url)}"`, `alt="${esc(image.alt || '')}"`];
  if (image.width) parts.push(`width="${esc(image.width)}"`);
  if (image.height) parts.push(`height="${esc(image.height)}"`);
  parts.push(`style="object-position: ${HBShared.focal(image)};"`);
  Object.entries(a).forEach(([k, v]) => parts.push(`${k}="${esc(v)}"`));
  return `<img ${parts.join(' ')}>`;
}

function themeStyle(theme) {
  const t = theme || {};
  const h = Number.isFinite(t.accentHue) ? t.accentHue : 28;
  const s = Number.isFinite(t.accentSat) ? t.accentSat : 48;
  const l = Number.isFinite(t.accentLight) ? t.accentLight : 34;
  const deep = Math.max(l - 12, 14);
  const hover = Math.max(l - 8, 22);
  const wash = Math.min(s + 8, 40);
  return `<style id="themeVars">:root{--accent:hsl(${h} ${s}% ${l}%);--accent-deep:hsl(${h} ${s}% ${deep}%);--accent-hover:hsl(${h} ${s}% ${hover}%);--accent-soft:hsl(${h} ${wash}% 92%);--accent-glow:hsla(${h},${s}%,${l}%,0.22);}</style>`;
}

function mapActionsTag(brand) {
  const gm = brand.googleMaps || {};
  const dir = `https://www.google.com/maps/dir/?api=1&destination=${gm.lat},${gm.lng}` +
    (gm.placeId ? `&destination_place_id=${encodeURIComponent(gm.placeId)}` : '');
  return `<div class="map-actions">
  <a class="btn btn-primary" href="${esc(dir)}" target="_blank" rel="noopener noreferrer">Yol Tarifi Al</a>
  <a class="btn btn-secondary surface-glass" href="${esc(gm.placeUrl || '#')}" target="_blank" rel="noopener noreferrer">Google'da Gör</a>
</div>`;
}

function attrHidden(on) {
  return on ? '' : ' hidden';
}

function callLinkTag(contact, phoneDisplay, variant) {
  const href = contact.href || ('tel:+' + contact.phoneClean);
  const label = variant === 'nav' ? phoneDisplay : (contact.ctaShort || 'Hemen Ara');
  const isWa = contact.channel === 'whatsapp';
  const svg = isWa
    ? '<svg width="' + (variant === 'nav' ? 16 : 17) + '" height="' + (variant === 'nav' ? 16 : 17) + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"></path><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.957-1.401A9.955 9.955 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" fill="none" stroke="currentColor" stroke-width="1.5"></path></svg>'
    : '<svg width="' + (variant === 'nav' ? 16 : 17) + '" height="' + (variant === 'nav' ? 16 : 17) +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (variant === 'nav' ? 2 : 2.2) +
      '" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>';
  if (variant === 'nav') {
    return `<a class="nav-call-btn" href="${esc(href)}"${isWa ? ' target="_blank" rel="noopener noreferrer"' : ''}>\n  ${svg}\n  <span class="call-text">${esc(label)}</span>\n</a>`;
  }
  const extraClass = variant === 'drawer' ? ' drawer-cta' : '';
  return `<a href="${esc(href)}" class="btn btn-primary${extraClass}"${isWa ? ' target="_blank" rel="noopener noreferrer"' : ''}>\n  ${svg}\n  ${esc(label)}\n</a>`;
}

function mapFrameTag(brand) {
  const gm = brand.googleMaps || {};
  const src = gm.embedUrl || `https://maps.google.com/maps?q=${gm.lat},${gm.lng}(${encodeURIComponent(brand.name || '')})&z=17&hl=tr&output=embed`;
  return `<iframe src="${esc(src)}" title="${esc(brand.name)} konumu" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>`;
}

function instagramLinkTag(brand) {
  if (!brand.instagramHandle || !brand.instagramUrl) return '';
  return `<a href="${esc(brand.instagramUrl)}" target="_blank" rel="noopener noreferrer">Instagram</a>`;
}

function sectionOnMenu(data) {
  return HBShared.sectionOn(data, 'menu');
}

/* ==========================================================================
   index.html üretimi
   ========================================================================== */
function buildIndex() {
  const path = join(ROOT, 'index.html');
  let html = readFileSync(path, 'utf8');
  const home = data.seo?.home || {};
  const seo = data.seo || {};
  const brand = data.brand || {};
  const contact = contactVocabulary(brand);
  const live = getLiveStatus(data.hours);
  const faqLead = HBShared.fillPlaceholders(data.sections?.faq?.lead || '', brand);

  const regions = {
    title: titleTag(home.title || ''),
    metaDescription: metaDescTag(home.description || ''),
    canonical: canonicalTag(seo.canonical || seo.siteUrl || ''),
    ogTags: ogTags(home, seo),
    jsonLd: jsonLdTag(T.jsonLd(data)),
    themeVars: themeStyle(data.theme),

    brandName: esc(brand.name),
    brandSub: esc(brand.subName || ''),
    brandSymbol: esc(brand.symbol || 'BU'),
    footerBrand: esc(brand.name),
    heroFloat: '<strong>' + esc(brand.addressNote || '') + '</strong><br>\n            <span>' + esc((brand.address || '').replace(/^.*No:/i, 'No:').split(',')[0] + ', ' + (brand.addressDistrict || '').split('/')[0].trim()) + '</span>',
    liveStatusFull: esc(formatLiveLabel(data.hours, live, 'full')),
    liveStatusShort: esc(formatLiveLabel(data.hours, live, 'short')),

    navCallBtn: callLinkTag(contact, brand.phone, 'nav'),
    heroCallBtn: callLinkTag(contact, brand.phone, 'hero'),
    drawerCallBtn: callLinkTag(contact, brand.phone, 'drawer'),

    heroBadge: esc(data.hero?.badge || ''),
    heroTitleLine1: esc(data.hero?.titleLine1 || ''),
    heroTitleAccent: esc(data.hero?.titleAccent || ''),
    heroSubtitle: esc(data.hero?.subtitle || ''),
    heroTrust: T.heroTrust(data),
    heroImage: imgTag(data.hero?.mainImage || {}, { fetchpriority: 'high' }),

    attrFeatures: attrHidden(gorunur(data, 'features', data.features)),
    featuresEyebrow: esc(data.sections?.features?.eyebrow || ''),
    featuresTitle: esc(data.sections?.features?.title || ''),
    featuresLead: esc(data.sections?.features?.lead || ''),
    features: T.features(data),

    attrAbout: attrHidden(gorunur(data, 'about', data.about?.paragraphs)),
    aboutImage: imgTag(data.about?.image || {}, { loading: 'lazy' }),
    aboutEyebrow: esc(data.about?.eyebrow || ''),
    aboutTitle: esc(data.about?.title || ''),
    aboutParagraphs: T.aboutParagraphs(data),
    aboutQuote: esc(data.about?.quote || ''),

    attrGallery: attrHidden(gorunur(data, 'gallery', data.gallery)),
    galleryEyebrow: esc(data.sections?.gallery?.eyebrow || ''),
    galleryTitle: esc(data.sections?.gallery?.title || ''),
    galleryLead: esc(data.sections?.gallery?.lead || ''),
    gallery: T.gallery(data),

    attrMenu: attrHidden(sectionOnMenu(data)),
    menuEyebrow: esc(data.sections?.menu?.eyebrow || ''),
    menuTitle: esc(data.sections?.menu?.title || ''),
    menuLead: esc(data.sections?.menu?.lead || ''),
    menuFilters: T.menuFilters(data),
    menuCategories: T.menuCategories(data),
    menuNotice: T.menuNotice(data),

    attrTestimonials: attrHidden(gorunur(data, 'testimonials', data.testimonials)),
    testimonialsEyebrow: esc(data.sections?.testimonials?.eyebrow || ''),
    testimonialsTitle: esc(data.sections?.testimonials?.title || ''),
    testimonialsLead: esc(data.sections?.testimonials?.lead || ''),
    testimonials: T.testimonials(data),
    reviewCta: T.reviewCta(data),

    attrFaq: attrHidden(gorunur(data, 'faq', data.faq)),
    faqEyebrow: esc(data.sections?.faq?.eyebrow || ''),
    faqTitle: esc(data.sections?.faq?.title || ''),
    faqLead: esc(faqLead),
    faq: T.faq(data),

    contactEyebrow: esc(data.sections?.contact?.eyebrow || ''),
    contactTitle: esc(data.sections?.contact?.title || ''),
    contactLead: esc(data.sections?.contact?.lead || ''),
    contactCardTitle: esc(data.sections?.contact?.cardTitle || ''),
    contactCardSub: esc(data.sections?.contact?.cardSubtitle || ''),
    contactItems: T.contactItems(data),
    hoursRows: T.hoursRows(data),
    attrMap: attrHidden(gorunur(data, 'map', brand.googleMaps?.lat != null)),
    mapFrame: mapFrameTag(brand),
    mapActions: mapActionsTag(brand),

    footerDesc: esc(data.footer?.desc || ''),
    footerCopyright: esc(data.footer?.copyright || ''),
    instagramLink: instagramLinkTag(brand)
  };

  for (const [name, content] of Object.entries(regions)) {
    html = replaceRegion(html, name, content);
  }
  html = stampVersion(html, data.contentVersion);
  return { path, changed: writeIfChanged(path, html), name: 'index.html' };
}

/* ==========================================================================
   sitemap.xml (fragman/hash URL'siz — KURAL: temiz SEO)
   ========================================================================== */
function buildSitemap() {
  const path = join(ROOT, 'sitemap.xml');
  const site = (data.seo?.siteUrl || '').replace(/\/$/, '');
  const stampDate = new Date(data.contentVersion || Date.now());
  const stamp = (isNaN(stampDate.getTime()) ? new Date() : stampDate).toISOString().slice(0, 10);
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    `    <loc>${esc(site)}/</loc>`,
    `    <lastmod>${stamp}</lastmod>`,
    '    <changefreq>weekly</changefreq>',
    '    <priority>1.0</priority>',
    '  </url>',
    '</urlset>',
    ''
  ].join('\n');
  return { path, changed: writeIfChanged(path, xml), name: 'sitemap.xml' };
}

/* ==========================================================================
   llms.txt — büyük dil modelleri için yapılandırılmış işletme özeti
   ========================================================================== */
function buildLlmsTxt() {
  const path = join(ROOT, 'llms.txt');
  const brand = data.brand;
  const site = (data.seo?.siteUrl || '').replace(/\/$/, '');
  const contact = contactVocabulary(brand);
  const hourLines = groupHours(data.hours).map((g) =>
    `- ${g.label}: ${g.closed ? 'Kapalı' : HBShared.rangeLabel(g.ranges)}`
  ).join('\n');

  const menuLines = (data.menuCategories || []).map((cat) => {
    const items = (cat.items || []).map((i) => `  - ${i.title} — ${i.price}${i.desc ? ' — ' + i.desc : ''}`).join('\n');
    return `### ${cat.title}\n${items}`;
  }).join('\n\n');

  const faqLines = (data.faq || []).map((f) =>
    `Q: ${HBShared.fillPlaceholders(f.question, brand)}\nA: ${HBShared.fillPlaceholders(f.answer, brand)}`
  ).join('\n\n');

  const instaLine = brand.instagramUrl ? `- Instagram: ${brand.instagramUrl}\n` : '';
  const menuHead = data.menuStatus === 'pending'
    ? '## İmza Ürünler (fiyatlar panelden girilecek)'
    : data.menuStatus === 'estimated'
      ? '## Menü (örnek fiyatlar)'
      : '## Menü';

  const txt = `# ${brand.name}

> ${data.seo?.home?.description || ''}

## Temel Bilgiler
- Kategori: ${brand.category}
- Adres: ${brand.address}, ${brand.addressDistrict}
- Telefon: ${brand.phone}
- İletişim Kanalı: ${contact.noun}
${instaLine}- Google Haritalar: ${brand.googleMaps?.placeUrl || ''}
- Google Puanı: ${brand.googleMaps?.rating} (${brand.googleMaps?.reviewCount} yorum)
- Web Sitesi: ${site}

## Çalışma Saatleri (Europe/Istanbul)
${hourLines}

${menuHead}
${menuLines}

## Sıkça Sorulan Sorular
${faqLines}

## Notlar
- Bu dosya otomatik üretilir: tools/build.mjs → data/site-data.json.
- Menü fiyatları işletme sahibi tarafından admin panelinden güncellenir.
`;
  return { path, changed: writeIfChanged(path, txt), name: 'llms.txt' };
}

/* ==========================================================================
   Çalıştır
   ========================================================================== */
const problems = validate();
if (problems.length) {
  console.error('❌ Veri doğrulama hataları:');
  problems.forEach((p) => console.error('   • ' + p));
  process.exit(1);
}

const results = [buildIndex(), buildSitemap(), buildLlmsTxt()];
const changed = results.filter((r) => r.changed);

const totalItems = (data.menuCategories || []).reduce((n, c) => n + (c.items?.length || 0), 0);
console.log(`ℹ️  Sürüm: ${data.contentVersion}`);
console.log(`ℹ️  ${data.menuCategories.length} menü kategorisi · ${totalItems} ürün · ${data.testimonials.length} yorum · ${data.faq.length} SSS`);

if (CHECK_ONLY) {
  if (changed.length) {
    console.error('❌ Statik HTML, data/site-data.json ile uyumsuz: ' + changed.map((c) => c.name).join(', '));
    console.error('   Düzeltmek için: node tools/build.mjs');
    process.exit(1);
  }
  console.log('✅ Statik HTML güncel.');
} else if (changed.length) {
  console.log('✅ Güncellendi: ' + changed.map((c) => c.name).join(', '));
} else {
  console.log('✅ Değişiklik yok, her şey güncel.');
}
