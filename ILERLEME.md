# İLERLEME — Gusto Organik

Maps linki: https://share.google/ybEyERWvXu7t6y0h0
Başlangıç: 2026-09-16
Son güncelleme: 2026-09-17 00:35

## Durum
**Şu an: FAZ 4/4 — TESLİM**
Sonraki adım: GitHub Pages müşteri adresi (pages.dev TR’de kapalı)

## Faz durumu
- [x] FAZ 0 — Doküman okuma + plan
- [x] FAZ 1 — Araştırma
- [x] FAZ 2 — Üretim
- [x] FAZ 3 — Doğrulama
- [x] FAZ 4 — Teslim raporu

## Karara bağlananlar
| Konu | Karar |
|:--|:--|
| Telefon türü | mobile — 0531 648 86 96, WhatsApp VAR |
| Menü durumu | pending |
| Proje klasörü | gusto-organik |
| Canlı (müşteri, TR) | https://basaranbaran.github.io/gusto-organik/ |
| Cloudflare yedek | https://gustoorganik.pages.dev/ — TR’de Superonline kesiyor |

## Son doğrulama çıktıları
```
node tools/build.mjs --check → Statik HTML güncel
node tools/check-contrast.mjs → tüm oranlar ≥ 4.5
grep admin123 → boş
grep passwordHash data/site-data.json → boş
grep phoneClean data/ → boş
grep googleusercontent → boş
375/1440 taşma yok, JS hatası 0
wrangler pages deploy → 27 dosya
```

## Açık işler / bilinen eksikler
- Menü fiyatları panelden girilecek
- 3. fotoğraf (iç mekân) marka arşivi / eski konum olabilir
- Admin Yayınla = GitHub PAT yok
- TR müşteriye `*.pages.dev` vermeyin. Birincil adres GitHub Pages.

## Yeni oturum için not
`pages.dev` Superonline DNS’inde kesiliyor. Müşteri adresi GitHub Pages: https://basaranbaran.github.io/gusto-organik/ — baranbasaran.com’a bağlanmadan. Bağlar ve Hermana klasörlerine dokunma.
