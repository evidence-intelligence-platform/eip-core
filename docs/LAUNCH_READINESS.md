# EIP — SaaS Lansman Hazırlık Değerlendirmesi

**Tarih:** 6 Ağustos 2026
**Kapsam:** `eip-core` (FastAPI ai-engine + Next.js frontend) ve `eif-core-docs` depoları, dosya dosya incelendi.
**Soru:** Son rötuşlara kaç adım kaldı?

---

## 1. Yönetici Özeti

Ürünün çekirdeği sağlam ve **halihazırda Railway üzerinde canlıda**: kimlik doğrulama, zero-trust servis mimarisi, upload doğrulama, rate limiting, CI/CD ve deploy altyapısı üretim kalitesinde; UGC moderasyon katmanı da bugün ekleniyor. Buna karşılık bir SaaS'ı "lansmana hazır" yapan operasyonel katman — e-posta, şifre sıfırlama, hata takibi, otomatik yedekleme, kullanım şartları ve KVKK sayfasında vaat edilen hesap silme akışı — henüz yok. **Kalan lansman engelleyici adım sayısı: 7.** Bunların hepsi S/M eforlu işlerdir; odaklı çalışmayla iki haftada kapatılabilir.

---

## 2. Kriter Tablosu

| # | Kriter | Durum | Kanıt (repoda doğrulanan) | Eksikse ne gerekiyor |
|---|--------|-------|---------------------------|----------------------|
| 1 | Kimlik doğrulama & yetkilendirme | ✅ Hazır | `ai-engine/src/security/jwt.py` (PBKDF2-HMAC-SHA256 + HS256 JWT, tahmin edilebilir varsayılan sır yok), `src/routers/auth.py` (register/login/me; `admin` rolü kayıtta seçilemez), `src/security/permissions.py` (`require_user` / `require_employer` / `require_candidate`), tüm router'lar `verify_api_key` + JWT arkasında | — (Not: token `localStorage`'da tutuluyor — `frontend/src/context/AuthContext.tsx`; XSS'e karşı httpOnly cookie'ye geçiş lansman sonrası iyileştirme) |
| 2 | Veri güvenliği (zero-trust, upload doğrulama) | ✅ Hazır | `X-Internal-API-Key` tüm uçlarda zorunlu (`src/security/auth.py`); anahtar tarayıcıya hiç inmiyor — sunucu taraflı proxy `frontend/src/app/api/eip/[...path]/route.ts`; upload'lar içerik imzasıyla tanınıyor, 5 MB sınır, NUL-byte/binary reddi (`src/services/file_policy.py`); engine'in Railway'de public domain'i yok (`DEPLOY.md`) | — |
| 3 | KVKK & onay yönetimi | 🟡 Kısmen | `frontend/src/app/kvkk/page.tsx` dürüst ve ayrıntılı (Gemini'ye yurt dışı aktarım açıkça yazılı); `consent_verified` şema seviyesinde zorunlu (`src/models/schemas.py`, `src/main.py`); kayıt anında `consent_granted=False` (`src/routers/auth.py:94`) | `ConsentLog` tablosu var (`src/db/models.py:131`) ama **hiçbir yerde satır yazılmıyor** (grep doğrulandı); KVKK metni "hesabınızı sildiğinizde verileriniz silinir" diyor ama **hesap silme endpoint'i/akışı yok** — vaat edilen hak fiilen kullanılamıyor |
| 4 | UGC moderasyonu | ✅ Planlı / bugün ekleniyor | İnceleme anında repoda henüz yok: `review_status` alanı `src/db/models.py` içindeki `Evidence`'ta bulunmuyor, admin router ve admin paneli yok (grep: `review_status|moderation` → 0 sonuç). Katman (Evidence'ta `review_status` + admin API + admin paneli) bugün diğer ajanlarca ekleniyor | Merge sonrası doğrulama: migration'ın çalıştığı, admin uçlarının `admin` rolüyle korunduğu smoke test ile teyit edilmeli |
| 5 | Kalıcı dosya depolama | 🟡 Kısmen | Yüklenen belgeler bellekte işlenip **hiç saklanmıyor**; yalnızca çıkarım sonucu `Evidence` satırı olarak DB'ye yazılıyor (`src/main.py` extract uçları). DB kalıcılığı tamam (docker volume `postgres_data`, Railway managed Postgres) | Bilinçli, gizlilik-dostu bir tasarım; ancak itiraz/denetim ve moderasyon senaryolarında orijinal belge yok. S3/R2 benzeri depolama + saklama süresi kararı verilmeli (lansman sonrası olabilir) |
| 6 | İzleme & health check | 🟡 Kısmen | `/health` public endpoint (`src/main.py:399`), Dockerfile `HEALTHCHECK`, `railway.json` healthcheck ayarları, `scripts/health_check.py` 5 aşamalı tanı CLI'ı | Harici uptime izleme/alarm yok (UptimeRobot/Better Stack vb.); ayrıca `ai-engine/railway.json` healthcheckPath'i `/docs` — `/health` olmalı |
| 7 | Hata takibi (Sentry vb.) | 🔴 Eksik | Kaynak kodda Sentry veya eşdeğeri yok (grep: yalnızca `.venv` gürültüsü) | Backend'e `sentry-sdk[fastapi]`, frontend'e `@sentry/nextjs`; DSN'ler env üzerinden — S eforlu iş |
| 8 | Loglama & audit trail | 🔴 Eksik | `AuditTrail` modeli tanımlı (`src/db/models.py:140`) ama **hiçbir router yazmıyor**; yapılandırılmış log yok (uvicorn varsayılanı; proxy'de yalnız `console.error`) | Kritik aksiyonlara (başvuru, durum değişikliği, extract, moderasyon kararı) AuditTrail satırı yazan bir yardımcı + JSON log formatı |
| 9 | Rate limiting | ✅ Hazır | `slowapi` — varsayılan 60/dk, extract uçları 15/dk (`src/main.py:47,198,255`); `requirements.txt`'te pinli | Not: `get_remote_address` proxy arkasında frontend'in IP'sini görür — limit fiilen global çalışır; `X-Forwarded-For` bazlı key lansman sonrası düzeltilmeli |
| 10 | CI/CD | ✅ Hazır | `.github/workflows/ci.yml`: backend pytest (7 dosyada 33 test) + frontend production build, push/PR tetiklemeli; Railway push→otomatik deploy bağlı | Not: `frontend/src/__tests__/` altında 2 test var ama `package.json`'da test runner yok — CI bunları çalıştırmıyor |
| 11 | Deploy altyapısı (Railway/Docker) | ✅ Hazır | `docker-compose.yml` (3 servis, healthcheck'ler, volume), her iki `Dockerfile`, servis başına `railway.json`, adım adım `DEPLOY.md`; engine boot'ta Alembic migration (`src/db/migrate.py`, idempotent). Platform Railway'de canlı: public frontend, private engine, managed Postgres | — |
| 12 | Veritabanı yedekleme | 🟡 Kısmen | `ai-engine/scripts/backup_db.py` (backup/list/restore/prune, 30 gün saklama) | Elle çalıştırılan CLI; **zamanlanmış otomatik yedek yok**. Railway Postgres yedeklemesi etkinleştirilmeli veya cron'lu pg_dump kurulmalı |
| 13 | Ödeme & abonelik (billing) | 🔴 Eksik | Repoda hiçbir billing kodu yok (grep: stripe/iyzico/paddle/lemon → 0) | İş modeli kararı + sağlayıcı entegrasyonu (Stripe/iyzico), plan/abonelik modeli, webhook'lar — L eforlu iş. Ücretsiz beta ile lansman yapılacaksa engelleyici değil |
| 14 | E-posta bildirimleri | 🔴 Eksik | Hiçbir e-posta gönderimi yok (grep: smtp/sendgrid/resend/mailgun → 0) | Transactional e-posta sağlayıcısı (Resend/Postmark vb.) + hoş geldin, başvuru durumu ve şifre sıfırlama şablonları |
| 15 | Şifre sıfırlama | 🔴 Eksik | `src/routers/auth.py`'de yalnız register/login/me; frontend'de yalnız `/login` ve `/register` sayfaları — "şifremi unuttum" akışı yok | Token üretimi + e-posta ile sıfırlama bağlantısı + yeni şifre sayfası (14 no'lu maddeye bağımlı) |
| 16 | Kullanım analitiği | 🔴 Eksik | Analitik yok (grep: posthog/plausible/analytics → 0) | Gizlilik-dostu bir araç (Plausible/PostHog EU) — KVKK sayfasına da işlenmeli |
| 17 | Yasal sayfalar (KVKK, kullanım şartları) | 🟡 Kısmen | KVKK aydınlatma metni var ve footer'dan bağlantılı (`frontend/src/app/kvkk/page.tsx`, `src/components/Footer.tsx`) | **Kullanım Şartları sayfası yok**; footer'da "Yasal" bölümünde tek bağlantı KVKK. (Çerez banner'ı gerekmiyor: izleme çerezi kullanılmıyor) |
| 18 | Özel alan adı & SSL | 🟡 Kısmen | Railway `*.up.railway.app` domain'i üzerinden HTTPS canlı (SSL Railway tarafından sağlanıyor) | Özel alan adı alınmadı/bağlanmadı; bağlandığında `src/main.py:146`'daki `allow_origins=["http://localhost:3000"]` (proxy mimarisi sayesinde bugün zararsız) gözden geçirilmeli |
| 19 | Seed/demo verisi | ✅ Hazır | `src/db/seed.py`: şirket, kullanıcı, aday, ilan, başvuru ve evidence içeren idempotent seeder (`python -m src.db.seed`) | Prod DB'ye seed çalıştırma opsiyonel ve tek komut |
| 20 | Dokümantasyon | ✅ Hazır | `README.md`, `DEPLOY.md`, özel temalı Swagger `/docs` + ReDoc (`src/main.py:113-141`); `eif-core-docs` deposunda mimari/güvenlik/API/DB şeması dahil 20+ belge | — |

**Özet:** 8 ✅ · 6 🟡 · 6 🔴

---

## 3. Kalan Adımlar

> **Güncelleme — 6 Ağustos 2026, akşam:** Bu listedeki 3. (hesap silme + ConsentLog), 4. (Kullanım Şartları sayfası), 7. (moderasyon katmanı; canlıda uçtan uca doğrulandı) numaralı engelleyiciler ile lansman sonrası listesindeki 8. (AuditTrail fiilen yazılıyor), 14. (rate limit `X-Forwarded-For` bazlı) ve 16. (healthcheck `/health`) numaralı maddeler tamamlandı. **Kalan lansman engelleyici: 4 adım** (1. e-posta altyapısı, 2. şifre sıfırlama, 5. Sentry, 6. otomatik yedekleme) — dördü de harici servis hesabı gerektirir.

> **Güncelleme — 10 Ağustos 2026:** 1. (e-posta altyapısı), 2. (şifre sıfırlama) ve 5. (Sentry) **kod tarafında tamamlandı ve uçtan uca doğrulandı** (gerçek sunucu + Next.js proxy üzerinden: kayıt → bağlantı isteği → sıfırlama → yeni şifreyle giriş; 136 backend + 13 frontend testi yeşil).
> - **E-posta:** `src/services/email_service.py` — Resend, SDK'sız düz HTTPS; `RESEND_API_KEY` yokken e-postalar motor loguna yazılır (sıfırlama bağlantısı dahil), akış dev ortamında da uçtan uca çalışır. Hoş geldin + şifre sıfırlama şablonları hazır.
> - **Şifre sıfırlama:** `/api/v1/auth/forgot-password` + `/reset-password` (tek kullanımlık, 30 dk TTL, SHA-256 saklanan token; hesap-varlığı sızdırmaz; 60 sn cooldown), frontend `/sifremi-unuttum` + `/sifre-sifirla` sayfaları, login'de bağlantı. Migration: `passwordresettoken` tablosu.
> - **Sentry:** backend `sentry-sdk[fastapi]` + frontend `@sentry/nextjs` (instrumentation dosyaları + `global-error.tsx`); DSN env boşken tamamen devre dışı — PII gönderimi kapalı.
> - Ayrıca: frontend testleri Vitest'e taşındı ve CI'a bağlandı; yanlışlıkla commit'lenmiş 104 MB'lık `ai-engine/.venv/` git'ten çıkarıldı (`.gitignore`'a `.venv/` eklendi).
>
> **Erol'un yapması gerekenler** (docs/YAPILACAKLAR.md): Resend hesabı → `RESEND_API_KEY` + `EMAIL_FROM` + `FRONTEND_URL`, Sentry hesabı → iki `SENTRY_DSN`, Railway Postgres yedeklemesi (6. madde — tek kalan engelleyici) ve plan yükseltme. Anahtarlar girildiği an özellikler kendiliğinden aktifleşir; kod değişikliği gerekmez.

### Lansman engelleyici (yapılmadan duyuru yapılmamalı)

1. **Transactional e-posta altyapısı** — (M) Resend/Postmark benzeri bir sağlayıcı bağlanmalı; şifre sıfırlama ve bildirimlerin ön koşulu. Bugün sistemde tek bir e-posta bile gönderilemiyor.
2. **Şifre sıfırlama akışı** — (M) Şifresini unutan kullanıcının bugün hiçbir çaresi yok; süreli token + e-posta bağlantısı + yeni şifre sayfası (1. adıma bağımlı).
3. **KVKK operasyonel bütünlüğü: hesap silme + ConsentLog kaydı** — (M) KVKK sayfası hesap silmede verilerin silineceğini vaat ediyor ama silme akışı yok; ayrıca `ConsentLog` tablosuna hiç kayıt atılmıyor. Yasal vaat ile ürün davranışı eşitlenmeli.
4. **Kullanım Şartları sayfası** — (S) `/kvkk` benzeri bir `/kullanim-sartlari` sayfası + footer bağlantısı; platform-kullanıcı sorumluluk sınırı lansman öncesi yazılı olmalı.
5. **Hata takibi (Sentry)** — (S) Canlıda kullanıcıların gördüğü hataları bugün kimse göremiyor; backend + frontend Sentry kurulumu yarım günlük iş.
6. **Otomatik veritabanı yedekleme** — (S) Gerçek kullanıcı verisi alınmaya başlamadan Railway Postgres yedeklemesi etkinleştirilmeli veya zamanlanmış pg_dump kurulmalı; `backup_db.py` elle çalıştırılan haliyle yeterli değil.
7. **Moderasyon katmanının doğrulanması** — (S) Bugün eklenen `review_status` + admin API + admin paneli merge edildikten sonra migration ve rol korumaları canlıda smoke test ile teyit edilmeli.

### Lansman sonrası (nice-to-have)

8. **AuditTrail'in fiilen yazılması** — (M) Model hazır, kod yok; "kanıta dayalı" konumlanan bir ürün için itibar meselesi. Kurumsal müşteri görüşmeleri başlamadan tamamlanmalı.
9. **Özel alan adı** — (S) `*.up.railway.app` beta için kabul edilebilir; kalıcı marka için domain + Railway custom domain bağlanmalı.
10. **Ödeme & abonelik** — (L) İş modeli netleşince Stripe/iyzico entegrasyonu; ücretsiz beta süresince engelleyici değil, gelir hedefleniyorsa öne çekilmeli.
11. **Kullanım analitiği** — (S) Plausible/PostHog; hangi meslek gruplarının geldiğini görmeden büyüme kararı alınamaz.
12. **Harici uptime izleme + alarm** — (S) `/health`'i dışarıdan yoklayan bir servis ve bildirim kanalı.
13. **Orijinal belge depolama kararı** — (M) İtiraz/denetim ve moderasyon incelemesi için dosyaların (S3/R2) saklanıp saklanmayacağı, saklanacaksa süresiyle birlikte kararlaştırılmalı; KVKK metni buna göre güncellenmeli.
14. **Rate limit anahtarının düzeltilmesi** — (S) Proxy arkasında tüm kullanıcılar tek IP gibi görünüyor; `X-Forwarded-For` bazlı key'e geçilmeli.
15. **Frontend testlerinin CI'a bağlanması** — (S) `src/__tests__/` mevcut ama test runner tanımlı değil; Vitest + CI adımı eklenmeli.
16. **Engine healthcheck path düzeltmesi** — (S) `ai-engine/railway.json` içindeki `/docs` → `/health`.
17. **Prod seed/demo verisi** — (S) Boş vitrinle lansman yapılmamalı; seeder tek komutla çalıştırılabilir durumda.

---

## 4. Önerilen Sıra — 2 Haftalık Plan

**1. Hafta — güvenlik ağı ve kullanıcı akışları**

- **Gün 1–2:** Moderasyon katmanı merge'ünün doğrulanması (adım 7) + Sentry kurulumu (adım 5) + healthcheck path düzeltmesi (adım 16). Canlıya alınan her şeyin artık gözlemlenebilir olması sağlanır.
- **Gün 3–4:** E-posta sağlayıcısı entegrasyonu (adım 1) ve şifre sıfırlama akışı (adım 2) — backend endpoint'leri + frontend sayfaları.
- **Gün 5:** Kullanım Şartları sayfası (adım 4) ve otomatik yedeklemenin etkinleştirilmesi (adım 6).

**2. Hafta — yasal bütünlük ve cila**

- **Gün 6–8:** Hesap silme akışı + ConsentLog kayıtlarının yazılması (adım 3); silme akışı KVKK metniyle birebir uyumlu test edilir.
- **Gün 9:** Harici uptime izleme (adım 12) + prod seed (adım 17) + uçtan uca regresyon: kayıt → başvuru → belge yükleme → moderasyon → rapor.
- **Gün 10:** Lansman. Aynı gün analitik (adım 11) devreye alınır; özel alan adı (adım 9) ve AuditTrail (adım 8) lansmanı takip eden sprint'e planlanır.

> **Sonuç:** Çekirdek ürün ve altyapı hazır, platform canlıda. Lansmanı duyurmadan önce kapatılması gereken **7 adım** var; tamamı S/M eforlu ve iki haftalık odaklı bir çalışmaya sığıyor.
