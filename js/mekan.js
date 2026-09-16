/**
 * Mekân varyantı — mevcut app.js'e dokunmaz.
 * FoodFarm kart ritmi: fotoğraflı reyon, fiyat/sepet yok.
 */
(function () {
  'use strict';

  var state = { data: null };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function setHtml(sel, html) {
    var el = $(sel);
    if (el) el.innerHTML = html;
  }

  function applyTheme(theme) {
    if (!theme) return;
    var h = theme.accentHue, s = theme.accentSat, l = theme.accentLight;
    if (!Number.isFinite(h)) return;
    var root = document.documentElement;
    root.style.setProperty('--accent', 'hsl(' + h + ' ' + s + '% ' + l + '%)');
    root.style.setProperty('--accent-deep', 'hsl(' + h + ' ' + s + '% ' + Math.max(l - 12, 14) + '%)');
    root.style.setProperty('--accent-hover', 'hsl(' + h + ' ' + s + '% ' + Math.max(l - 8, 22) + '%)');
    root.style.setProperty('--accent-soft', 'hsl(' + h + ' ' + Math.min(s + 8, 40) + '% 92%)');
    root.style.setProperty('--accent-glow', 'hsla(' + h + ', ' + s + '%, ' + l + '%, 0.22)');
  }

  function renderLiveStatus(data) {
    var pill = document.getElementById('liveStatusPill');
    if (!pill) return;
    var live = HBShared.getLiveStatus(data.hours);
    pill.classList.toggle('closed', !live.openNow);
    pill.classList.toggle('is-closed', !live.openNow);
    pill.classList.toggle('is-open', live.openNow);
    var full = document.getElementById('liveStatusLabelFull');
    var short = document.getElementById('liveStatusLabelShort');
    if (full) full.textContent = HBShared.formatLiveLabel(data.hours, live, 'full');
    if (short) short.textContent = HBShared.formatLiveLabel(data.hours, live, 'short');
  }

  function hideEmptySections(data) {
    var map = [
      ['#hakkimizda', 'about', data.about && data.about.paragraphs],
      ['#galeri', 'gallery', data.gallery],
      ['#menu', 'menu', true],
      ['#yorumlar', 'testimonials', data.testimonials],
      ['#sss', 'faq', data.faq],
      ['#harita', 'map', data.brand && data.brand.googleMaps && data.brand.googleMaps.lat != null]
    ];
    map.forEach(function (row) {
      var el = document.querySelector(row[0]);
      if (!el) return;
      var on = row[1] === 'menu' ? HBShared.sectionOn(data, 'menu') : HBShared.gorunur(data, row[1], row[2]);
      if (on) el.removeAttribute('hidden');
      else el.setAttribute('hidden', '');
    });
  }

  var ORNEK_FOTO = {
    meyve: { url: 'images/ornek/meyve.webp', alt: 'Örnek fotoğraf: organik meyve', focalX: 50, focalY: 50 },
    sebze: { url: 'images/ornek/sebze.webp', alt: 'Örnek fotoğraf: organik sebze', focalX: 50, focalY: 48 },
    sarkuteri: { url: 'images/ornek/sarkuteri.webp', alt: 'Örnek fotoğraf: şarküteri', focalX: 50, focalY: 52 },
    vegan: { url: 'images/ornek/vegan.webp', alt: 'Örnek fotoğraf: vegan ürünler', focalX: 50, focalY: 50 },
    glutensiz: { url: 'images/ornek/glutensiz.webp', alt: 'Örnek fotoğraf: glutensiz ürünler', focalX: 50, focalY: 50 }
  };

  function photoForItem(item) {
    if (item && item.id && ORNEK_FOTO[item.id]) return ORNEK_FOTO[item.id];
    var t = turkishFold((item && item.title) || '');
    if (t.indexOf('meyve') !== -1) return ORNEK_FOTO.meyve;
    if (t.indexOf('sebze') !== -1) return ORNEK_FOTO.sebze;
    if (t.indexOf('sarkuteri') !== -1) return ORNEK_FOTO.sarkuteri;
    if (t.indexOf('vegan') !== -1) return ORNEK_FOTO.vegan;
    if (t.indexOf('gluten') !== -1) return ORNEK_FOTO.glutensiz;
    return ORNEK_FOTO.meyve;
  }

  function turkishFold(str) {
    return String(str || '').toLocaleLowerCase('tr')
      .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
      .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c');
  }

  function renderReyon(data) {
    var esc = HBShared.esc;
    var contact = HBShared.contactVocabulary(data.brand);
    var cards = [];
    (data.menuCategories || []).forEach(function (cat) {
      (cat.items || []).forEach(function (item) {
        var img = photoForItem(item);
        var kw = turkishFold((item.title || '') + ' ' + (item.desc || '') + ' ' + (cat.title || ''));
        var pos = HBShared.focal(img, 50, 50);
        cards.push(
          '<article class="mk-reyon-card" data-category="' + esc(cat.key) + '" data-keywords="' + esc(kw) + '">' +
            '<div class="mk-reyon-photo">' +
              '<img src="' + esc(img.url) + '" alt="' + esc(img.alt || item.title) + '" loading="lazy" decoding="async" style="object-position: ' + pos + ';">' +
              '<span class="mk-reyon-tag">' + esc(cat.title) + '</span>' +
              '<span class="mk-reyon-sample">Örnek fotoğraf</span>' +
            '</div>' +
            '<div class="mk-reyon-body">' +
              '<h3>' + esc(item.title) + '</h3>' +
              (item.desc ? '<p>' + esc(item.desc) + '</p>' : '') +
              '<a href="' + esc(contact.href) + '"' + (contact.channel === 'whatsapp' ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' +
                esc(contact.ctaShort) + ' — dükkânda sorun' +
              '</a>' +
            '</div>' +
          '</article>'
        );
      });
    });
    return cards.join('\n');
  }

  function renderChips(data) {
    var esc = HBShared.esc;
    var chips = ['<button type="button" class="mk-chip is-active" data-category="all" aria-pressed="true">Tümü</button>'];
    (data.menuCategories || []).forEach(function (cat) {
      chips.push(
        '<button type="button" class="mk-chip" data-category="' + esc(cat.key) + '" aria-pressed="false">' +
          esc(cat.title) +
        '</button>'
      );
    });
    return chips.join('');
  }

  function bindReyonFilters() {
    var chips = $all('.mk-chip');
    var cards = $all('.mk-reyon-card');
    var empty = document.getElementById('menuNoResults');
    function apply(cat) {
      var visible = 0;
      cards.forEach(function (card) {
        var on = cat === 'all' || card.getAttribute('data-category') === cat;
        card.classList.toggle('is-hidden', !on);
        if (on) visible += 1;
      });
      if (empty) empty.style.display = visible ? 'none' : 'block';
    }
    chips.forEach(function (btn) {
      btn.addEventListener('click', function () {
        chips.forEach(function (c) {
          c.classList.remove('is-active');
          c.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');
        apply(btn.getAttribute('data-category'));
      });
    });
  }

  function hydrate(data) {
    var aboutWrap = document.querySelector('#hakkimizda .about-paragraphs');
    if (aboutWrap) aboutWrap.innerHTML = HBShared.templates.aboutParagraphs(data);
    setHtml('#menuFilterTabs', renderChips(data));
    setHtml('#menuCategoriesWrap', renderReyon(data));
    setHtml('.testimonials-grid', HBShared.templates.testimonials(data));
    var reviewSlot = document.getElementById('reviewCtaSlot');
    if (reviewSlot) {
      var wrap = document.createElement('div');
      wrap.innerHTML = HBShared.templates.reviewCta(data);
      var next = wrap.firstElementChild;
      if (next) reviewSlot.replaceWith(next);
    }
    setHtml('.faq-list', HBShared.templates.faq(data));
    setHtml('#contactItems', HBShared.templates.contactItems(data));
    setHtml('.hours-table tbody', HBShared.templates.hoursRows(data));
    renderLiveStatus(data);
    bindReyonFilters();
  }

  function initMobileNav() {
    var toggle = document.getElementById('mobileMenuToggle');
    var drawer = document.getElementById('mobileDrawer');
    if (!toggle || !drawer) return;
    function setOpen(open) {
      drawer.classList.toggle('is-open', open);
      drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Menüyü kapat' : 'Menüyü aç');
      document.body.classList.toggle('nav-open', open);
    }
    toggle.addEventListener('click', function () {
      setOpen(!drawer.classList.contains('is-open'));
    });
    drawer.addEventListener('click', function (e) {
      if (e.target === drawer || e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.classList.contains('is-open')) setOpen(false);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth >= 1100 && drawer.classList.contains('is-open')) setOpen(false);
    });
  }

  async function boot() {
    initMobileNav();
    try {
      var data = await HBSiteData.loadPublished();
      state.data = data;
      applyTheme(data.theme);
      hideEmptySections(data);
      hydrate(data);
    } catch (err) {
      bindReyonFilters();
      console.warn('site-data.json canlı olarak yenilenemedi, statik içerik gösteriliyor.', err);
    }
    setInterval(function () {
      if (state.data) renderLiveStatus(state.data);
    }, 60 * 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
