# Lansman Öncesi Yapılacaklar — Erol'un Listesi

> Son güncelleme: 10 Ağustos 2026. Kod tarafı hazır (bkz. [LAUNCH_READINESS.md](LAUNCH_READINESS.md));
> aşağıdaki adımlar harici hesaplar gerektirdiği için elle yapılmalı.
>
> **10 Ağustos itibarıyla entegrasyon kodları da yazıldı:** e-posta servisi, şifre
> sıfırlama akışı ve Sentry kurulumu repoda hazır ve test edilmiş durumda. Artık
> "Claude entegrasyonu yazar" beklemek yok — aşağıdaki hesapları açıp anahtarları
> Railway Variables'a girdiğin an özellikler kendiliğinden çalışmaya başlar:
> - Resend → ai-engine servisine `RESEND_API_KEY`, `EMAIL_FROM` ve `FRONTEND_URL`
>   (frontend'in public adresi)
> - Sentry → ai-engine'e `SENTRY_DSN` (Python projesi); frontend'e `SENTRY_DSN` +
>   `NEXT_PUBLIC_SENTRY_DSN` (Next.js projesi)
>
> Anahtar girilmediği sürece hiçbir şey bozulmaz: e-postalar motor loguna yazılır
> (şifre sıfırlama bağlantısı logdan alınabilir), Sentry sessizce devre dışı kalır.

## 1. Alan adı satın al (diğer adımların ön koşulu)

- Nereden: [Porkbun](https://porkbun.com) veya [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/)
- Maliyet: `.com` için yılda ~10-12 $
- Neden önce bu: e-posta servisi kendi alan adından gönderim için DNS doğrulaması istiyor;
  alan adı olmadan yalnızca test adresinden e-posta gönderilebilir.

## 2. Resend hesabı aç (transactional e-posta)

- Nereden: https://resend.com — ücretsiz katman: 3.000 e-posta/ay (100/gün)
- Yapılacak: hesap aç → Domains bölümünde alan adını ekle → verilen DNS kayıtlarını
  (SPF/DKIM) alan adı panelinden gir → doğrulanınca API anahtarı üret
- Anahtarı Railway'de frontend DEĞİL **eip-core** servisinin Variables bölümüne
  `RESEND_API_KEY` adıyla gir (sohbete yapıştırma!)
- Alternatif (EU veri yerleşimi istenirse): Brevo (300/gün ücretsiz) — kod sağlayıcıdan
  bağımsız yazılacak, geçiş tek dosya.

## 3. Sentry hesabı aç (hata takibi)

- Nereden: https://sentry.io — Developer planı kalıcı ücretsiz (5.000 hata/ay)
- Yapılacak: hesap aç → iki proje oluştur (Python/FastAPI + Next.js) → iki DSN'i
  Railway'de ilgili servislerin Variables bölümüne `SENTRY_DSN` adıyla gir

## 4. Cloudflare hesabı + R2 (veritabanı yedekleme)

> **Kod tarafı 10 Ağustos'ta bitti.** `.github/workflows/backup.yml` her gece
> 03:00 UTC'de gerçek bir `pg_dump` alıp R2'ye yüklüyor, 30 günden eskileri
> siliyor. Sadece aşağıdaki hesap ve secret'lar eksik; onlar girilene kadar iş
> akışı **kasıtlı olarak hata verir** — sessizce atlamaz, çünkü çalışmadığı fark
> edilmeyen bir yedekleme hiç olmamasından kötüdür.

- Nereden: https://dash.cloudflare.com — R2 depolama 10 GB'a kadar ücretsiz
- Yapılacak: hesap aç → R2 → bucket oluştur (örn. `eip-db-backups`) →
  "Manage R2 API Tokens" ile **Object Read & Write** yetkili token üret

Sonra GitHub'da `Settings → Secrets and variables → Actions` altına beş secret:

| Secret | Nereden alınır |
|---|---|
| `DATABASE_URL` | Railway → Postgres → Connect → **public/proxy** bağlantı dizesi |
| `R2_ACCOUNT_ID` | Cloudflare panelinin sağ üstündeki Account ID |
| `R2_ACCESS_KEY_ID` | R2 API token'ının key id'si |
| `R2_SECRET_ACCESS_KEY` | R2 API token'ının secret'ı |
| `R2_BUCKET` | Bucket adı, ör. `eip-db-backups` |

Girdikten sonra Actions sekmesinden **Database backup → Run workflow** ile elle bir
kez çalıştırıp yeşil olduğunu görün.

**Üç uyarı:**

1. `DATABASE_URL` bu **public** repoda secret olarak duracak. Secret'lar fork
   PR'larına verilmez ve iş akışı yalnızca zamanlanmış/elle tetiklenir, ama yine de
   o dizenin yetkisi "veriyi okuyabilir" olmalı, "veritabanının sahibi" değil.
   Bunun için hazır script var — Railway Postgres'e bir kez, superuser ile:

   ```bash
   psql "$ADMIN_DATABASE_URL" -v pw="'uzun-rastgele-bir-parola'"         -f ai-engine/scripts/create_backup_role.sql
   ```

   Sonra `DATABASE_URL` secret'ını sahibin değil bu rolün dizesinden kurun:
   `postgresql://eip_backup:<parola>@<host>:<port>/<db>`

   Rol yalnızca SELECT alır; INSERT ve CREATE TABLE denemeleri reddedilir.
   Alembic'in ileride ekleyeceği tablolar da otomatik kapsanır (default
   privileges) — yoksa migration sonrası ilk yedek yeni tabloyu sessizce atlardı.
2. `PG_MAJOR` iş akışında `16` olarak sabit. **Railway Postgres'i yükseltirseniz
   burayı da yükseltin** — istemci sunucudan yeniyse aldığı dump geri yüklenirken
   sunucunun tanımadığı ayarlar yüzünden reddedilir. (Bu, kurulum sırasında
   birebir yaşandı ve test edildi.)
3. GitHub, public repolarda 60 gün hareketsizlik sonrası zamanlanmış iş akışlarını
   devre dışı bırakır. Repo hareketsiz kalırsa Actions sekmesinden yeniden etkinleştirin.

## 5. Railway planını yükselt

- Şu an **trial** plandasın — kredi bitince servisler durur
- Yapılacak: Railway panel → Account → Plans → **Hobby** (~5 $/ay)

## 6. Prod'da admin hesabı ata (5 dakika, hemen yapılabilir)

```bash
railway ssh --service eip-core -- python scripts/promote_admin.py tascierol24@gmail.com
```

- Önce sitede bu e-postayla kayıt olmuş olman gerekir; komuttan sonra çıkış yapıp
  tekrar giriş yap — Moderasyon paneli navbar'da belirir.

## 7. (İsteğe bağlı) Prod'a demo verisi yükle

```bash
railway ssh --service eip-core -- python -m src.db.seed
```

- Boş vitrinle lansman yapmamak için; seeder dolu veritabanını atlar, güvenlidir.

---

## Sıra önerisi

1 → 2 → 3 → 4 → 5 aynı gün bitebilir (~1-2 saat); 6 ve 7 bağımsız, hemen yapılabilir.
Hesaplar açıldıkça Claude şunları kodlar: şifre sıfırlama akışı, e-posta bildirimleri,
Sentry SDK bağlantıları, yedekleme servisi kurulumu.

Lansman sonrası gündem: iyzico/PayTR (ödeme), kullanım analitiği (Plausible/PostHog),
harici uptime izleme.
