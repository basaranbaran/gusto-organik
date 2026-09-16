/**
 * Gusto Organik — Paylaşılan İkon Seti & HTML Şablonları
 *
 * Bu dosya hem tarayıcıda (window.HBShared) hem de Node tarafında
 * (tools/build.mjs → statik HTML üretimi) aynı çıktıyı üretir.
 * Böylece statik HTML ile data/site-data.json arasında fark oluşmaz (KURAL 6).
 *
 * Şablonlar "göreli" girinti kullanır; nihai girintiyi build script'i ayarlar.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HBShared = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ========================================================================
     Yardımcılar
     ======================================================================== */
  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function lines(arr) {
    return arr.filter(function (l) { return l !== null && l !== undefined && l !== false; }).join('\n');
  }

  // object-position değerini güvenli hale getirir
  function focal(image, defX, defY) {
    var x = image && isFinite(image.focalX) ? Number(image.focalX) : (defX === undefined ? 50 : defX);
    var y = image && isFinite(image.focalY) ? Number(image.focalY) : (defY === undefined ? 50 : defY);
    return Math.max(0, Math.min(100, x)) + '% ' + Math.max(0, Math.min(100, y)) + '%';
  }

  /* ========================================================================
     Telefon / İletişim sözlüğü — KURAL 2 (tek kaynaklı iletişim metni)
     ======================================================================== */
  function normalizePhone(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.indexOf('90') === 0 && d.length > 10) return d;
    if (d.charAt(0) === '0') return '90' + d.slice(1);
    if (d.length === 10) return '90' + d;
    return d;
  }

  // brand.phoneType: 'landline' | 'mobile' | 'both'
  // Sabit hatlı işletmelerde WhatsApp asla önerilmez; tüm metinler buradan gelir.
  // Metinler sektöre özel değil: kafe / restoran / spor salonu / market aynı sözlükten beslenir.
  // İşletmeye özel açılış cümlesi yalnızca brand.orderIntroText içindedir.
  function contactVocabulary(brand) {
    brand = brand || {};
    var waClean = brand.hasWhatsapp && brand.phoneType !== 'landline' ? normalizePhone(brand.whatsappPhone) : '';
    var isWa = Boolean(waClean) && waClean.length > 10 && waClean.indexOf('905') === 0;
    var phoneClean = normalizePhone(brand.phone);
    var intro = brand.orderIntroText || 'Merhaba, bilgi almak istiyorum.';

    if (isWa) {
      return {
        channel: 'whatsapp',
        href: 'https://wa.me/' + waClean + '?text=' + encodeURIComponent(intro),
        telHref: 'tel:+' + phoneClean,
        ctaShort: 'WhatsApp ile Yaz',
        ctaLong: 'Mesajınızı yazın; tek tıkla WhatsApp üzerinden gönderin',
        noun: 'WhatsApp',
        verb: 'yazın',
        icon: 'whatsapp',
        phoneClean: phoneClean,
        waClean: waClean
      };
    }
    return {
      channel: 'phone',
      href: 'tel:+' + phoneClean,
      telHref: 'tel:+' + phoneClean,
      ctaShort: 'Hemen Ara',
      ctaLong: 'Bilgi veya rezervasyon için bizi arayın',
      noun: 'telefon',
      verb: 'arayın',
      icon: 'phone',
      phoneClean: phoneClean,
      waClean: ''
    };
  }

  // FAQ ve diğer metinlerdeki {{contact.noun}} / {{brand.phone}} yer tutucularını doldurur
  function fillPlaceholders(text, brand) {
    var contact = contactVocabulary(brand);
    brand = brand || {};
    return String(text || '')
      .replace(/\{\{\s*contact\.(\w+)\s*\}\}/g, function (_, key) {
        return contact[key] !== undefined ? contact[key] : '';
      })
      .replace(/\{\{\s*brand\.(\w+)\s*\}\}/g, function (_, key) {
        return brand[key] !== undefined ? String(brand[key]) : '';
      });
  }

  /* ========================================================================
     İkon seti (tek kaynak)
     ======================================================================== */
  var ICON_PATHS = {
    flame: '<path d="M12 22c-4.4 0-7.5-3.2-7.5-7.4 0-3.6 2-5.7 3-8.1.5 1.6 1.6 2.6 2.6 2 .5-3 .5-5.5 2-7 3 2 6 6.4 6 10.6 0 4.6-3.2 9.9-6.1 9.9z"></path><path d="M12 22c1.8 0 3.2-1.6 3.2-3.6 0-1.7-1-2.8-1.7-3.8-.4.9-.9 1.3-1.5 1-.2-1.4-.2-2.6.4-3.4 1.4 1 2.6 3 2.6 5 0 2.4-1.4 4.8-3 4.8z"></path>',
    leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"></path><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"></path>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
    truck: '<rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle>',
    star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>',
    clock: '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
    check: '<polyline points="20 6 9 17 4 12"></polyline>',
    chevron: '<polyline points="6 9 12 15 18 9"></polyline>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>',
    whatsapp: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>',
    instagram: '<rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>',
    mappin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>',
    search: '<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
    trash: '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>',
    heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>'
  };

  var ICON_LABELS = {
    flame: 'Alev', leaf: 'Yaprak / Taze', users: 'Aile / Grup', truck: 'Sipariş',
    star: 'Yıldız', clock: 'Saat', check: 'Onay', chevron: 'Ok', phone: 'Telefon',
    whatsapp: 'WhatsApp', instagram: 'Instagram', mappin: 'Konum', search: 'Arama',
    trash: 'Sil', edit: 'Düzenle', heart: 'Kalp'
  };

  function icon(name, size, strokeWidth) {
    var body = ICON_PATHS[name] || ICON_PATHS.star;
    var s = size || 20;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' +
      (strokeWidth || 2) + '" aria-hidden="true">' + body + '</svg>';
  }

  function starIcon(size) {
    var s = size || 14;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="#EAB308" stroke="#EAB308" stroke-width="1" aria-hidden="true">' +
      ICON_PATHS.star + '</svg>';
  }

  function dolu(v) {
    if (Array.isArray(v)) return v.length > 0;
    return Boolean(v && String(v).trim());
  }

  function sectionOn(data, key) {
    var s = data && data.sections && data.sections[key];
    if (s === false) return false;
    if (s && typeof s === 'object' && s.visible === false) return false;
    return true;
  }

  function gorunur(data, key, veri) {
    return sectionOn(data, key) && dolu(veri);
  }

  function fillTemplate(tpl, vars) {
    return String(tpl || '').replace(/\{(\w+)\}/g, function (_, k) {
      return vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : '';
    });
  }

  /* ========================================================================
     Çalışma saati motoru — KURAL 7 (gece yarısını aşan kapanış desteği)
     ======================================================================== */
  var DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var DAY_SCHEMA = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

  function toMin(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m) return 0;
    return (Number(m[1]) % 24) * 60 + Number(m[2]);
  }

  function orderedDays(hours) {
    var days = (hours && hours.days) || [];
    var byKey = {};
    days.forEach(function (d) { if (d && d.key) byKey[d.key] = d; });
    return DAY_ORDER.map(function (k) {
      return byKey[k] || { key: k, label: k, closed: true, ranges: [] };
    });
  }

  // Bir günün belirli aralıklarından, o dakika içinde açık olup olmadığını hesaplar.
  function isDayOpenAt(day, nowMin) {
    if (!day || day.closed || !day.ranges || !day.ranges.length) return false;
    return day.ranges.some(function (r) {
      var o = toMin(r.open), c = toMin(r.close);
      if (o === c) return true; // 24 saat açık
      return c > o ? (nowMin >= o && nowMin < c) : (nowMin >= o || nowMin < c);
    });
  }

  // Aynı saatlere sahip ardışık günleri tek satırda birleştirir (hafta döngüsel)
  function groupHours(hours) {
    var days = orderedDays(hours);
    function sig(d) {
      if (d.closed || !d.ranges || !d.ranges.length) return 'closed';
      return d.ranges.map(function (r) { return r.open + '-' + r.close; }).join(',');
    }
    var groups = [];
    days.forEach(function (day) {
      var s = sig(day);
      var last = groups[groups.length - 1];
      if (last && last.sig === s) last.days.push(day);
      else groups.push({ sig: s, closed: !!day.closed, ranges: day.ranges || [], days: [day] });
    });
    if (groups.length > 2) {
      var first = groups[0];
      var last2 = groups[groups.length - 1];
      if (first.sig === last2.sig) {
        last2.days = last2.days.concat(first.days);
        groups.shift();
      }
    }
    return groups.map(function (g) {
      var label = g.days.length === 1
        ? g.days[0].label
        : g.days[0].label + ' — ' + g.days[g.days.length - 1].label;
      return { label: label, closed: g.closed, ranges: g.ranges, days: g.days };
    }).sort(function (a, b) { return (a.closed ? 1 : 0) - (b.closed ? 1 : 0); });
  }

  function rangeLabel(ranges) {
    if (!ranges || !ranges.length) return '';
    return ranges.map(function (r) {
      if (r.open === r.close) return '24 saat açık';
      return (r.close === '00:00' ? r.open + ' — Gece Yarısı' : r.open + ' — ' + r.close);
    }).join(' & ');
  }

  function findSpecialDay(hours, dateStr) {
    return ((hours && hours.specialDays) || []).filter(function (s) { return s.date === dateStr; })[0] || null;
  }

  // Belirli bir Europe/Istanbul anı için canlı durumu hesaplar.
  function getLiveStatus(hours, now) {
    now = now || new Date();
    var istanbul = new Date(now.toLocaleString('en-US', { timeZone: (hours && hours.timezone) || 'Europe/Istanbul' }));
    var jsDay = istanbul.getDay(); // 0=Sun..6=Sat
    var keyOf = function (n) { return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][n]; };
    var nowMin = istanbul.getHours() * 60 + istanbul.getMinutes();
    var dateStr = istanbul.toISOString().slice(0, 10);

    var days = orderedDays(hours);
    var byKey = {}; days.forEach(function (d) { byKey[d.key] = d; });

    var special = findSpecialDay(hours, dateStr);
    var todayKey = keyOf(jsDay);
    var today = special && special.closed ? { key: todayKey, label: byKey[todayKey].label, closed: true, ranges: [] } : byKey[todayKey];

    var openNow = !special && isDayOpenAt(today, nowMin);
    // Gece yarısını aşan diliminde miyiz (dünkü aralık bu sabaha taşıyor mu)?
    if (!openNow && !special) {
      var yestKey = keyOf((jsDay + 6) % 7);
      var yesterday = byKey[yestKey];
      if (yesterday && !yesterday.closed) {
        var crosses = (yesterday.ranges || []).some(function (r) {
          var o = toMin(r.open), c = toMin(r.close);
          return c <= o && nowMin < c;
        });
        if (crosses) openNow = true;
      }
    }

    return { openNow: openNow, today: today, nowMin: nowMin, istanbul: istanbul };
  }

  function nextOpenInfo(hours, live) {
    var days = orderedDays(hours);
    var idx = DAY_ORDER.indexOf(live.today && live.today.key);
    if (idx < 0) idx = 0;
    for (var i = 0; i < 7; i++) {
      var d = days[(idx + i) % 7];
      if (!d || d.closed || !d.ranges || !d.ranges.length) continue;
      if (i === 0) {
        var later = d.ranges.filter(function (r) { return toMin(r.open) > live.nowMin; });
        if (later.length) return { open: later[0].open, nextDayLabel: 'bugün', close: later[0].close };
        continue;
      }
      return {
        open: d.ranges[0].open,
        close: d.ranges[0].close,
        nextDayLabel: i === 1 ? 'yarın' : d.label
      };
    }
    return { open: '', close: '', nextDayLabel: '' };
  }

  function formatLiveLabel(hours, live, mode) {
    hours = hours || {};
    var shortOpen = 'Açık';
    var shortClosed = 'Kapalı';
    if (mode === 'short') return live.openNow ? shortOpen : shortClosed;
    if (live.openNow) {
      var last = live.today && live.today.ranges && live.today.ranges[live.today.ranges.length - 1];
      if (last && last.open === last.close) {
        return hours.openTemplate || 'Şu an Açık — 24 saat';
      }
      var close = last ? last.close : '';
      return fillTemplate(hours.openTemplate || 'Şu an Açık ({close}\'e kadar)', { close: close });
    }
    var nxt = nextOpenInfo(hours, live);
    var tpl = (live.today && live.today.closed) ? (hours.closedTodayTemplate || hours.closedTemplate) : hours.closedTemplate;
    return fillTemplate(tpl || 'Şu an Kapalı — {nextDayLabel} {open} açılıyor', nxt);
  }

  /* ========================================================================
     Şablonlar
     ======================================================================== */
  var T = {};

  T.heroTrust = function (data) {
    return ((data.hero && data.hero.trustStats) || []).map(function (s) {
      var inner = [
        '  <span class="trust-stat-num font-display">' + esc(s.num) + '</span>',
        '  <span class="trust-stat-label">' + esc(s.label) + '</span>'
      ].join('\n');
      var href = String(s.href || '').trim();
      var isSafe = href && (/^https:\/\//i.test(href) || href.charAt(0) === '#');
      if (isSafe) {
        return lines([
          '<a class="trust-stat-card surface-glass trust-stat-link" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">',
          inner,
          '</a>'
        ]);
      }
      return lines([
        '<div class="trust-stat-card surface-glass">',
        inner,
        '</div>'
      ]);
    }).join('\n');
  };

  T.features = function (data) {
    return (data.features || []).map(function (f) {
      return lines([
        '<div class="feature-card surface-glass">',
        '  <div class="feature-icon-wrapper">' + icon(f.icon, 24) + '</div>',
        '  <h3 class="feature-card-title">' + esc(f.title) + '</h3>',
        '  <p class="feature-card-desc">' + esc(f.description) + '</p>',
        '</div>'
      ]);
    }).join('\n\n');
  };

  T.aboutParagraphs = function (data) {
    return ((data.about && data.about.paragraphs) || []).map(function (p) {
      return '<p class="about-paragraph">' + esc(p) + '</p>';
    }).join('\n');
  };

  T.gallery = function (data) {
    return (data.gallery || []).map(function (g) {
      return lines([
        '<figure class="gallery-card surface-glass">',
        '  <img class="gallery-img" src="' + esc(g.url) + '" alt="' + esc(g.alt || g.title || '') + '" loading="lazy" decoding="async" width="' + esc(g.width || 480) + '" height="' + esc(g.height || 600) + '" style="object-position: ' + focal(g, 50, 50) + ';">',
        '  <figcaption class="gallery-caption">',
        '    <h4 class="gallery-item-title">' + esc(g.title) + '</h4>',
        '    <p class="gallery-item-desc">' + esc(g.desc) + '</p>',
        '  </figcaption>',
        '</figure>'
      ]);
    }).join('\n\n');
  };

  T.menuFilters = function (data) {
    var out = ['<button type="button" class="filter-tab-btn menu-tab-btn is-active active" data-category="all" role="tab" aria-selected="true">Tümü</button>'];
    (data.menuCategories || []).forEach(function (c) {
      out.push('<button type="button" class="filter-tab-btn menu-tab-btn" data-category="' + esc(c.key) + '" role="tab" aria-selected="false">' +
        icon(c.icon || 'star', 14) + ' ' + esc(c.title) + '</button>');
    });
    return lines(out);
  };

  T.menuCategories = function (data) {
    var contact = contactVocabulary(data.brand);
    return (data.menuCategories || []).map(function (cat) {
      var items = (cat.items || []).map(function (item) {
        var keywords = (item.title + ' ' + (item.desc || '')).toLocaleLowerCase('tr')
          .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c');
        var popular = item.isPopular
          ? '<span class="popular-badge">' + icon('star', 12) + ' Popüler</span>'
          : '';
        var extraAttrs = contact.channel === 'whatsapp' ? ' target="_blank" rel="noopener noreferrer"' : '';
        var action = contact.href
          ? '<a href="' + esc(contact.href) + '" class="menu-item-action-btn"' + extraAttrs + '>' + icon(contact.icon, 14) + ' <span>' + esc(contact.ctaShort) + '</span></a>'
          : '';
        var pendingPrice = contact.channel === 'whatsapp' ? 'Fiyat için yazın' : 'Fiyat için arayın';
        var priceText = item.price || (data.menuStatus === 'pending' ? pendingPrice : '');
        return lines([
          '        <div class="menu-item-card surface-glass" data-keywords="' + esc(keywords) + '">',
          '          <div class="menu-item-header">',
          '            <div class="menu-item-title-group">',
          '              <h4 class="menu-item-title">' + esc(item.title) + '</h4>',
          popular ? '              ' + popular : false,
          '            </div>',
          '            <span class="menu-item-price font-display">' + esc(priceText) + '</span>',
          '          </div>',
          item.desc ? '          <p class="menu-item-desc">' + esc(item.desc) + '</p>' : false,
          '          <div class="menu-item-footer">',
          '            <span class="menu-item-cat-label">' + esc(cat.title) + '</span>',
          action ? '            ' + action : false,
          '          </div>',
          '        </div>'
        ]);
      });
      return lines([
        '<div class="menu-category-block" data-category="' + esc(cat.key) + '" id="menu-' + esc(cat.key) + '">',
        '  <div class="menu-category-heading">',
        '    <span class="menu-cat-icon">' + icon(cat.icon || 'star', 20) + '</span>',
        '    <h3>' + esc(cat.title) + '</h3>',
        '    <span class="menu-cat-count">' + ((cat.items || []).length) + ' ürün</span>',
        '  </div>',
        '  <div class="menu-items-grid">',
        items.length ? lines(items) : '        <p class="empty-state">Bu kategoride henüz ürün yok.</p>',
        '  </div>',
        '</div>'
      ]);
    }).join('\n\n');
  };

  T.menuNotice = function (data) {
    var contact = contactVocabulary(data.brand);
    var verb = contact.verb || 'arayın';
    if (data.menuStatus === 'pending') {
      return '<p class="menu-pending-banner surface-glass">Fiyatlar panelden girilene kadar “Fiyat için ' + esc(verb) + '” olarak görünür. Sipariş için iletişim butonunu kullanın.</p>';
    }
    if (data.menuStatus === 'estimated') {
      return '<p class="menu-pending-banner surface-glass">Fiyatlar örnektir; güncel fiyat için bizi ' + esc(verb) + '. Yönetim panelinden dilediğiniz zaman güncelleyebilirsiniz.</p>';
    }
    return '';
  };

  T.testimonials = function (data) {
    return (data.testimonials || []).map(function (t) {
      var count = Math.max(1, Math.min(5, Number(t.stars) || 5));
      var stars = '';
      for (var i = 0; i < count; i++) stars += starIcon(14);
      return lines([
        '<div class="testimonial-card surface-glass">',
        '  <div>',
        '    <div class="rating-stars" aria-label="' + count + ' yıldız">' + stars + '</div>',
        '    <p class="testimonial-quote">“' + esc(t.quote) + '”</p>',
        '  </div>',
        '  <div class="testimonial-author">',
        '    <div class="author-avatar">' + esc((t.author || '?').charAt(0)) + '</div>',
        '    <div class="author-meta">',
        '      <span class="author-name">' + esc(t.author) + '</span>',
        '      <span class="author-service">' + esc(t.badge || t.source || '') + '</span>',
        '    </div>',
        '  </div>',
        '</div>'
      ]);
    }).join('\n\n');
  };

  T.reviewCta = function (data) {
    var gm = (data.brand && data.brand.googleMaps) || {};
    var reviewHref = gm.reviewUrl || gm.placeUrl || '';
    if (!reviewHref) {
      return '<div class="review-cta-wrap" id="reviewCtaSlot" hidden></div>';
    }
    return lines([
      '<div class="review-cta-wrap" id="reviewCtaSlot">',
      '  <a class="btn btn-secondary surface-glass review-cta" href="' + esc(reviewHref) + '" target="_blank" rel="noopener noreferrer">',
      '    Google\'da Yorum Yaz',
      '  </a>',
      '</div>'
    ]);
  };

  T.faq = function (data) {
    var brand = data.brand || {};
    return (data.faq || []).map(function (f, idx) {
      return lines([
        '<details class="faq-item surface-glass"' + (idx === 0 ? ' open' : '') + '>',
        '  <summary class="faq-question">',
        '    <span>' + esc(fillPlaceholders(f.question, brand)) + '</span>',
        '    <svg class="faq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">' + ICON_PATHS.chevron + '</svg>',
        '  </summary>',
        '  <div class="faq-answer">',
        '    <p>' + esc(fillPlaceholders(f.answer, brand)) + '</p>',
        '  </div>',
        '</details>'
      ]);
    }).join('\n\n');
  };

  T.hoursRows = function (data) {
    var hours = data.hours || {};
    return groupHours(hours).map(function (g) {
      if (g.closed) {
        return lines([
          '<tr>',
          '  <td class="day">' + esc(g.label) + '</td>',
          '  <td class="time" style="color: var(--accent-deep); font-weight: 600;">Kapalı</td>',
          '</tr>'
        ]);
      }
      return lines([
        '<tr>',
        '  <td class="day">' + esc(g.label) + '</td>',
        '  <td class="time">' + esc(rangeLabel(g.ranges)) + '</td>',
        '</tr>'
      ]);
    }).join('\n');
  };

  T.contactItems = function (data) {
    var brand = data.brand || {};
    var contact = contactVocabulary(brand);
    var rows = [
      {
        path: ICON_PATHS.phone, title: 'Telefon',
        value: '<a href="' + esc(contact.telHref) + '">' + esc(brand.phone) + '</a>'
      },
      {
        path: ICON_PATHS.mappin, title: 'Adres',
        value: esc(brand.address) + (brand.addressDistrict ? ', ' + esc(brand.addressDistrict) : '')
      }
    ];
    if (contact.channel === 'whatsapp') {
      rows.splice(1, 0, {
        path: ICON_PATHS.whatsapp, boxStyle: ' style="background: rgba(34, 197, 94, 0.12); color: #16a34a;"', title: contact.noun,
        value: '<a href="' + esc(contact.href) + '" target="_blank" rel="noopener noreferrer">' + esc(brand.whatsappPhone) + '</a>'
      });
    }
    if (brand.instagramHandle && brand.instagramUrl) {
      rows.push({
        path: ICON_PATHS.instagram, boxStyle: ' style="background: rgba(225, 48, 108, 0.12); color: #E1306C;"', title: 'Instagram',
        value: '<a href="' + esc(brand.instagramUrl) + '" target="_blank" rel="noopener noreferrer">@' + esc(brand.instagramHandle) + '</a>'
      });
    }
    (brand.platforms || []).forEach(function (p) {
      if (!p || !p.url) return;
      rows.push({
        path: ICON_PATHS.truck, title: p.label || p.key,
        value: '<a href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer">' + esc(p.label || p.key) + '</a>'
      });
    });
    return rows.map(function (r) {
      return lines([
        '<div class="contact-item-row">',
        '  <div class="contact-icon-box"' + (r.boxStyle || '') + '>',
        '    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' + r.path + '</svg>',
        '  </div>',
        '  <div class="contact-item-details">',
        '    <span class="contact-item-title">' + esc(r.title) + '</span>',
        '    <span class="contact-item-value">' + r.value + '</span>',
        '  </div>',
        '</div>'
      ]);
    }).join('\n\n');
  };

  /* ---------- JSON-LD ---------- */
  T.jsonLd = function (data) {
    var brand = data.brand || {};
    var seo = data.seo || {};
    var site = String(seo.siteUrl || '').replace(/\/$/, '');
    var contact = contactVocabulary(brand);
    var openGroups = groupHours(data.hours).filter(function (g) { return !g.closed; });
    var heroUrl = (data.hero && data.hero.mainImage && data.hero.mainImage.url) || 'images/hero-kapak.webp';

    var openingHours = [];
    openGroups.forEach(function (g) {
      (g.ranges || []).forEach(function (r) {
        openingHours.push({
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: g.days.map(function (d) { return DAY_SCHEMA[d.key]; }),
          opens: r.open,
          closes: r.close === '00:00' ? '23:59' : r.close
        });
      });
    });

    var sameAs = [brand.instagramUrl, brand.websiteUrl, brand.googleMaps && brand.googleMaps.placeUrl]
      .concat((brand.platforms || []).map(function (p) { return p.url; }))
      .filter(Boolean);

    var bakery = {
      '@type': ['GroceryStore'],
      '@id': site + '/#store',
      name: brand.legalName || brand.name,
      alternateName: [brand.instagramHandle, brand.name].filter(Boolean),
      description: (seo.home && seo.home.description) || '',
      image: [site + '/' + heroUrl],
      telephone: '+' + contact.phoneClean,
      url: site,
      priceRange: '₺',
      currenciesAccepted: 'TRY',
      paymentAccepted: 'Cash, Credit Card',
      address: {
        '@type': 'PostalAddress',
        streetAddress: brand.address,
        addressLocality: (brand.addressDistrict || '').split('/')[0].trim() || 'Sarıyer',
        addressRegion: 'İstanbul',
        postalCode: brand.postalCode || '',
        addressCountry: 'TR'
      },
      geo: { '@type': 'GeoCoordinates', latitude: brand.googleMaps && brand.googleMaps.lat, longitude: brand.googleMaps && brand.googleMaps.lng },
      hasMap: brand.googleMaps && brand.googleMaps.placeUrl,
      sameAs: sameAs,
      areaServed: (seo.areaServed || []).map(function (name) { return { '@type': 'Place', name: name }; }),
      knowsAbout: seo.knowsAbout || [],
      openingHoursSpecification: openingHours
    };

    if (gorunur(data, 'testimonials', data.testimonials) && seo.aggregateRating) {
      bakery.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: seo.aggregateRating.ratingValue,
        reviewCount: seo.aggregateRating.reviewCount,
        bestRating: seo.aggregateRating.bestRating || '5',
        worstRating: seo.aggregateRating.worstRating || '1'
      };
      bakery.review = (data.testimonials || []).map(function (t) {
        return {
          '@type': 'Review',
          author: { '@type': 'Person', name: t.author },
          reviewRating: { '@type': 'Rating', ratingValue: String(t.stars || 5), bestRating: '5' },
          reviewBody: t.quote
        };
      });
    }

    var graph = [bakery];
    if (gorunur(data, 'faq', data.faq)) {
      graph.push({
        '@type': 'FAQPage',
        '@id': site + '/#faq',
        mainEntity: (data.faq || []).map(function (f) {
          return {
            '@type': 'Question',
            name: fillPlaceholders(f.question, brand),
            acceptedAnswer: { '@type': 'Answer', text: fillPlaceholders(f.answer, brand) }
          };
        })
      });
    }

    return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
  };

  return {
    esc: esc,
    focal: focal,
    icon: icon,
    starIcon: starIcon,
    ICON_PATHS: ICON_PATHS,
    ICON_LABELS: ICON_LABELS,
    normalizePhone: normalizePhone,
    contactVocabulary: contactVocabulary,
    fillPlaceholders: fillPlaceholders,
    toMin: toMin,
    orderedDays: orderedDays,
    groupHours: groupHours,
    rangeLabel: rangeLabel,
    isDayOpenAt: isDayOpenAt,
    getLiveStatus: getLiveStatus,
    formatLiveLabel: formatLiveLabel,
    nextOpenInfo: nextOpenInfo,
    dolu: dolu,
    sectionOn: sectionOn,
    gorunur: gorunur,
    DAY_ORDER: DAY_ORDER,
    templates: T
  };
});
