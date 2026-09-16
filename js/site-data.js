/**
 * Gusto Organik — Veri Katmanı
 *
 * • Yayınlanan veriyi (data/site-data.json) getirir.
 * • Panelde yapılan ama henüz yayınlanmamış değişiklikleri tarayıcının
 *   localStorage'ında taslak olarak saklar (KURAL: veri kaybı olmamalı).
 * • Yayınlama, GitHub REST API üzerinden site-data.json dosyasını güncelleyip
 *   commit atar (GitHub Actions bunu statik HTML'e senkronize eder).
 */
(function () {
  'use strict';

  var DRAFT_KEY = 'gusto_draft_site_data_v1';
  var GH_CFG_KEY = 'gusto_github_config_v1';

  function nowIso() { return new Date().toISOString(); }

  async function loadPublished(opts) {
    var bust = opts && opts.bust;
    var url = bust ? 'data/site-data.json?ts=' + Date.now() : 'data/site-data.json';
    var res = await fetch(url, bust ? { cache: 'no-store' } : undefined);
    if (!res.ok) throw new Error('site-data.json okunamadı (HTTP ' + res.status + ')');
    return res.json();
  }

  function loadDraft() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function saveDraft(data) {
    data.contentVersion = nowIso();
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    return data;
  }

  function clearDraft() {
    localStorage.removeItem(DRAFT_KEY);
  }

  function hasDraft() {
    return Boolean(localStorage.getItem(DRAFT_KEY));
  }

  /* ---------- GitHub REST API istemcisi (0 TL yayınlama) ---------- */
  function getGithubConfig() {
    try {
      var raw = localStorage.getItem(GH_CFG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function saveGithubConfig(cfg) {
    localStorage.setItem(GH_CFG_KEY, JSON.stringify(cfg));
  }

  function clearGithubConfig() {
    localStorage.removeItem(GH_CFG_KEY);
  }

  function b64EncodeUnicode(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  async function ghRequest(cfg, path, options) {
    var url = 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + path;
    options = options || {};
    var headers = Object.assign({
      'Authorization': 'Bearer ' + cfg.token,
      'Accept': 'application/vnd.github+json'
    }, options.headers || {});
    var res = await fetch(url, Object.assign({}, options, { headers: headers }));
    return res;
  }

  // Token'ın doğru repoya doğru izinle bağlı olduğunu doğrular
  async function ghVerify(cfg) {
    var res = await ghRequest(cfg, 'data/site-data.json', { method: 'GET' });
    if (res.status === 404) return { ok: true, sha: null };
    if (!res.ok) return { ok: false, status: res.status };
    var json = await res.json();
    return { ok: true, sha: json.sha };
  }

  async function ghPutJson(cfg, repoPath, jsonString, message) {
    var current = await ghRequest(cfg, repoPath, { method: 'GET' });
    var sha = current.ok ? (await current.json()).sha : undefined;

    var body = {
      message: message || 'İçerik güncellendi (Yönetim Paneli)',
      content: b64EncodeUnicode(jsonString),
      branch: cfg.branch || 'main'
    };
    if (sha) body.sha = sha;

    var res = await ghRequest(cfg, repoPath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      var errBody = await res.json().catch(function () { return {}; });
      throw new Error('GitHub API hatası (' + res.status + '): ' + (errBody.message || 'bilinmeyen hata'));
    }
    return res.json();
  }

  async function ghPutFile(cfg, jsonString, message) {
    return ghPutJson(cfg, 'data/site-data.json', jsonString, message);
  }

  async function ghPutAuth(cfg, jsonString, message) {
    return ghPutJson(cfg, 'data/admin-auth.json', jsonString, message || 'Yönetici şifresi güncellendi');
  }

  // Görsel dosyasını (images/xxx.webp) doğrudan repoya commit eder
  async function ghPutBinaryFile(cfg, repoPath, base64Content, message) {
    var current = await ghRequest(cfg, repoPath, { method: 'GET' });
    var sha = current.ok ? (await current.json()).sha : undefined;

    var body = {
      message: message || 'Görsel güncellendi (Yönetim Paneli)',
      content: base64Content,
      branch: cfg.branch || 'main'
    };
    if (sha) body.sha = sha;

    var res = await ghRequest(cfg, repoPath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      var errBody = await res.json().catch(function () { return {}; });
      throw new Error('Görsel yüklenemedi (' + res.status + '): ' + (errBody.message || 'bilinmeyen hata'));
    }
    return res.json();
  }

  window.HBSiteData = {
    loadPublished: loadPublished,
    loadDraft: loadDraft,
    saveDraft: saveDraft,
    clearDraft: clearDraft,
    hasDraft: hasDraft,
    getGithubConfig: getGithubConfig,
    saveGithubConfig: saveGithubConfig,
    clearGithubConfig: clearGithubConfig,
    ghVerify: ghVerify,
    ghPutFile: ghPutFile,
    ghPutAuth: ghPutAuth,
    ghPutJson: ghPutJson,
    ghPutBinaryFile: ghPutBinaryFile
  };
})();
