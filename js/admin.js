/**
 * Gusto Organik — Yönetim Paneli Mantığı
 *
 * KURAL 1 (kimlik doğrulama): data/admin-auth.json içindeki PBKDF2-SHA256 hash'e
 * karşı doğrulama yapılır. Yedek parola YOKTUR. 5 hatalı denemede geçici kilit.
 * İlk girişte parola değişikliği ZORUNLUDUR.
 */
(function () {
  'use strict';

  var esc = HBShared.esc;
  var icon = HBShared.icon;

  var LOCK_KEY = 'gusto_admin_lock_v1';
  var SESSION_KEY = 'gusto_admin_session_v1';
  var SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 saat
  var FIRST_LOGIN_ACK_KEY = 'gusto_first_login_ack_v1';

  var state = {
    data: null,
    auth: null,
    lockCountdownTimer: null
  };

  /* ==========================================================================
     Yardımcılar
     ======================================================================== */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function on(el, evt, fn) { if (el) el.addEventListener(evt, fn); }
  function uid(prefix) { return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 9); }

  function toast(msg, isError) {
    var box = document.getElementById('toastBox');
    if (!box) return;
    box.textContent = msg;
    box.className = 'toast-box active' + (isError ? ' error' : '');
    clearTimeout(box._t);
    box._t = setTimeout(function () { box.classList.remove('active'); }, 3600);
  }

  function bytesToHex(bytes) {
    return Array.prototype.map.call(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  function randomHex(len) {
    var bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
  }
  async function pbkdf2HashHex(password, saltStr, iterations) {
    var enc = new TextEncoder();
    var keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
    var bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode(saltStr), iterations: iterations, hash: 'SHA-256' },
      keyMaterial, 256
    );
    return bytesToHex(new Uint8Array(bits));
  }

  function persistDraft() {
    HBSiteData.saveDraft(state.data);
  }

  function rerenderActiveTab() {
    var active = document.querySelector('.sidebar-link.active');
    if (active) renderTab(active.getAttribute('data-tab'));
  }

  function mutate(fn) {
    fn(state.data);
    persistDraft();
    rerenderActiveTab();
    renderOverviewStatsOnly();
  }

  /* ==========================================================================
     Genel modal
     ======================================================================== */
  function openModal(title, bodyHtml, footerHtml) {
    document.getElementById('genericModalTitle').textContent = title;
    document.getElementById('genericModalBody').innerHTML = bodyHtml;
    document.getElementById('genericModalFooter').innerHTML = footerHtml || '';
    document.getElementById('genericModal').classList.add('active');
  }
  function closeModal() {
    document.getElementById('genericModal').classList.remove('active');
  }
  on(document.getElementById('genericModalClose'), 'click', closeModal);
  on(document.getElementById('genericModal'), 'click', function (e) {
    if (e.target.id === 'genericModal') closeModal();
  });

  /* ==========================================================================
     Form yapı taşları
     ======================================================================== */
  function field(labelText, innerHtml, hint) {
    return '<div class="form-group-admin"><label>' + esc(labelText) + '</label>' + innerHtml +
      (hint ? '<span class="field-hint">' + esc(hint) + '</span>' : '') + '</div>';
  }
  function inputHtml(id, value, placeholder, type) {
    return '<input type="' + (type || 'text') + '" id="' + id + '" class="admin-input" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '') + '">';
  }
  function textareaHtml(id, value, rows) {
    return '<textarea id="' + id + '" class="admin-textarea" rows="' + (rows || 3) + '">' + esc(value || '') + '</textarea>';
  }
  function checkboxHtml(id, checked, labelText) {
    return '<label class="admin-checkbox"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '> ' + esc(labelText) + '</label>';
  }
  function selectHtml(id, options, selected) {
    var opts = options.map(function (o) {
      return '<option value="' + esc(o.value) + '"' + (o.value === selected ? ' selected' : '') + '>' + esc(o.label) + '</option>';
    }).join('');
    return '<select id="' + id + '" class="admin-input">' + opts + '</select>';
  }

  /* ==========================================================================
     KİMLİK DOĞRULAMA
     ======================================================================== */
  function getLockState() {
    try { return JSON.parse(localStorage.getItem(LOCK_KEY)) || { failCount: 0, lockUntil: 0 }; }
    catch (e) { return { failCount: 0, lockUntil: 0 }; }
  }
  function setLockState(s) { localStorage.setItem(LOCK_KEY, JSON.stringify(s)); }

  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
  }
  function setSession() { localStorage.setItem(SESSION_KEY, JSON.stringify({ ts: Date.now() })); }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }
  function isSessionValid() {
    var s = getSession();
    return Boolean(s && s.ts && (Date.now() - s.ts) < SESSION_TTL_MS);
  }

  function showLockBanner(lockUntil) {
    var banner = document.getElementById('authLockBanner');
    var btn = document.getElementById('btnAdminLogin');
    banner.style.display = 'block';
    btn.disabled = true;
    clearInterval(state.lockCountdownTimer);
    function tick() {
      var remaining = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      if (remaining <= 0) {
        banner.style.display = 'none';
        btn.disabled = false;
        clearInterval(state.lockCountdownTimer);
        return;
      }
      banner.textContent = '🔒 Çok fazla hatalı deneme. Lütfen ' + remaining + ' saniye sonra tekrar deneyin.';
    }
    tick();
    state.lockCountdownTimer = setInterval(tick, 1000);
  }

  async function handleLoginSubmit(e) {
    e.preventDefault();
    var errEl = document.getElementById('authErrorMsg');
    errEl.style.display = 'none';

    var lockState = getLockState();
    if (lockState.lockUntil && Date.now() < lockState.lockUntil) {
      showLockBanner(lockState.lockUntil);
      return;
    }

    var user = document.getElementById('adminUsername').value.trim();
    var pass = document.getElementById('adminPassword').value;

    var ok = false;
    try {
      var hashHex = await pbkdf2HashHex(pass, state.auth.salt, state.auth.iterations);
      ok = (user === state.auth.username) && (hashHex === state.auth.hash);
    } catch (err) {
      ok = false;
    }

    if (ok) {
      setLockState({ failCount: 0, lockUntil: 0 });
      setSession();
      await enterAdmin();
    } else {
      lockState.failCount = (lockState.failCount || 0) + 1;
      if (lockState.failCount >= (state.auth.maxAttempts || 5)) {
        lockState.lockUntil = Date.now() + (state.auth.lockoutSeconds || 60) * 1000;
        lockState.failCount = 0;
        setLockState(lockState);
        showLockBanner(lockState.lockUntil);
      } else {
        setLockState(lockState);
      }
      errEl.style.display = 'block';
      document.getElementById('adminPassword').value = '';
    }
  }

  function showFirstLoginOverlay() {
    document.getElementById('firstLoginOverlay').style.display = 'flex';
  }
  function hideFirstLoginOverlay() {
    document.getElementById('firstLoginOverlay').style.display = 'none';
  }

  async function handleFirstLoginSubmit(e) {
    e.preventDefault();
    var errEl = document.getElementById('firstLoginError');
    errEl.style.display = 'none';
    var p1 = document.getElementById('newPassword1').value;
    var p2 = document.getElementById('newPassword2').value;

    if (p1.length < 10 || !/[a-zA-Z]/.test(p1) || !/[0-9]/.test(p1)) {
      errEl.textContent = 'Şifre en az 10 karakter olmalı ve harf + rakam içermelidir.';
      errEl.style.display = 'block';
      return;
    }
    if (p1 !== p2) {
      errEl.textContent = 'Şifreler eşleşmiyor.';
      errEl.style.display = 'block';
      return;
    }

    var salt = randomHex(24);
    var hash = await pbkdf2HashHex(p1, salt, state.auth.iterations || 100000);
    var newAuth = Object.assign({}, state.auth, {
      salt: salt, hash: hash, isFirstLogin: false, lastChanged: new Date().toISOString()
    });

    var cfg = HBSiteData.getGithubConfig();
    if (cfg && cfg.token) {
      try {
        await HBSiteData.ghPutAuth(cfg, JSON.stringify(newAuth, null, 2) + '\n', 'Yönetici şifresi güncellendi');
        state.auth = newAuth;
        localStorage.setItem(FIRST_LOGIN_ACK_KEY, '1');
        toast('Şifreniz güncellendi ve GitHub\'a yayınlandı.');
        hideFirstLoginOverlay();
      } catch (err) {
        errEl.textContent = 'GitHub\'a yazılamadı: ' + err.message + ' — Aşağıdan dosyayı indirip elle repoya ekleyin.';
        errEl.style.display = 'block';
        downloadFile('admin-auth.json', JSON.stringify(newAuth, null, 2));
        state.auth = newAuth;
        localStorage.setItem(FIRST_LOGIN_ACK_KEY, '1');
        hideFirstLoginOverlay();
      }
    } else {
      state.auth = newAuth;
      localStorage.setItem(FIRST_LOGIN_ACK_KEY, '1');
      downloadFile('admin-auth.json', JSON.stringify(newAuth, null, 2));
      toast('Şifreniz değişti. İndirilen admin-auth.json dosyasını data/ klasörüne (GitHub üzerinden) yükleyin, aksi halde eski şifre kalıcı olarak geçerli olmaz.');
      hideFirstLoginOverlay();
    }
  }

  function downloadFile(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  async function enterAdmin() {
    document.getElementById('adminAuthScreen').style.display = 'none';
    await loadWorkingData();
    initSidebarNav();
    renderAll();
    if (state.auth.isFirstLogin && !localStorage.getItem(FIRST_LOGIN_ACK_KEY)) {
      showFirstLoginOverlay();
    }
  }

  async function loadWorkingData() {
    var published = await HBSiteData.loadPublished({ bust: true });
    if (HBSiteData.hasDraft()) {
      var draft = HBSiteData.loadDraft();
      state.data = draft || published;
      toast('Yayınlanmamış bir taslağınız yüklendi.');
    } else {
      state.data = published;
    }
  }

  /* ==========================================================================
     Sekme gezinme
     ======================================================================== */
  function initSidebarNav() {
    $all('.sidebar-link').forEach(function (btn) {
      on(btn, 'click', function () {
        $all('.sidebar-link').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        $all('.tab-pane').forEach(function (p) { p.classList.remove('active'); });
        var pane = document.getElementById(btn.getAttribute('data-tab'));
        if (pane) pane.classList.add('active');
        renderTab(btn.getAttribute('data-tab'));
        document.getElementById('adminSidebar').classList.remove('open');
      });
    });
    on(document.getElementById('mobileSidebarToggle'), 'click', function () {
      document.getElementById('adminSidebar').classList.toggle('open');
    });
    on(document.getElementById('btnLogout'), 'click', function () {
      clearSession();
      location.reload();
    });
    on(document.getElementById('btnPublishMobile'), 'click', function () {
      selectTab('tab-account');
      setTimeout(function () { var b = document.getElementById('btnPublishNow'); if (b) b.scrollIntoView({ behavior: 'smooth' }); }, 200);
    });
  }
  function selectTab(tabId) {
    var btn = document.querySelector('.sidebar-link[data-tab="' + tabId + '"]');
    if (btn) btn.click();
  }

  function renderAll() {
    renderOverview();
    renderMenu();
    renderHome();
    renderHours();
    renderImages();
    renderContent();
    renderReviews();
    renderAccount();
  }
  function renderTab(tabId) {
    var map = {
      'tab-overview': renderOverview, 'tab-menu': renderMenu, 'tab-home': renderHome,
      'tab-hours': renderHours, 'tab-images': renderImages, 'tab-content': renderContent,
      'tab-reviews': renderReviews, 'tab-account': renderAccount
    };
    if (map[tabId]) map[tabId]();
  }

  /* ==========================================================================
     GENEL BAKIŞ
     ======================================================================== */
  function renderOverviewStatsOnly() {
    var grid = document.getElementById('ovStatsGrid');
    if (grid) grid.outerHTML = overviewStatsHtml();
  }

  function overviewStatsHtml() {
    var d = state.data;
    var totalItems = (d.menuCategories || []).reduce(function (n, c) { return n + (c.items || []).length; }, 0);
    var live = HBShared.getLiveStatus(d.hours);
    return lines([
      '<div class="admin-stats-grid" id="ovStatsGrid">',
      statBox('flame', d.menuCategories.length, 'Menü Kategorisi'),
      statBox('check', totalItems, 'Menü Ürünü'),
      statBox('star', d.testimonials.length, 'Yorum'),
      statBox('clock', live.openNow ? 'Açık' : 'Kapalı', 'Şu An'),
      '</div>'
    ]);
  }
  function statBox(iconName, value, label) {
    return lines([
      '<div class="stat-box">',
      '  <div class="stat-icon">' + icon(iconName, 20) + '</div>',
      '  <div class="stat-data"><span class="stat-value">' + esc(value) + '</span><span class="stat-label">' + esc(label) + '</span></div>',
      '</div>'
    ]);
  }
  function lines(arr) { return arr.join('\n'); }

  function renderOverview() {
    var root = document.getElementById('overviewRoot');
    if (!root) return;
    var d = state.data;
    var cfg = HBSiteData.getGithubConfig();
    var statusBanner = '';
    if (d.menuStatus === 'pending') {
      statusBanner = lines([
        '<div class="price-estimate-banner">',
        '  ⚠️ <strong>Menü fiyatları henüz girilmedi.</strong> Menü &amp; Fiyatlar sekmesinden fiyat yazıp yayınlayın.',
        '</div>'
      ]);
    } else if (d.menuStatus === 'estimated') {
      statusBanner = lines([
        '<div class="price-estimate-banner">',
        '  ⚠️ <strong>Sitedeki fiyatlar örnektir.</strong> Gerçek listeyi Menü &amp; Fiyatlar’dan düzenleyip durumu “Yayınlandı” yapın.',
        '</div>'
      ]);
    }

    root.innerHTML = lines([
      overviewStatsHtml(),
      statusBanner,
      '<div class="admin-card">',
      '  <div class="admin-card-header"><h3 class="admin-card-title">Yayın Durumu</h3></div>',
      '  <table class="kv-table">',
      '    <tr><td>Taslak Durumu</td><td>' + (HBSiteData.hasDraft() ? '<span class="badge-warn">Yayınlanmamış değişiklikler var</span>' : '<span class="badge-ok">Güncel</span>') + '</td></tr>',
      '    <tr><td>GitHub Bağlantısı</td><td>' + (cfg && cfg.token ? '<span class="badge-ok">Bağlı (' + esc(cfg.owner) + '/' + esc(cfg.repo) + ')</span>' : '<span class="badge-warn">Bağlı değil</span>') + '</td></tr>',
      '    <tr><td>İçerik Sürümü</td><td class="td-muted">' + esc(d.contentVersion) + '</td></tr>',
      '  </table>',
      '  <div class="admin-quick-actions" style="margin-top: 16px;">',
      '    <button type="button" class="btn-admin-primary" id="ovBtnPublish">' + icon('check', 15) + ' Şimdi Yayınla</button>',
      '    <button type="button" class="btn-admin-secondary" id="ovBtnGithub">GitHub Bağlantısını Ayarla</button>',
      '  </div>',
      '</div>'
    ]);

    on(document.getElementById('ovBtnPublish'), 'click', publishNow);
    on(document.getElementById('ovBtnGithub'), 'click', function () { selectTab('tab-account'); });
  }

  /* ==========================================================================
     MENÜ & FİYATLAR
     ======================================================================== */
  function menuStatusPill(value, current, label, hint) {
    return '<button type="button" class="menu-status-pill' + (current === value ? ' is-active' : '') + '" data-status="' + value + '"><strong>' + esc(label) + '</strong><span>' + esc(hint) + '</span></button>';
  }

  function parsePriceValue(price) {
    return parseFloat(String(price).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
  }
  function normalizePrice(price) {
    var t = String(price || '').trim();
    if (!t) return '';
    if (/^\d+([.,]\d+)?$/.test(t)) return t.replace('.', ',') + ' ₺';
    return t;
  }
  function commitItemPrice(catIdx, itemIdx, raw) {
    var price = normalizePrice(raw);
    if (!price) { toast('Fiyat boş bırakılamaz.', true); rerenderActiveTab(); return; }
    var current = state.data.menuCategories[catIdx].items[itemIdx];
    var nextValue = parsePriceValue(price);
    if (current.price === price && current.priceValue === nextValue) return;
    mutate(function (d) {
      var item = d.menuCategories[catIdx].items[itemIdx];
      item.price = price;
      item.priceValue = nextValue;
      if (d.menuStatus === 'pending' && nextValue > 0) d.menuStatus = 'estimated';
    });
    toast('Fiyat kaydedildi.');
  }

  function renderMenu() {
    var root = document.getElementById('menuRoot');
    if (!root) return;
    var cats = state.data.menuCategories || [];
    var status = state.data.menuStatus || 'pending';

    root.innerHTML = lines([
      '<div class="admin-card menu-status-card">',
      '  <div class="admin-card-header"><h3 class="admin-card-title">Fiyat görünümü</h3></div>',
      '  <p class="admin-card-sub">Sitede fiyatların nasıl yazılacağını buradan seçin. Ürün fiyatlarını tabloda doğrudan değiştirebilirsiniz.</p>',
      '  <div class="menu-status-pills" role="radiogroup" aria-label="Fiyat görünümü">',
      menuStatusPill('pending', status, 'Beklemede', '“Fiyat için arayın / yazın” notu'),
      menuStatusPill('estimated', status, 'Örnek fiyatlar', 'Sitede örnek uyarısı'),
      menuStatusPill('published', status, 'Yayınlandı', 'Uyarı yok, gerçek liste'),
      '  </div>',
      '</div>',
      '<div class="admin-actions-group" style="margin-bottom: 18px;">',
      '  <button type="button" class="btn-admin-primary" id="btnAddCategory">' + icon('check', 14) + ' Yeni Kategori Ekle</button>',
      '</div>',
      cats.map(categoryCardHtml).join('\n'),
      !cats.length ? '<p class="empty-state">Henüz kategori yok.</p>' : ''
    ]);

    $all('.menu-status-pill').forEach(function (btn) {
      on(btn, 'click', function () {
        var next = btn.getAttribute('data-status');
        mutate(function (d) { d.menuStatus = next; });
        toast(next === 'published' ? 'Fiyatlar yayınlanmış olarak işaretlendi.' : 'Fiyat görünümü güncellendi.');
      });
    });
    on(document.getElementById('btnAddCategory'), 'click', openCategoryModal.bind(null, null));

    cats.forEach(function (cat, catIdx) {
      on(document.getElementById('btnEditCat-' + catIdx), 'click', openCategoryModal.bind(null, catIdx));
      on(document.getElementById('btnDeleteCat-' + catIdx), 'click', function () { deleteCategory(catIdx); });
      on(document.getElementById('btnAddItem-' + catIdx), 'click', openItemModal.bind(null, catIdx, null));
      (cat.items || []).forEach(function (item, itemIdx) {
        on(document.getElementById('btnEditItem-' + catIdx + '-' + itemIdx), 'click', openItemModal.bind(null, catIdx, itemIdx));
        on(document.getElementById('btnDeleteItem-' + catIdx + '-' + itemIdx), 'click', function () { deleteItem(catIdx, itemIdx); });
        var priceInput = document.getElementById('priceInline-' + catIdx + '-' + itemIdx);
        on(priceInput, 'change', function () { commitItemPrice(catIdx, itemIdx, priceInput.value); });
        on(priceInput, 'keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); priceInput.blur(); }
        });
      });
    });
  }

  function categoryCardHtml(cat, catIdx) {
    var rows = (cat.items || []).map(function (item, itemIdx) {
      return lines([
        '<tr>',
        '  <td><span class="td-title">' + esc(item.title) + '</span>' + (item.isPopular ? ' <span class="badge-highlight">★ Popüler</span>' : '') + '<br><span class="td-desc">' + esc(item.desc || '') + '</span></td>',
        '  <td><input type="text" class="admin-input price-inline" id="priceInline-' + catIdx + '-' + itemIdx + '" value="' + esc(item.price) + '" placeholder="örn. 180 ₺" aria-label="' + esc(item.title) + ' fiyatı"></td>',
        '  <td class="cell-actions">',
        '    <button type="button" class="action-icon-btn" id="btnEditItem-' + catIdx + '-' + itemIdx + '" title="Düzenle">' + icon('edit', 14) + '</button>',
        '    <button type="button" class="action-icon-btn delete" id="btnDeleteItem-' + catIdx + '-' + itemIdx + '" title="Sil">' + icon('trash', 14) + '</button>',
        '  </td>',
        '</tr>'
      ]);
    }).join('\n');

    return lines([
      '<div class="admin-category-card">',
      '  <div class="category-card-top">',
      '    <div class="cat-title-block">',
      '      <span class="menu-cat-icon">' + icon(cat.icon || 'star', 18) + '</span>',
      '      <div><div class="cat-heading">' + esc(cat.title) + '</div><div class="cat-subheading">' + (cat.items || []).length + ' ürün · key: ' + esc(cat.key) + '</div></div>',
      '    </div>',
      '    <div class="cat-actions">',
      '      <button type="button" class="btn-admin-secondary btn-xs" id="btnAddItem-' + catIdx + '">+ Ürün Ekle</button>',
      '      <button type="button" class="btn-admin-secondary btn-xs" id="btnEditCat-' + catIdx + '">Kategoriyi Düzenle</button>',
      '      <button type="button" class="btn-admin-danger btn-xs" id="btnDeleteCat-' + catIdx + '">Kategoriyi Sil</button>',
      '    </div>',
      '  </div>',
      '  <div class="table-scroll">',
      '    <table class="menu-items-table">',
      '      <thead><tr><th>Ürün</th><th>Fiyat</th><th></th></tr></thead>',
      '      <tbody>' + (rows || '<tr><td colspan="3" class="empty-cell">Bu kategoride ürün yok.</td></tr>') + '</tbody>',
      '    </table>',
      '  </div>',
      '</div>'
    ]);
  }

  var ICON_CHOICES = ['flame', 'leaf', 'users', 'truck', 'star', 'clock', 'check'];
  function iconSelectHtml(id, selected) {
    return selectHtml(id, ICON_CHOICES.map(function (i) { return { value: i, label: HBShared.ICON_LABELS[i] || i }; }), selected);
  }

  function slugify(text) {
    return String(text || '').toLocaleLowerCase('tr')
      .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  function openCategoryModal(catIdx) {
    var isNew = catIdx === null;
    var cat = isNew ? { key: '', title: '', icon: 'star', items: [] } : state.data.menuCategories[catIdx];

    openModal(isNew ? 'Yeni Kategori' : 'Kategoriyi Düzenle', lines([
      field('Kategori Adı', inputHtml('mCatTitle', cat.title, 'örn. Çorbalar')),
      field('İkon', iconSelectHtml('mCatIcon', cat.icon))
    ]), lines([
      '<button type="button" class="btn-admin-secondary" id="mCatCancel">İptal</button>',
      '<button type="button" class="btn-admin-primary" id="mCatSave">Kaydet</button>'
    ]));

    on(document.getElementById('mCatCancel'), 'click', closeModal);
    on(document.getElementById('mCatSave'), 'click', function () {
      var title = document.getElementById('mCatTitle').value.trim();
      if (!title) { toast('Kategori adı gerekli.', true); return; }
      var iconVal = document.getElementById('mCatIcon').value;
      mutate(function (d) {
        if (isNew) {
          var key = slugify(title) || uid('cat');
          d.menuCategories.push({ key: key, title: title, icon: iconVal, items: [] });
        } else {
          d.menuCategories[catIdx].title = title;
          d.menuCategories[catIdx].icon = iconVal;
        }
      });
      closeModal();
      toast('Kategori kaydedildi.');
    });
  }

  function deleteCategory(catIdx) {
    var cat = state.data.menuCategories[catIdx];
    if (!confirm('"' + cat.title + '" kategorisini ve içindeki ' + (cat.items || []).length + ' ürünü silmek istediğinize emin misiniz?')) return;
    mutate(function (d) { d.menuCategories.splice(catIdx, 1); });
    toast('Kategori silindi.');
  }

  function openItemModal(catIdx, itemIdx) {
    var isNew = itemIdx === null;
    var item = isNew ? { id: '', title: '', desc: '', price: '', priceValue: 0, isPopular: false } : state.data.menuCategories[catIdx].items[itemIdx];

    openModal(isNew ? 'Yeni Ürün' : 'Ürünü Düzenle', lines([
      field('Ürün Adı', inputHtml('mItemTitle', item.title, 'örn. Ekler')),
      field('Açıklama', textareaHtml('mItemDesc', item.desc, 2)),
      field('Fiyat (sitede görünen, örn. 180 ₺)', inputHtml('mItemPrice', item.price, '180 ₺'), 'Sadece rakam yazarsanız sonuna ₺ eklenir.'),
      field('', checkboxHtml('mItemPopular', item.isPopular, 'Popüler ürün olarak işaretle (★ rozeti gösterilir)'))
    ]), lines([
      '<button type="button" class="btn-admin-secondary" id="mItemCancel">İptal</button>',
      '<button type="button" class="btn-admin-primary" id="mItemSave">Kaydet</button>'
    ]));

    on(document.getElementById('mItemCancel'), 'click', closeModal);
    on(document.getElementById('mItemSave'), 'click', function () {
      var title = document.getElementById('mItemTitle').value.trim();
      var price = normalizePrice(document.getElementById('mItemPrice').value);
      if (!title || !price) { toast('Ürün adı ve fiyat gerekli.', true); return; }
      var desc = document.getElementById('mItemDesc').value.trim();
      var popular = document.getElementById('mItemPopular').checked;
      var priceValue = parsePriceValue(price);

      mutate(function (d) {
        var cat = d.menuCategories[catIdx];
        if (isNew) {
          cat.items.push({ id: slugify(cat.key + '-' + title) || uid('item'), title: title, desc: desc, price: price, priceValue: priceValue, isPopular: popular });
        } else {
          Object.assign(cat.items[itemIdx], { title: title, desc: desc, price: price, priceValue: priceValue, isPopular: popular });
        }
        if (d.menuStatus === 'pending' && priceValue > 0) d.menuStatus = 'estimated';
      });
      closeModal();
      toast('Ürün kaydedildi.');
    });
  }

  function deleteItem(catIdx, itemIdx) {
    var item = state.data.menuCategories[catIdx].items[itemIdx];
    if (!confirm('"' + item.title + '" ürününü silmek istediğinize emin misiniz?')) return;
    mutate(function (d) { d.menuCategories[catIdx].items.splice(itemIdx, 1); });
    toast('Ürün silindi.');
  }

  /* ==========================================================================
     ANA SAYFA (hero, trust, features, about)
     ======================================================================== */
  function renderHome() {
    var root = document.getElementById('homeRoot');
    if (!root) return;
    var d = state.data;

    root.innerHTML = lines([
      '<div class="admin-card">',
      '  <div class="admin-card-header"><h3 class="admin-card-title">Öne Çıkan Bölüm (Hero)</h3></div>',
      '  <div class="admin-form-grid">',
      '    ' + field('Rozet Metni', inputHtml('hBadge', d.hero.badge), 'Başlığın üstündeki küçük etiket'),
      '    ' + field('', ''),
      '    ' + field('Başlık — 1. Satır', inputHtml('hLine1', d.hero.titleLine1)),
      '    ' + field('Başlık — Vurgulu Satır', inputHtml('hAccent', d.hero.titleAccent)),
      '  </div>',
      '  ' + field('Alt Başlık', textareaHtml('hSubtitle', d.hero.subtitle, 3)),
      '  <button type="button" class="btn-admin-primary" id="btnSaveHero">Kaydet</button>',
      '</div>',

      '<div class="admin-card array-card">',
      '  <div class="admin-card-header"><h3 class="admin-card-title">Öne Çıkan İstatistikler</h3><button type="button" class="btn-admin-secondary btn-xs" id="btnAddTrust">+ Ekle</button></div>',
      '  <div id="trustList">' + (d.hero.trustStats || []).map(trustItemHtml).join('') + '</div>',
      '</div>',

      '<div class="admin-card array-card">',
      '  <div class="admin-card-header"><h3 class="admin-card-title">Özellik Kartları</h3><button type="button" class="btn-admin-secondary btn-xs" id="btnAddFeature">+ Ekle</button></div>',
      '  <div id="featureList">' + (d.features || []).map(featureItemHtml).join('') + '</div>',
      '</div>',

      '<div class="admin-card">',
      '  <div class="admin-card-header"><h3 class="admin-card-title">Hakkımızda</h3></div>',
      '  ' + field('Üst Etiket', inputHtml('aEyebrow', d.about.eyebrow)),
      '  ' + field('Başlık', inputHtml('aTitle', d.about.title)),
      '  ' + field('Paragraf 1', textareaHtml('aPara1', (d.about.paragraphs || [])[0], 3)),
      '  ' + field('Paragraf 2', textareaHtml('aPara2', (d.about.paragraphs || [])[1], 3)),
      '  ' + field('Alıntı (Quote)', textareaHtml('aQuote', d.about.quote, 2)),
      '  <button type="button" class="btn-admin-primary" id="btnSaveAbout">Kaydet</button>',
      '</div>'
    ]);

    on(document.getElementById('btnSaveHero'), 'click', function () {
      mutate(function (d) {
        d.hero.badge = document.getElementById('hBadge').value.trim();
        d.hero.titleLine1 = document.getElementById('hLine1').value.trim();
        d.hero.titleAccent = document.getElementById('hAccent').value.trim();
        d.hero.subtitle = document.getElementById('hSubtitle').value.trim();
      });
      toast('Öne çıkan bölüm kaydedildi.');
    });

    on(document.getElementById('btnSaveAbout'), 'click', function () {
      mutate(function (d) {
        d.about.eyebrow = document.getElementById('aEyebrow').value.trim();
        d.about.title = document.getElementById('aTitle').value.trim();
        d.about.paragraphs = [document.getElementById('aPara1').value.trim(), document.getElementById('aPara2').value.trim()].filter(Boolean);
        d.about.quote = document.getElementById('aQuote').value.trim();
      });
      toast('Hakkımızda bölümü kaydedildi.');
    });

    on(document.getElementById('btnAddTrust'), 'click', function () {
      mutate(function (d) { d.hero.trustStats.push({ num: '', label: '' }); });
    });
    on(document.getElementById('btnAddFeature'), 'click', function () {
      mutate(function (d) { d.features.push({ title: '', description: '', icon: 'star' }); });
    });

    (d.hero.trustStats || []).forEach(function (t, i) { bindTrustRow(i); });
    (d.features || []).forEach(function (f, i) { bindFeatureRow(i); });
  }

  function trustItemHtml(t, i) {
    return lines([
      '<div class="sub-item" data-idx="' + i + '">',
      '  <div class="item-toolbar"><button type="button" class="action-icon-btn delete" id="btnDelTrust-' + i + '">' + icon('trash', 14) + '</button></div>',
      '  <div class="admin-form-grid">',
      '    ' + field('Sayı / Kısa Değer', inputHtml('trustNum-' + i, t.num)),
      '    ' + field('Etiket', inputHtml('trustLabel-' + i, t.label)),
      '  </div>',
      '  ' + field('Bağlantı (isteğe bağlı)', inputHtml('trustHref-' + i, t.href || ''), 'Örn. Google Haritalar yol tarifi. Boşsa kart tıklanmaz.'),
      '</div>'
    ]);
  }
  function bindTrustRow(i) {
    ['trustNum-' + i, 'trustLabel-' + i, 'trustHref-' + i].forEach(function (id) {
      on(document.getElementById(id), 'blur', function () {
        mutate(function (d) {
          d.hero.trustStats[i].num = document.getElementById('trustNum-' + i).value.trim();
          d.hero.trustStats[i].label = document.getElementById('trustLabel-' + i).value.trim();
          d.hero.trustStats[i].href = document.getElementById('trustHref-' + i).value.trim();
        });
      });
    });
    on(document.getElementById('btnDelTrust-' + i), 'click', function () {
      mutate(function (d) { d.hero.trustStats.splice(i, 1); });
    });
  }

  function featureItemHtml(f, i) {
    return lines([
      '<div class="sub-item" data-idx="' + i + '">',
      '  <div class="item-toolbar"><button type="button" class="action-icon-btn delete" id="btnDelFeature-' + i + '">' + icon('trash', 14) + '</button></div>',
      '  <div class="admin-form-grid">',
      '    ' + field('Başlık', inputHtml('featTitle-' + i, f.title)),
      '    ' + field('İkon', iconSelectHtml('featIcon-' + i, f.icon)),
      '  </div>',
      '  ' + field('Açıklama', textareaHtml('featDesc-' + i, f.description, 2)),
      '</div>'
    ]);
  }
  function bindFeatureRow(i) {
    ['featTitle-' + i, 'featDesc-' + i].forEach(function (id) {
      on(document.getElementById(id), 'blur', saveFeatureRow.bind(null, i));
    });
    on(document.getElementById('featIcon-' + i), 'change', saveFeatureRow.bind(null, i));
    on(document.getElementById('btnDelFeature-' + i), 'click', function () {
      mutate(function (d) { d.features.splice(i, 1); });
    });
  }
  function saveFeatureRow(i) {
    mutate(function (d) {
      d.features[i].title = document.getElementById('featTitle-' + i).value.trim();
      d.features[i].description = document.getElementById('featDesc-' + i).value.trim();
      d.features[i].icon = document.getElementById('featIcon-' + i).value;
    });
  }

  /* ==========================================================================
     ÇALIŞMA SAATLERİ — KURAL 8 (gece yarısını aşan kapanış)
     ======================================================================== */
  function renderHours() {
    var root = document.getElementById('hoursRoot');
    if (!root) return;
    var days = state.data.hours.days;

    var rows = days.map(function (day, i) {
      var r = (day.ranges && day.ranges[0]) || { open: '11:00', close: '00:00' };
      return lines([
        '<tr>',
        '  <td style="font-weight:700;">' + esc(day.label) + '</td>',
        '  <td>' + checkboxHtml('dayClosed-' + i, day.closed, 'Kapalı') + '</td>',
        '  <td><input type="time" id="dayOpen-' + i + '" class="admin-input input-sm" value="' + esc(r.open) + '" ' + (day.closed ? 'disabled' : '') + '></td>',
        '  <td><input type="time" id="dayClose-' + i + '" class="admin-input input-sm" value="' + esc(r.close === '00:00' ? '00:00' : r.close) + '" ' + (day.closed ? 'disabled' : '') + '></td>',
        '</tr>'
      ]);
    }).join('\n');

    root.innerHTML = lines([
      '<div class="admin-card">',
      '  <div class="admin-card-header">',
      '    <h3 class="admin-card-title">Haftalık Program</h3>',
      '    <button type="button" class="btn-admin-secondary btn-xs" id="btnCopyMonday">Pazartesi Saatini Tümüne Uygula</button>',
      '  </div>',
      '  <div class="table-scroll">',
      '    <table class="menu-items-table hours-editor">',
      '      <thead><tr><th>Gün</th><th>Kapalı mı?</th><th>Açılış</th><th>Kapanış</th></tr></thead>',
      '      <tbody>' + rows + '</tbody>',
      '    </table>',
      '  </div>',
      '  <p class="field-hint" style="margin-top: 10px;">Açılış ve kapanış aynıysa (örn. 00:00–00:00) gün 24 saat açık sayılır. Kapanış açılıştan küçükse (örn. 23:00–02:00) ertesi güne taşır.</p>',
      '  <button type="button" class="btn-admin-primary" id="btnSaveHours" style="margin-top: 14px;">Kaydet</button>',
      '</div>'
    ]);

    days.forEach(function (day, i) {
      on(document.getElementById('dayClosed-' + i), 'change', function () {
        var checked = document.getElementById('dayClosed-' + i).checked;
        document.getElementById('dayOpen-' + i).disabled = checked;
        document.getElementById('dayClose-' + i).disabled = checked;
      });
    });

    on(document.getElementById('btnCopyMonday'), 'click', function () {
      var o = document.getElementById('dayOpen-0').value;
      var c = document.getElementById('dayClose-0').value;
      var closed = document.getElementById('dayClosed-0').checked;
      days.forEach(function (_, i) {
        document.getElementById('dayOpen-' + i).value = o;
        document.getElementById('dayClose-' + i).value = c;
        document.getElementById('dayClosed-' + i).checked = closed;
        document.getElementById('dayOpen-' + i).disabled = closed;
        document.getElementById('dayClose-' + i).disabled = closed;
      });
      toast('Pazartesi saati tüm günlere uygulandı. Kaydetmeyi unutmayın.');
    });

    on(document.getElementById('btnSaveHours'), 'click', function () {
      mutate(function (d) {
        d.hours.days.forEach(function (day, i) {
          var closed = document.getElementById('dayClosed-' + i).checked;
          var open = document.getElementById('dayOpen-' + i).value || '11:00';
          var close = document.getElementById('dayClose-' + i).value || '00:00';
          day.closed = closed;
          day.ranges = closed ? [] : [{ open: open, close: close, closesNextDay: close < open }];
        });
      });
      toast('Çalışma saatleri kaydedildi.');
    });
  }

  /* ==========================================================================
     GÖRSELLER & KADRAJ
     ======================================================================== */
  function imageSlots() {
    var d = state.data;
    var slots = [
      { key: 'hero', label: 'Öne Çıkan Görsel (Hero)', ratio: '4 / 5', image: d.hero.mainImage, setter: function (img) { d.hero.mainImage = img; } },
      { key: 'about', label: 'Hakkımızda Görseli', ratio: '4 / 5', image: d.about.image, setter: function (img) { d.about.image = img; } }
    ];
    (d.gallery || []).forEach(function (g, i) {
      slots.push({ key: 'gallery-' + i, label: 'Galeri: ' + (g.title || ('Fotoğraf ' + (i + 1))), ratio: '3 / 4', image: g, setter: function (img) { Object.assign(d.gallery[i], img); } });
    });
    return slots;
  }

  function renderImages() {
    var root = document.getElementById('imagesRoot');
    if (!root) return;
    var slots = imageSlots();

    root.innerHTML = '<div class="images-grid">' + slots.map(function (slot, i) {
      var img = slot.image || {};
      return lines([
        '<div class="image-manage-card">',
        '  <div class="image-manage-preview">',
        '    <span class="image-badge-chip">' + esc(slot.label) + '</span>',
        '    <img src="' + esc(img.url) + '" alt="' + esc(img.alt || '') + '" style="object-position: ' + HBShared.focal(img) + ';">',
        '  </div>',
        '  <div class="image-card-body">',
        '    <div class="image-card-title">' + esc(img.alt || 'Açıklama yok') + '</div>',
        '    <div class="image-card-sub">Dosya: ' + esc((img.url || '').split('/').pop()) + '</div>',
        '    <div class="image-card-footer">',
        '      <span class="image-focal-info">Odak: ' + Math.round(img.focalX || 50) + '% / ' + Math.round(img.focalY || 50) + '%</span>',
        '      <button type="button" class="btn-admin-secondary btn-xs" id="btnCropImg-' + i + '">Kadrajı Düzenle</button>',
        '    </div>',
        '  </div>',
        '</div>'
      ]);
    }).join('\n') + '</div>';

    slots.forEach(function (slot, i) {
      on(document.getElementById('btnCropImg-' + i), 'click', function () {
        VisualFocalCropper.open({
          imageUrl: slot.image.url,
          focalX: slot.image.focalX,
          focalY: slot.image.focalY,
          title: slot.label + ' — Kadraj',
          aspectRatio: slot.ratio,
          ratioName: slot.ratio.replace(' / ', ':'),
          onSave: function (result) {
            mutate(function () {
              var next = { focalX: result.focalX, focalY: result.focalY };
              if (result.meta) {
                next.url = result.url; // data: URL — yayınlarken gerçek dosyaya çevrilir
                next.width = result.meta.width;
                next.height = result.meta.height;
              } else if (result.url && result.url !== slot.image.url) {
                next.url = result.url;
              }
              slot.setter(Object.assign({}, slot.image, next));
            });
            toast('Kadraj güncellendi. Kalıcı olması için "Yayınla" adımını unutmayın.');
          }
        });
      });
    });
  }

  /* ==========================================================================
     METİNLER & İLETİŞİM
     ======================================================================== */
  function renderContent() {
    var root = document.getElementById('contentRoot');
    if (!root) return;
    var d = state.data;
    var b = d.brand;

    root.innerHTML = lines([
      '<div class="admin-card">',
      '  <div class="admin-card-header"><h3 class="admin-card-title">İşletme Bilgileri</h3></div>',
      '  <div class="admin-form-grid">',
      '    ' + field('İşletme Adı', inputHtml('bName', b.name)),
      '    ' + field('Alt Ad', inputHtml('bSubName', b.subName)),
      '    ' + field('Telefon (Sabit/Mobil)', inputHtml('bPhone', b.phone)),
      '    ' + field('Telefon Türü', selectHtml('bPhoneType', [
        { value: 'landline', label: 'Sabit Hat (WhatsApp yok)' },
        { value: 'mobile', label: 'Mobil (WhatsApp olabilir)' },
        { value: 'both', label: 'Her İkisi' }
      ], b.phoneType)),
      '    ' + field('WhatsApp Numarası (varsa)', inputHtml('bWhatsapp', b.whatsappPhone)),
      '    ' + field('', checkboxHtml('bHasWhatsapp', b.hasWhatsapp, 'WhatsApp siparişi aktif')),
      '    ' + field('Adres', inputHtml('bAddress', b.address)),
      '    ' + field('Adres — İlçe/Not', inputHtml('bAddressDistrict', b.addressDistrict)),
      '    ' + field('Instagram Kullanıcı Adı', inputHtml('bInstaHandle', b.instagramHandle)),
      '    ' + field('Instagram URL', inputHtml('bInstaUrl', b.instagramUrl)),
      '    ' + field('Karşılama mesajı', inputHtml('bIntro', b.orderIntroText)),
      '    ' + field('Google Maps kısa link', inputHtml('bPlaceUrl', (b.googleMaps || {}).placeUrl)),
      '    ' + field('Enlem (lat)', inputHtml('bLat', String((b.googleMaps || {}).lat || ''), '', 'text')),
      '    ' + field('Boylam (lng)', inputHtml('bLng', String((b.googleMaps || {}).lng || ''), '', 'text')),
      '    ' + field('Place ID', inputHtml('bPlaceId', (b.googleMaps || {}).placeId)),
      '    ' + field('Puan', inputHtml('bRating', (b.googleMaps || {}).rating)),
      '    ' + field('Yorum sayısı', inputHtml('bReviewCount', (b.googleMaps || {}).reviewCount)),
      '  </div>',
      '  <p class="field-hint">Telefon türü "Sabit Hat" olduğunda sitede hiçbir yerde WhatsApp bağlantısı gösterilmez (KURAL 2). Harita pin\'i enlem/boylamdan üretilir.</p>',
      '  <button type="button" class="btn-admin-primary" id="btnSaveBrand">Kaydet</button>',
      '</div>',

      '<div class="admin-card">',
      '  <div class="admin-card-header"><h3 class="admin-card-title">Bölüm Başlıkları</h3></div>',
      Object.keys(d.sections).map(function (key) {
        var s = d.sections[key];
        if (!s || typeof s !== 'object') s = { visible: s !== false };
        var locked = key === 'contact';
        var vis = s.visible !== false;
        return lines([
          '<div class="sub-item">',
          '  <div class="sub-item-title">' + esc(key) + (locked ? ' (gizlenemez)' : '') + '</div>',
          locked ? '' : '  ' + checkboxHtml('sec-' + key + '-vis', vis, vis ? 'Sitede görünür' : 'Gizli — sitede yok'),
          vis ? '' : '  <p class="field-hint">İçerik silindiğinde veya kapatıldığında bu bölüm, nav bağlantısı ve JSON-LD karşılığı birlikte kaybolur.</p>',
          '  <div class="admin-form-grid">',
          '    ' + field('Üst Etiket', inputHtml('sec-' + key + '-eyebrow', s.eyebrow)),
          '    ' + field('Başlık', inputHtml('sec-' + key + '-title', s.title)),
          '  </div>',
          '  ' + field('Açıklama', textareaHtml('sec-' + key + '-lead', s.lead, 2)),
          '</div>'
        ]);
      }).join('\n'),
      '  <button type="button" class="btn-admin-primary" id="btnSaveSections">Kaydet</button>',
      '</div>',

      '<div class="admin-card">',
      '  <div class="admin-card-header"><h3 class="admin-card-title">Footer</h3></div>',
      '  ' + field('Açıklama', textareaHtml('footerDesc', d.footer.desc, 2)),
      '  ' + field('Telif Metni', inputHtml('footerCopy', d.footer.copyright)),
      '  <button type="button" class="btn-admin-primary" id="btnSaveFooter">Kaydet</button>',
      '</div>'
    ]);

    on(document.getElementById('btnSaveBrand'), 'click', function () {
      mutate(function (d2) {
        var brand = d2.brand;
        brand.name = document.getElementById('bName').value.trim();
        brand.subName = document.getElementById('bSubName').value.trim();
        brand.phone = document.getElementById('bPhone').value.trim();
        brand.phoneType = document.getElementById('bPhoneType').value;
        brand.whatsappPhone = document.getElementById('bWhatsapp').value.trim();
        brand.hasWhatsapp = document.getElementById('bHasWhatsapp').checked && brand.phoneType !== 'landline';
        brand.address = document.getElementById('bAddress').value.trim();
        brand.addressDistrict = document.getElementById('bAddressDistrict').value.trim();
        brand.instagramHandle = document.getElementById('bInstaHandle').value.trim();
        brand.instagramUrl = document.getElementById('bInstaUrl').value.trim();
        brand.orderIntroText = document.getElementById('bIntro').value.trim();
        brand.googleMaps = brand.googleMaps || {};
        brand.googleMaps.placeUrl = document.getElementById('bPlaceUrl').value.trim();
        brand.googleMaps.lat = parseFloat(document.getElementById('bLat').value) || brand.googleMaps.lat;
        brand.googleMaps.lng = parseFloat(document.getElementById('bLng').value) || brand.googleMaps.lng;
        brand.googleMaps.placeId = document.getElementById('bPlaceId').value.trim();
        brand.googleMaps.rating = document.getElementById('bRating').value.trim();
        brand.googleMaps.reviewCount = document.getElementById('bReviewCount').value.trim();
        brand.googleMaps.reviewUrl = brand.googleMaps.placeId
          ? 'https://search.google.com/local/writereview?placeid=' + brand.googleMaps.placeId
          : brand.googleMaps.reviewUrl;
        if (brand.googleMaps.lat && brand.googleMaps.lng) {
          brand.googleMaps.embedUrl = 'https://maps.google.com/maps?q=' + brand.googleMaps.lat + ',' + brand.googleMaps.lng +
            '(' + encodeURIComponent(brand.name) + ')&z=17&hl=tr&output=embed';
        }
      });
      toast('İşletme bilgileri kaydedildi.');
    });

    on(document.getElementById('btnSaveSections'), 'click', function () {
      mutate(function (d2) {
        Object.keys(d2.sections).forEach(function (key) {
          if (!d2.sections[key] || typeof d2.sections[key] !== 'object') d2.sections[key] = {};
          d2.sections[key].eyebrow = document.getElementById('sec-' + key + '-eyebrow').value.trim();
          d2.sections[key].title = document.getElementById('sec-' + key + '-title').value.trim();
          d2.sections[key].lead = document.getElementById('sec-' + key + '-lead').value.trim();
          var visEl = document.getElementById('sec-' + key + '-vis');
          if (key === 'contact') d2.sections[key].visible = true;
          else if (visEl) d2.sections[key].visible = visEl.checked;
        });
      });
      toast('Bölüm başlıkları kaydedildi.');
    });

    on(document.getElementById('btnSaveFooter'), 'click', function () {
      mutate(function (d2) {
        d2.footer.desc = document.getElementById('footerDesc').value.trim();
        d2.footer.copyright = document.getElementById('footerCopy').value.trim();
      });
      toast('Footer kaydedildi.');
    });
  }

  /* ==========================================================================
     YORUMLAR & SSS
     ======================================================================== */
  function renderReviews() {
    var root = document.getElementById('reviewsRoot');
    if (!root) return;
    var d = state.data;

    root.innerHTML = lines([
      '<div class="admin-card array-card">',
      '  <div class="admin-card-header"><h3 class="admin-card-title">Müşteri Yorumları</h3><button type="button" class="btn-admin-secondary btn-xs" id="btnAddTestimonial">+ Yorum Ekle</button></div>',
      '  <div id="testimonialList">' + (d.testimonials || []).map(testimonialRowHtml).join('') + '</div>',
      '</div>',

      '<div class="admin-card array-card">',
      '  <div class="admin-card-header"><h3 class="admin-card-title">Sıkça Sorulan Sorular</h3><button type="button" class="btn-admin-secondary btn-xs" id="btnAddFaq">+ Soru Ekle</button></div>',
      '  <div id="faqAdminList">' + (d.faq || []).map(faqRowHtml).join('') + '</div>',
      '</div>'
    ]);

    on(document.getElementById('btnAddTestimonial'), 'click', function () {
      mutate(function (d2) { d2.testimonials.push({ author: '', stars: 5, badge: '', quote: '', source: 'Google Haritalar', date: new Date().toISOString().slice(0, 10) }); });
    });
    on(document.getElementById('btnAddFaq'), 'click', function () {
      mutate(function (d2) { d2.faq.push({ question: '', answer: '' }); });
    });

    (d.testimonials || []).forEach(function (t, i) { bindTestimonialRow(i); });
    (d.faq || []).forEach(function (f, i) { bindFaqRow(i); });
  }

  function testimonialRowHtml(t, i) {
    return lines([
      '<div class="sub-item">',
      '  <div class="item-toolbar"><button type="button" class="action-icon-btn delete" id="btnDelTest-' + i + '">' + icon('trash', 14) + '</button></div>',
      '  <div class="admin-form-grid">',
      '    ' + field('İsim', inputHtml('testAuthor-' + i, t.author)),
      '    ' + field('Yıldız (1-5)', inputHtml('testStars-' + i, t.stars, '', 'number')),
      '    ' + field('Rozet / Kaynak', inputHtml('testBadge-' + i, t.badge)),
      '    ' + field('Kaynak', inputHtml('testSource-' + i, t.source)),
      '  </div>',
      '  ' + field('Yorum Metni', textareaHtml('testQuote-' + i, t.quote, 2)),
      '</div>'
    ]);
  }
  function bindTestimonialRow(i) {
    ['testAuthor-' + i, 'testStars-' + i, 'testBadge-' + i, 'testSource-' + i, 'testQuote-' + i].forEach(function (id) {
      on(document.getElementById(id), 'blur', saveTestimonialRow.bind(null, i));
    });
    on(document.getElementById('btnDelTest-' + i), 'click', function () { mutate(function (d) { d.testimonials.splice(i, 1); }); });
  }
  function saveTestimonialRow(i) {
    mutate(function (d) {
      var t = d.testimonials[i];
      t.author = document.getElementById('testAuthor-' + i).value.trim();
      t.stars = Math.max(1, Math.min(5, parseInt(document.getElementById('testStars-' + i).value, 10) || 5));
      t.badge = document.getElementById('testBadge-' + i).value.trim();
      t.source = document.getElementById('testSource-' + i).value.trim();
      t.quote = document.getElementById('testQuote-' + i).value.trim();
    });
  }

  function faqRowHtml(f, i) {
    return lines([
      '<div class="sub-item">',
      '  <div class="item-toolbar"><button type="button" class="action-icon-btn delete" id="btnDelFaq-' + i + '">' + icon('trash', 14) + '</button></div>',
      '  ' + field('Soru', inputHtml('faqQ-' + i, f.question)),
      '  ' + field('Cevap ({{contact.noun}} gibi yer tutucular otomatik doldurulur)', textareaHtml('faqA-' + i, f.answer, 2)),
      '</div>'
    ]);
  }
  function bindFaqRow(i) {
    ['faqQ-' + i, 'faqA-' + i].forEach(function (id) { on(document.getElementById(id), 'blur', saveFaqRow.bind(null, i)); });
    on(document.getElementById('btnDelFaq-' + i), 'click', function () { mutate(function (d) { d.faq.splice(i, 1); }); });
  }
  function saveFaqRow(i) {
    mutate(function (d) {
      d.faq[i].question = document.getElementById('faqQ-' + i).value.trim();
      d.faq[i].answer = document.getElementById('faqA-' + i).value.trim();
    });
  }

  /* ==========================================================================
     HESAP & YAYINLAMA
     ======================================================================== */
  function renderAccount() {
    var root = document.getElementById('accountRoot');
    if (!root) return;
    var cfg = HBSiteData.getGithubConfig() || {};

    root.innerHTML = lines([
      '<div class="admin-card">',
      '  <div class="admin-card-header"><h3 class="admin-card-title">GitHub Bağlantısı</h3><p class="admin-card-sub">Yayınla butonu, site-data.json dosyasını doğrudan GitHub deponuza commit eder. GitHub Actions statik HTML\'i otomatik günceller.</p></div>',
      '  <div class="admin-form-grid">',
      '    ' + field('Depo Sahibi (owner)', inputHtml('ghOwner', cfg.owner, 'kullanici-adi')),
      '    ' + field('Depo Adı (repo)', inputHtml('ghRepo', cfg.repo, 'gusto-organik')),
      '    ' + field('Branch', inputHtml('ghBranch', cfg.branch || 'main')),
      '    ' + field('Personal Access Token', inputHtml('ghToken', cfg.token, 'ghp_xxx', 'password')),
      '  </div>',
      '  <p class="field-hint">Token yalnızca bu tarayıcının localStorage\'ında saklanır, hiçbir sunucuya gönderilmez. "repo" izniyle bir Fine-grained/Classic PAT oluşturun.</p>',
      '  <div class="admin-actions-group">',
      '    <button type="button" class="btn-admin-secondary" id="btnGhVerify">Bağlantıyı Doğrula</button>',
      '    <button type="button" class="btn-admin-danger" id="btnGhDisconnect">Bağlantıyı Kaldır</button>',
      '  </div>',
      '</div>',

      '<div class="admin-card">',
      '  <div class="admin-card-header"><h3 class="admin-card-title">Yayınla</h3></div>',
      '  <p class="admin-card-sub">Tüm değişiklikleriniz (menü, metinler, görseller, saatler) tek seferde yayınlanır.</p>',
      '  <div class="admin-actions-group">',
      '    <button type="button" class="btn-admin-primary" id="btnPublishNow">' + icon('check', 15) + ' Şimdi GitHub\'a Yayınla</button>',
      '    <button type="button" class="btn-admin-secondary" id="btnDownloadJson">JSON Olarak İndir (Manuel Yükleme)</button>',
      '  </div>',
      '  <div class="publish-log" id="publishLog"></div>',
      '</div>',

      '<div class="admin-card">',
      '  <div class="admin-card-header"><h3 class="admin-card-title">Şifremi Değiştir</h3></div>',
      '  <div class="admin-form-grid">',
      '    ' + field('Yeni Şifre', inputHtml('accNewPass1', '', '', 'password')),
      '    ' + field('Yeni Şifre (Tekrar)', inputHtml('accNewPass2', '', '', 'password')),
      '  </div>',
      '  <button type="button" class="btn-admin-primary" id="btnChangePassword">Şifreyi Değiştir</button>',
      '</div>'
    ]);

    on(document.getElementById('btnGhVerify'), 'click', async function () {
      var cfgNow = readGithubForm();
      logPublish('Bağlantı doğrulanıyor…');
      try {
        var result = await HBSiteData.ghVerify(cfgNow);
        if (result.ok) {
          HBSiteData.saveGithubConfig(cfgNow);
          logPublish('✅ Bağlantı doğrulandı: ' + cfgNow.owner + '/' + cfgNow.repo);
          toast('GitHub bağlantısı doğrulandı.');
        } else {
          logPublish('❌ Doğrulama başarısız (HTTP ' + result.status + ')', true);
        }
      } catch (err) {
        logPublish('❌ Hata: ' + err.message, true);
      }
      renderOverview();
    });

    on(document.getElementById('btnGhDisconnect'), 'click', function () {
      HBSiteData.clearGithubConfig();
      toast('GitHub bağlantısı kaldırıldı.');
      renderAccount();
      renderOverview();
    });

    on(document.getElementById('btnPublishNow'), 'click', publishNow);
    on(document.getElementById('btnDownloadJson'), 'click', function () {
      downloadFile('site-data.json', JSON.stringify(state.data, null, 2));
      toast('site-data.json indirildi. GitHub üzerinden data/ klasörüne yükleyebilirsiniz.');
    });

    on(document.getElementById('btnChangePassword'), 'click', async function () {
      var p1 = document.getElementById('accNewPass1').value;
      var p2 = document.getElementById('accNewPass2').value;
      if (p1.length < 10 || !/[a-zA-Z]/.test(p1) || !/[0-9]/.test(p1)) { toast('Şifre en az 10 karakter, harf ve rakam içermeli.', true); return; }
      if (p1 !== p2) { toast('Şifreler eşleşmiyor.', true); return; }
      var salt = randomHex(24);
      var hash = await pbkdf2HashHex(p1, salt, state.auth.iterations || 100000);
      var newAuth = Object.assign({}, state.auth, { salt: salt, hash: hash, lastChanged: new Date().toISOString() });
      var cfgNow = HBSiteData.getGithubConfig();
      if (cfgNow && cfgNow.token) {
        try {
          await HBSiteData.ghPutAuth(cfgNow, JSON.stringify(newAuth, null, 2) + '\n', 'Yönetici şifresi değiştirildi');
          state.auth = newAuth;
          toast('Şifreniz güncellendi ve yayınlandı.');
        } catch (err) {
          toast('Yayınlanamadı: ' + err.message, true);
        }
      } else {
        state.auth = newAuth;
        downloadFile('admin-auth.json', JSON.stringify(newAuth, null, 2));
        toast('Şifreniz değişti. İndirilen dosyayı data/admin-auth.json olarak repoya yükleyin.');
      }
      document.getElementById('accNewPass1').value = '';
      document.getElementById('accNewPass2').value = '';
    });
  }

  function readGithubForm() {
    return {
      owner: document.getElementById('ghOwner').value.trim(),
      repo: document.getElementById('ghRepo').value.trim(),
      branch: document.getElementById('ghBranch').value.trim() || 'main',
      token: document.getElementById('ghToken').value.trim()
    };
  }

  function logPublish(msg, isError) {
    var log = document.getElementById('publishLog');
    if (!log) return;
    var line = document.createElement('div');
    line.className = 'publish-log-line' + (isError ? ' error' : '');
    line.textContent = new Date().toLocaleTimeString('tr-TR') + ' — ' + msg;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  /* ==========================================================================
     YAYINLAMA MANTIĞI — bekleyen (data:) görselleri gerçek dosyaya çevirir
     ======================================================================== */
  function collectPendingUploads(dataClone) {
    var uploads = [];
    function slot(imgRef, hintName) {
      if (imgRef && typeof imgRef.url === 'string' && imgRef.url.indexOf('data:') === 0) {
        var match = /^data:(image\/\w+);base64,(.+)$/.exec(imgRef.url);
        if (!match) return;
        var ext = match[1].split('/')[1] === 'jpeg' ? 'jpg' : match[1].split('/')[1];
        var path = 'images/' + hintName + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '.' + ext;
        uploads.push({ path: path, base64: match[2] });
        imgRef.url = path;
      }
    }
    slot(dataClone.hero.mainImage, 'hero');
    slot(dataClone.about.image, 'about');
    (dataClone.gallery || []).forEach(function (g, i) { slot(g, 'gallery-' + i); });
    return uploads;
  }

  async function publishNow() {
    var cfg = HBSiteData.getGithubConfig();
    var clone = JSON.parse(JSON.stringify(state.data));
    clone.contentVersion = new Date().toISOString();
    var uploads = collectPendingUploads(clone);

    if (!cfg || !cfg.token) {
      downloadFile('site-data.json', JSON.stringify(clone, null, 2));
      uploads.forEach(function (u) {
        downloadFile(u.path.split('/').pop(), atob(u.base64), 'image/webp');
      });
      toast('GitHub bağlı değil. site-data.json ve ' + uploads.length + ' görsel indirildi; lütfen repoya manuel yükleyin.');
      selectTab('tab-account');
      return;
    }

    selectTab('tab-account');
    logPublish('Yayınlama başlıyor… (' + uploads.length + ' yeni görsel)');
    try {
      for (var i = 0; i < uploads.length; i++) {
        logPublish('Görsel yükleniyor: ' + uploads[i].path);
        await HBSiteData.ghPutBinaryFile(cfg, uploads[i].path, uploads[i].base64, 'Görsel eklendi: ' + uploads[i].path);
      }
      logPublish('site-data.json güncelleniyor…');
      await HBSiteData.ghPutFile(cfg, JSON.stringify(clone, null, 2) + '\n', 'İçerik güncellendi (Yönetim Paneli)');
      state.data = clone;
      HBSiteData.clearDraft();
      logPublish('✅ Yayınlandı! GitHub Actions statik HTML\'i birazdan güncelleyecek.');
      toast('Başarıyla yayınlandı.');
      renderAll();
    } catch (err) {
      logPublish('❌ Yayınlama hatası: ' + err.message, true);
      toast('Yayınlama başarısız: ' + err.message, true);
    }
  }

  /* ==========================================================================
     Başlat
     ======================================================================== */
  async function boot() {
    on(document.getElementById('adminLoginForm'), 'submit', handleLoginSubmit);
    on(document.getElementById('firstLoginForm'), 'submit', handleFirstLoginSubmit);

    try {
      state.auth = await fetch('data/admin-auth.json?ts=' + Date.now(), { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('admin-auth.json bulunamadı');
        return r.json();
      });
    } catch (err) {
      document.getElementById('authErrorMsg').textContent = 'Kimlik doğrulama dosyası yüklenemedi. Lütfen sitenin doğru şekilde dağıtıldığından emin olun.';
      document.getElementById('authErrorMsg').style.display = 'block';
      return;
    }

    document.getElementById('adminUsername').value = '';

    var lockState = getLockState();
    if (lockState.lockUntil && Date.now() < lockState.lockUntil) showLockBanner(lockState.lockUntil);

    if (isSessionValid()) {
      await enterAdmin();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
