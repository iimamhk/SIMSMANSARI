# AGENTS.md — Instruksi untuk AI Agent

Berkas ini dibaca oleh AI agent yang bekerja pada repo ini. **Patuhi invariant di
bawah.** Bagian "INVARIANT MVP TERLINDUNGI" adalah perilaku inti yang sudah
diuji dan disetujui manusia — **jangan diubah tanpa persetujuan eksplisit dari
pemilik repo**, meski terlihat bisa "dirapikan" atau "dioptimalkan".

---

## INVARIANT MVP TERLINDUNGI (JANGAN DIUBAH TANPA IZIN)

### 1. Sumber data daftar siswa per kelas = `anggota_kelas`
Halaman guru (absensi, nilai, keaktifan, jurnal, kuis, pembayaran, dll)
menampilkan daftar siswa **hanya** dari koleksi `anggota_kelas` melalui
`getClassMembers()` di `src/firebase/data-service.js`. Bukan dari `users`.
Konsekuensi: setiap perubahan status siswa harus tercermin di `anggota_kelas`,
bukan sekadar di `users`.

### 2. Hapus siswa WAJIB cascade ke `anggota_kelas`
`DELETE /api/auth/users` (handler `api/auth/users.js` → `deleteUser()` di
`api/_lib/auth.js`) harus menghapus:
- `users/{username}`
- `usernames/{username}` (termasuk username lama di `previous_usernames`)
- semua dokumen `anggota_kelas` yang cocok pada `siswa_id`, dicocokkan terhadap
  **username, NIS, dan NISN** (dokumen lama sebagian di-key dengan NIS/NISN).

Jika cascade ini dihapus/disederhanakan, siswa yang sudah dihapus akan tetap
muncul di halaman guru (bug yang sudah diperbaiki). Data historis
(`absensi`, `nilai_tugas`, `nilai_ujian`, `keaktifan_siswa`) sengaja TIDAK
dihapus (arsip).

Pembersih data lama: `scripts/cleanup-orphan-memberships.js`
(`npm run cleanup:orphan-members`, dry-run; `-- --apply` untuk hapus).

### 3. Keamanan materi HTML = sanitasi allowlist + iframe sandbox
- Semua HTML materi (AI, Import, Edit) disanitasi dengan allowlist CDN di
  `src/utils/html-sanitizer.js` (klien) dan `src/api/_lib/ai-html-material.js`
  (server). `polyfill.io` diblokir; `<script src>/<link>/<img>/<iframe>` ke host
  di luar allowlist dibuang. Sanitasi dijalankan **otomatis saat simpan/publish**.
- Materi dirender ke siswa/guru di `iframe` ber-`sandbox` **tanpa**
  `allow-same-origin`. Jangan menambahkan `allow-same-origin`.
- Jangan melonggarkan allowlist atau menjadikan sanitasi opsional.

### 4. Edit materi HTML terbit = update in-place
Menyunting materi mode HTML terbit (`#guru/materi-import?edit=<source_id>`)
menyimpan ke dokumen `materi_publish` dengan `id`/`source_id` yang SAMA (via
`savePublishedMaterial`), sehingga versi siswa ikut ter-update tanpa duplikasi.
Jangan mengubahnya menjadi membuat dokumen baru.

---

## Catatan teknis singkat
- Frontend: vanilla JS ES modules, hash router (`src/utils/router.js`).
- Backend: serverless functions di `api/` memakai Firebase Admin SDK
  (`api/_lib/firebase-admin.js`) — melewati Firestore Rules.
- Data: Firestore (project `simsmansari`). Koleksi materi:
  `materi_publish`, `materi_workspace_drafts`, `materi_ai`. `html_source` = HTML,
  `doc_mode` = `'html'` | `'structured'`.
- Kredensial skrip: `server/.env` (`FIREBASE_PROJECT_ID` +
  `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`).
- Kuota Firestore sensitif (paket gratis) — hindari pembacaan koleksi besar
  yang tidak perlu; ada cache in-memory 60 dtk di `data-service.js`.

## Aturan kerja untuk agent
- Sebelum menyentuh alur di atas, baca kode terkait dan konfirmasi ke pemilik.
- Jangan push langsung yang mengubah invariant MVP tanpa izin eksplisit.
