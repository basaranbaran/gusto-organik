# Teslim Öncesi Kontrol Listesi — Gusto Organik

Kaynak: `site-templateleri/TESLIM-ONCESI-KONTROL-LISTESI.md`. Müşteriye gösterilmez; teslim öncesi iç kontrol.

## A. Güvenlik

- [x] Arka kapı yok. Tek kontrol: hash karşılaştırması (`js/admin.js`).
- [x] README’de düz metin şifre yok.
- [x] Kurulum şifresi sohbette / ayrı kanalda; repoda yok.
- [x] 5 hatalı deneme → 60 sn kilit.
- [x] Şifre değişikliği `data/admin-auth.json` dosyasına commit (`ghPutAuth`). `site-data.json` içine yazılmaz.
- [x] `data/site-data.json` içinde `passwordHash` yok.
- [x] PAT önerisi: tek repo, Contents Read/write.
- [x] Müşteriye `/admin.html` herkese açık, koruma paroladır bilgisi verildi.

## B. İletişim

- [x] `phoneType: mobile`, `hasWhatsapp: true`, WhatsApp numarası Maps’teki 0531 hattı.
- [x] CTA “WhatsApp ile Yaz”, `wa.me/905316488696`. Telefon satırı `tel:+905316488696`.
- [x] `phoneClean` / `whatsappClean` JSON’da yok; `contactVocabulary` hesaplıyor.

## C. İçerik & Panel

- [x] Hero, hakkında, saat, özellik, yorum, SSS, iletişim panelden.
- [x] Menü CRUD (ekle / sil / ad / açıklama / fiyat).
- [x] BUILD işaretçileri + `tools/build.mjs`.
- [x] Cropper WebP dosya olarak `images/` altına commit (`ghPutBinaryFile`).
- [x] `focalX` / `focalY` object-position.

## D. Harita & Bölümler

- [x] Embed `?q=41.1381258,29.0524474(Gusto Organik)&z=17`.
- [x] Koordinat `!3d`/`!4d` (41.1381258, 29.0524474).
- [x] Yol Tarifi + Google’da Gör.
- [x] Panel lat/lng/placeId; embed yeniden kurulur.
- [x] `gorunur()` + görünürlük kutuları; iletişim kilitli.

## E. Saat

- [x] Gece yarısını aşan kapanış yok; tüm günler `c > o`.
- [x] Pazartesi 08:30, Pazar 11:00–18:00 Maps tablosundan.
- [x] `Europe/Istanbul`. Çarşamba 23:30 yerel: “Kapalı — yarın 09:00 açılıyor” doğrulandı.

## F. SEO / GEO

- [x] Canonical `https://gustoorganik.pages.dev/`
- [x] sitemap.xml fragment yok.
- [x] robots.txt admin/tools Disallow.
- [x] Menü HTML’de (JS kapalıyken) görünüyor.
- [x] JSON-LD `GroceryStore`.
- [x] llms.txt JSON ile uyumlu.
- [x] Favicon + og:image.

## G. Görsel kimlik

- [x] Hue 168 teal; Bağlar 28 / Hermana 92 değil.
- [x] `theme.source` yazılı.
- [x] `check-contrast.mjs` tüm oranlar ≥ 4.5.
- [x] Outfit + 16px köşe (modern). Apple cam header.

## H. Visual QA

- [x] 1440: taşma yok, JS hatası yok, başlık görünür.
- [x] 375: taşma yok, CTA ve header okunuyor.
- [x] Admin giriş ekranı teal/GO, açık etiketler.

## I. Bilinen sınırlar

- Menü fiyatları pending.
- 3. galeri fotoğrafı marka arşivi (Maps galerisi oturum duvarına takıldı).
- Admin “Yayınla” GitHub PAT ister; yoksa `wrangler pages deploy`.
- `*.pages.dev` noindex.
