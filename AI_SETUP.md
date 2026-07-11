# AI Setup Guide

Panduan ini menjelaskan cara mengelola integrasi AI pada proyek ini untuk:

- pengembangan lokal
- deploy online di Vercel
- pergantian API key di masa depan
- cara memberi instruksi yang aman ke Copilot atau Kilo

Dokumen ini sengaja menekankan pemisahan antara kode, konfigurasi, dan secret.

## Prinsip Utama

1. Frontend tidak boleh menyimpan atau membaca API key.
2. API key hanya boleh dibaca di backend atau serverless function.
3. File `.env` lokal dan Environment Variables di Vercel adalah dua tempat berbeda, tetapi fungsinya sama: menyimpan secret untuk environment masing-masing.
4. File yang boleh masuk Git hanyalah template seperti `server/.env.example`, bukan secret asli.
5. Endpoint frontend harus tetap memanggil route internal seperti `/api/ai/test-connection` dan `/api/ai/generate-material`.

## Arsitektur Singkat

Alur yang benar untuk fitur AI pada proyek ini:

1. User menekan tombol AI di frontend.
2. Frontend memanggil endpoint internal `/api/ai/*`.
3. Endpoint backend atau Vercel Function membaca env dari environment tempat dia berjalan.
4. Backend meneruskan request ke provider AI.
5. Secret tidak pernah dikirim ke browser.

## Nama Environment Variable yang Didukung Saat Ini

Kode saat ini menerima beberapa nama env sebagai fallback:

- `IAMHC_API_KEY`, `IAMHC_BASE_URL`, `IAMHC_MODEL`
- `GROQ_API_KEY`, `GROQ_BASE_URL`, `GROQ_MODEL`
- `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`

Catatan:

- Untuk proyek ini, yang sedang dipakai sekarang adalah pola `IAMHC_*` dengan nilai Groq.
- Jika ingin lebih rapi di masa depan, Anda dapat menstandarkan ke satu skema saja. Namun saat ini tidak wajib karena loader sudah menerima beberapa alias.

## Setup Lokal

File lokal yang dipakai:

- `server/.env`

Langkah setup lokal:

1. Salin `server/.env.example` menjadi `server/.env` jika file `.env` belum ada.
2. Isi API key, base URL, dan model yang ingin dipakai.
3. Jalankan backend lokal.
4. Tes endpoint:
   - `/api/health`
   - `/api/ai/test-connection`

Contoh isi lokal untuk Groq:

```dotenv
IAMHC_API_KEY=gsk_xxx_ganti_dengan_key_asli
IAMHC_BASE_URL=https://api.groq.com/openai/v1
IAMHC_MODEL=llama-3.3-70b-versatile
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5500,http://127.0.0.1:5500
RATE_LIMIT_MAX=20
RATE_LIMIT_WINDOW_MS=900000
PORT=3000
```

## Setup Online di Vercel

Secret online tidak dibaca dari file `.env` lokal. Secret online dibaca dari Vercel Environment Variables.

Langkah setup online:

1. Buka project di Vercel.
2. Masuk ke `Settings > Environment Variables`.
3. Tambahkan env yang dipakai proyek.
4. Simpan perubahan.
5. Lakukan redeploy.
6. Tes endpoint:
   - `/api/health`
   - `/api/ai/test-connection`

Contoh nilai untuk Vercel jika memakai Groq:

```text
IAMHC_API_KEY=<API_KEY_ASLI>
IAMHC_BASE_URL=https://api.groq.com/openai/v1
IAMHC_MODEL=llama-3.3-70b-versatile
RATE_LIMIT_MAX=20
RATE_LIMIT_WINDOW_MS=900000
```

Opsional:

```text
ALLOWED_ORIGINS=https://simsmansari.vercel.app
```

## Cara Ganti API Key Lokal

Jika Anda ingin mengganti API key untuk development lokal:

1. Buka `server/.env`.
2. Ganti nilai `IAMHC_API_KEY` atau nama env lain yang sedang Anda pakai.
3. Simpan file.
4. Restart backend lokal jika diperlukan.
5. Tes lagi `/api/ai/test-connection`.
6. Jika key lama sudah tidak dipakai, revoke key lama di dashboard provider.

## Cara Ganti API Key Online

Jika Anda ingin mengganti API key untuk production atau preview di Vercel:

1. Buka Vercel project.
2. Masuk ke `Settings > Environment Variables`.
3. Ubah env key yang dipakai, misalnya `IAMHC_API_KEY`.
4. Simpan perubahan.
5. Redeploy deployment terbaru.
6. Tes `/api/health` dan `/api/ai/test-connection`.
7. Setelah key baru berhasil, revoke key lama di dashboard provider.

## Aturan Aman Saat Memakai Copilot atau Kilo

Agent seperti Copilot atau Kilo boleh membantu Anda mengubah kode dan menjelaskan perubahan konfigurasi, tetapi secret tidak boleh dikirim lewat chat model.

Aturan yang aman:

1. Biarkan agent menjelaskan file mana yang harus diubah.
2. Jika butuh API key baru, masukkan key langsung ke `server/.env` di komputer Anda sendiri atau langsung ke dashboard Vercel.
3. Jangan tempel secret asli ke percakapan jika tidak benar-benar perlu.
4. Jangan commit `.env` ke Git.

## Pola Instruksi yang Disarankan Untuk Copilot atau Kilo

### Jika ingin mengganti key lokal

Gunakan perintah seperti ini:

```text
Rapikan konfigurasi AI lokal proyek ini. Jelaskan env mana yang dipakai backend, file mana yang perlu saya ubah, dan verifikasi endpoint test-connection. Jangan commit .env dan jangan minta saya menaruh secret di kode frontend.
```

### Jika ingin mengganti key online

Gunakan perintah seperti ini:

```text
Bantu saya update konfigurasi AI production. Tunjukkan env Vercel yang harus saya ubah, cek apakah kode membaca env itu, dan beri langkah verifikasi setelah redeploy. Jangan commit secret dan jangan pindahkan API key ke frontend.
```

### Jika ingin migrasi provider

Gunakan perintah seperti ini:

```text
Migrasikan integrasi AI proyek ini ke provider baru tanpa mengubah frontend jika tidak perlu. Pertahankan endpoint /api/ai/*, update loader env, update .env.example, dan berikan langkah rotasi key lokal dan Vercel.
```

## Yang Harus Dijelaskan Agent Saat Mengubah Konfigurasi

Saat Copilot atau Kilo membantu konfigurasi AI, agent sebaiknya menjelaskan:

1. env mana yang dibaca backend
2. file mana yang menjadi template dokumentasi
3. apakah perubahan hanya untuk lokal, hanya online, atau keduanya
4. apakah perlu restart server lokal
5. apakah perlu redeploy Vercel
6. endpoint apa yang harus dites setelah perubahan

## Checklist Verifikasi Setelah Perubahan Key

### Lokal

1. `server/.env` terisi benar
2. backend lokal restart
3. `/api/health` menunjukkan `configured: true`
4. `/api/ai/test-connection` berhasil

### Online

1. env di Vercel sudah diperbarui
2. redeploy selesai
3. `/api/health` menunjukkan `configured: true`
4. `/api/ai/test-connection` berhasil
5. key lama sudah direvoke bila tidak dipakai lagi

## Catatan Penting Keamanan

Jika API key pernah muncul di chat, screenshot, commit, atau tempat lain yang tidak aman, anggap key tersebut sudah terekspos dan lakukan rotasi.

## File Terkait di Proyek Ini

- `server/.env`
- `server/.env.example`
- `server/src/config/env.ts`
- `src/api/_lib/ai.js`
- `src/api/health.js`
- `src/api/ai/test-connection.js`
- `src/api/ai/generate-material.js`