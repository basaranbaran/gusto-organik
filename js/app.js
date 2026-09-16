/**
 * Gusto Organik — Genel Site Betiği
 *
 * • Yayınlanan veriyi getirip dinamik bölgeleri tazeler (statik HTML zaten
 *   SEO için sunucu tarafında dolu gelir; bu adım "hydration" ile tutarlılığı garantiler).
 * • Açık/Kapalı rozetini her dakika yeniden hesaplar.
 * • Menü arama & kategori filtreleme.
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

  /* ---------- Canlı durum rozeti ---------- */
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

  function hideEmptySections(data) {
    var map = [
      ['#ozellikler', 'features', data.features],
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

  /* ---------- Bölge hidrasyonu ---------- */
  function hydrate(data) {
    setHtml('.features-grid', HBShared.templates.features(data));
    var aboutParaWrap = document.querySelectorAll('#hakkimizda .about-paragraph');
    if (aboutParaWrap.length) {
      var parent = aboutParaWrap[0].parentElement;
      parent.innerHTML = HBShared.templates.aboutParagraphs(data);
    }
    setHtml('.gallery-grid', HBShared.templates.gallery(data));
    var menuLead = document.querySelector('#menu .section-lead');
    if (menuLead && data.sections && data.sections.menu) {
      menuLead.textContent = data.sections.menu.lead || '';
    }
    setHtml('#menuFilterTabs', HBShared.templates.menuFilters(data));
    setHtml('#menuCategoriesWrap', HBShared.templates.menuCategories(data));
    setHtml('#menuNoticeSlot', HBShared.templates.menuNotice(data));
    setHtml('.testimonials-grid', HBShared.templates.testimonials(data));
    var reviewSlot = document.getElementById('reviewCtaSlot');
    if (reviewSlot) {
      var wrap = document.createElement('div');
      wrap.innerHTML = HBShared.templates.reviewCta(data);
      var next = wrap.firstElementChild;
      if (next) reviewSlot.replaceWith(next);
    }
    setHtml('.faq-list', HBShared.templates.faq(data));
    setHtml('#iletisim .contact-card > div:nth-of-type(1)', HBShared.templates.contactItems(data));
    setHtml('.hours-table tbody', HBShared.templates.hoursRows(data));

    renderLiveStatus(data);
    bindMenuFilters();
    bindMenuSearch();
  }

  /* ---------- Menü kategori filtreleri ---------- */
  function bindMenuFilters() {
    var tabs = $all('.filter-tab-btn');
    var blocks = $all('.menu-category-block');
    tabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        tabs.forEach(function (b) {
          b.classList.remove('active', 'is-active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active', 'is-active');
        btn.setAttribute('aria-selected', 'true');
        var cat = btn.getAttribute('data-category');
        blocks.forEach(function (block) {
          block.classList.toggle('is-hidden', cat !== 'all' && block.getAttribute('data-category') !== cat);
        });
        var input = document.getElementById('menuSearchInput');
        if (input) { input.value = ''; }
        updateNoResultsState();
      });
    });
  }

  function turkishFold(str) {
    return String(str || '').toLocaleLowerCase('tr')
      .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
      .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c');
  }

  function updateNoResultsState() {
    var visibleItems = $all('.menu-item-card').filter(function (c) { return !c.classList.contains('is-hidden'); });
    var noResults = document.getElementById('menuNoResults');
    if (noResults) noResults.style.display = visibleItems.length ? 'none' : 'block';
  }

  function bindMenuSearch() {
    var input = document.getElementById('menuSearchInput');
    if (!input) return;
    input.addEventListener('input', function () {
      var q = turkishFold(input.value.trim());
      var cards = $all('.menu-item-card');
      if (!q) {
        cards.forEach(function (c) { c.classList.remove('is-hidden'); });
        $all('.menu-category-block').forEach(function (block) {
          var activeTab = $('.filter-tab-btn.active');
          var cat = activeTab ? activeTab.getAttribute('data-category') : 'all';
          block.classList.toggle('is-hidden', cat !== 'all' && block.getAttribute('data-category') !== cat);
        });
        updateNoResultsState();
        return;
      }
      // Arama yaparken kategori filtresini görmezden gel, tüm kategorileri göster
      $all('.menu-category-block').forEach(function (block) { block.classList.remove('is-hidden'); });
      cards.forEach(function (card) {
        var kw = card.getAttribute('data-keywords') || '';
        card.classList.toggle('is-hidden', kw.indexOf(q) === -1);
      });
      $all('.menu-category-block').forEach(function (block) {
        var visible = $all('.menu-item-card', block).some(function (c) { return !c.classList.contains('is-hidden'); });
        block.classList.toggle('is-hidden', !visible);
      });
      updateNoResultsState();
    });
  }

  /* ---------- Mobil çekmece ---------- */
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

  /* ---------- Scroll reveal ---------- */
  function initReveal() {
    $all('.reveal, .reveal-stagger').forEach(function (el) {
      el.classList.add('is-visible');
    });
  }

  /* ---------- Başlat ---------- */
  async function boot() {
    initReveal();
    initMobileNav();
    try {
      var data = await HBSiteData.loadPublished();
      state.data = data;
      applyTheme(data.theme);
      hideEmptySections(data);
      hydrate(data);
    } catch (err) {
      // Sunucu tarafında üretilen statik HTML zaten doğru içeriği taşıyor;
      // fetch başarısız olsa da (örn. file:// önizlemesi) kullanıcı boş sayfa görmez.
      bindMenuFilters();
      bindMenuSearch();
      console.warn('site-data.json canlı olarak yenilenemedi, statik içerik gösteriliyor.', err);
    }
    // Açık/Kapalı rozetini her dakika tazele
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
