# Gusto Organik — Web Sitesi

Tarabya, Sarıyer’de hizmet veren **Gusto Organik** için **0 TL sunucu maliyetli**, admin panelli, satışa hazır statik web sitesi.

## Mimari

- **Statik site**: Sunucu yok, veritabanı yok. `index.html` + `css/` + `js/` + `images/`.
- **Tek doğruluk kaynağı**: Tüm içerik `data/site-data.json` içindedir.
- **Admin panel** (`admin.html`): Tarayıcıdan menü, fiyat, saat, görsel, metin, yorum ve SSS yönetimi. Değişiklikler GitHub REST API üzerinden `data/site-data.json` dosyasına commit edilir.
- **Kimlik bilgisi**: Şifre hash’i `data/admin-auth.json` içindedir (PBKDF2-SHA256). Düz metin parola **hiçbir dosyada yoktur**.
- **GitHub Actions** (`.github/workflows/sync-content.yml`): `site-data.json` her değiştiğinde `tools/build.mjs` çalışır; `index.html`, `sitemap.xml`, `llms.txt` güncellenir.
- **İzomorfik şablonlar** (`js/shared-templates.js`): Tarayıcı ve Node aynı HTML’i üretir.

## Yerel önizleme

Dosyayı çift tıklayarak açmak çalışmaz (`fetch` kısıtı). HTTP sunucusu gerekir:

```bash
python3 -m http.server 8080
```

- Site: `http://localhost:8080/`
- Panel: `http://localhost:8080/admin.html`

## Canlı yayın (GitHub Pages — Türkiye)

`*.pages.dev` Türkiye’de Superonline DNS’inde takılıyor; müşteriye o adresi vermeyin.

Müşteri adresi: **https://basaranbaran.github.io/gusto-organik/**

Kendi `baranbasaran.com` alan adına gerek yok. Cloudflare yönlendirmesi de gerekmez: `pages.dev` zaten açılmadığı için oradan yönlenmez. Gerçek işletme alan adı bağlanınca `seo.siteUrl` / `canonical` güncellenir.

### Cloudflare Pages (yurt dışı / yedek)

Aynı klasör hâlâ Cloudflare Pages’te durabilir; Türkiye’deki müşteri için birincil adres GitHub Pages’tir.

## Admin paneli

1. `admin.html` adresine gidin.
2. Kullanıcı adı ve **geçici şifre** teslimatta **ayrı kanaldan** iletilir (bu dosyada yoktur).
3. İlk girişte sistem **zorunlu şifre değişikliğine** yönlendirir (en az 10 karakter, harf + rakam).
4. GitHub’a yayın için **Hesap & Yayınlama** sekmesinden fine-grained PAT bağlayın:
   - İzin: yalnızca bu depo, **Contents: Read and write**
   - Token tarayıcınızın `localStorage`’ında kalır; sunucuya gitmez
5. Token olmadan da **JSON Olarak İndir** ile yedek yol vardır.

### Güvenlik notları

- `/admin.html` herkese açıktır; koruma katmanı paroladır (istemci tarafı PBKDF2). Ekstra koruma için Cloudflare Access önerilir.
- 5 hatalı girişte panel 60 saniye kilitlenir.
- Şifre değişikliği `data/admin-auth.json` dosyasına commit edilir; `site-data.json` içinde hash yayınlanmaz.

## Bilinen sınırlar

1. **Menü fiyatları henüz yok.** Yorumlardan ürün grupları var; fiyat uydurulmadı. Panel → Menü & Fiyatlar’dan girin. Sitede “Fiyat için yazın” görünür.
2. **Resmi web sitesi Maps kartında yok.** SSL’si bozuk eski bir alan adı kullanılmadı.
3. **Alan adı henüz yok.** Placeholder: `https://gustoorganik.pages.dev`
4. **Google puanı (4,8 / 30)** otomatik güncellenmez; panelden siz güncellersiniz.
5. **Mobil hat.** İletişim WhatsApp + telefon. Sabit hat yoktur.
6. **Üçüncü galeri fotoğrafı** markanın eski reyon arşivinden; cephe fotoğrafları güncel Maps kaydındandır.

## Klasör yapısı

```
gusto-organik/
├── index.html
├── admin.html
├── robots.txt, sitemap.xml, llms.txt
├── css/   style.css, admin.css
├── js/    shared-templates.js, site-data.js, app.js, admin.js, cropper.js
├── data/  site-data.json, admin-auth.json
├── images/
├── tools/ build.mjs, check-contrast.mjs
└── .github/workflows/sync-content.yml
```

## Doğrulama

```bash
node tools/build.mjs
node tools/build.mjs --check
node tools/check-contrast.mjs
```
