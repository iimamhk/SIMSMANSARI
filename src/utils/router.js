import { initHeaderClock, initSidebarToggle } from '../layouts/dashboard-layout.js';
import { renderLoginPage } from '../pages/login.js';
import { renderPublicHomePage } from '../pages/public-home.js';
import { renderPublicLobbyDetailPage } from '../pages/public-lobby-detail.js';
import { renderAdminDashboard } from '../pages/admin/dashboard.js';
import { renderAdminLobbySchoolPage } from '../pages/admin/lobi-sekolah.js';
import { renderAdminAiSettingsPage } from '../pages/admin/pengaturan-ai.js';
import { renderAdminBackupSettingsPage } from '../pages/admin/pengaturan-backup.js';
import { renderAdminAccountPage } from '../pages/admin/akun.js';
import { renderGuruDashboard } from '../pages/guru/dashboard.js';
import { renderGuruInputAbsenPage } from '../pages/guru/input-absen.js';
import { renderGuruKeaktifanPage } from '../pages/guru/keaktifan.js';
import { renderGuruJurnalPage } from '../pages/guru/jurnal.js';
import { renderGuruPenilaianPage } from '../pages/guru/penilaian.js';
import { renderGuruMateriPage } from '../pages/guru/materi-workspace.js';
import { renderGuruMateriAiPage } from '../pages/guru/materi-ai.js';
import { renderGuruMateriImportPage } from '../pages/guru/materi-import.js';
import { renderGuruPptAiPage } from '../pages/guru/ppt-ai.js';
import { renderGuruSystemSettingsPage } from '../pages/guru/pengatur-sistem.js';
import { renderGuruGamePage } from '../pages/guru/game.js';
import { renderGuruPengumumanPage } from '../pages/guru/pengumuman.js';
import { renderSiswaDashboardPage } from '../pages/siswa/dashboard.js';
import { renderSiswaNilaiPage } from '../pages/siswa/nilai.js';
import { renderSiswaAbsensiPage } from '../pages/siswa/absensi.js';
import { renderSiswaMateriPage } from '../pages/siswa/materi.js';
import { renderSiswaSystemSettingsPage } from '../pages/siswa/pengatur-sistem.js';
import { renderSiswaGamePage } from '../pages/siswa/game.js';
import { renderSiswaPengumumanPage } from '../pages/siswa/pengumuman.js';
import { renderGuruKuizPage } from '../pages/guru/kuiz.js';
import { renderGuruPembayaranBukuPage } from '../pages/guru/pembayaran-buku.js';
import { renderGuruWaliKelasPage } from '../pages/guru/wali-kelas.js';
import { renderGuruPlottingJadwalPage } from '../pages/guru/plotting-jadwal.js';
import { renderGuruKasKelasPage } from '../pages/guru/wali/kas-kelas.js';
import { renderSiswaKuizPage } from '../pages/siswa/kuiz.js';
import { renderSiswaKasKelasPage } from '../pages/siswa/kas-kelas.js';
import { renderGuruRpmAiPage } from '../pages/guru/rpm-ai.js';
import { renderGuruBackupPage } from '../pages/guru/backup.js';
import { renderChatListPage } from '../pages/chat/list.js';
import { renderChatRoomPage } from '../pages/chat/room.js';
import { renderMasterGuruPage } from '../pages/admin/master-guru.js';
import { renderMasterSiswaPage } from '../pages/admin/master-siswa.js';
import { renderMasterAkademikPage } from '../pages/admin/master-akademik.js';
import { renderMasterTahunAjaranPage } from '../pages/admin/master-tahun-ajaran.js';
import { renderPlottingJadwalPage } from '../pages/admin/plotting-jadwal.js';
import { renderMasterPembelajaranPage } from '../pages/admin/master-pembelajaran.js';
import { renderAdminWaliKelasPage } from '../pages/admin/wali-kelas.js';
import { logoutCurrentUser, waitForAuthReady } from '../firebase/auth-service.js';
import { auth } from '../firebase/firebase-config.js';
import { maybeShowBackupReminder } from '../utils/backup-reminder.js';


function getSession() {
  const raw = localStorage.getItem('simguru_session');
  const session = raw ? JSON.parse(raw) : null;
  return session?.firebase_uid || session?.emergency_local ? session : null;
}

// Fix #1: simpan & pulihkan halaman terakhir agar cold start (mis. "clear recent"
// di Android) tidak selalu melempar pengguna kembali ke lobi.
const LAST_ROUTE_KEY = 'simguru_last_route';

function isRestorableRoute(hash) {
  const h = String(hash || '');
  return h.startsWith('#admin')
    || h.startsWith('#guru')
    || h.startsWith('#siswa')
    || h.startsWith('#chat');
}

function persistLastRoute(hash) {
  if (!isRestorableRoute(hash)) return;
  try {
    localStorage.setItem(LAST_ROUTE_KEY, String(hash));
  } catch {
    // Abaikan kegagalan localStorage.
  }
}

function readLastRoute() {
  try {
    return localStorage.getItem(LAST_ROUTE_KEY) || '';
  } catch {
    return '';
  }
}

function clearLastRoute() {
  try {
    localStorage.removeItem(LAST_ROUTE_KEY);
  } catch {
    // Abaikan kegagalan localStorage.
  }
}

/**
 * Fix #2: tentukan apakah rute terproteksi boleh dirender, tanpa langsung
 * menghapus sesi hanya karena Firebase Auth sesaat belum siap.
 * - 'ok'      : sesi Firebase pulih/valid.
 * - 'offline' : tidak bisa verifikasi (jaringan mati) tetapi ada sesi lokal;
 *               pertahankan sesi supaya tidak logout paksa.
 * - 'login'   : online namun Firebase benar-benar tidak punya sesi → perlu login.
 */
async function resolveProtectedRouteAuth(session) {
  if (auth?.currentUser) return 'ok';

  let user = await waitForAuthReady();
  if (user) return 'ok';

  // Cold start: beri beberapa kesempatan singkat untuk pemulihan sesi dari
  // IndexedDB / inisialisasi SDK yang belum selesai.
  for (let attempt = 0; attempt < 3 && !user; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    user = auth?.currentUser || (await waitForAuthReady());
  }
  if (user) return 'ok';

  const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  if (session && !online) return 'offline';

  return 'login';
}

function getDefaultRouteByRole(role) {
  if (role === 'admin') {
    return '#admin/dashboard';
  }
  if (role === 'guru') {
    return '#guru/dashboard';
  }
  if (role === 'siswa') {
    return '#siswa/dashboard';
  }
  return '#home';
}

function resolveRoute(hash) {
  const normalized = hash || '#home';
  const session = getSession();
  const role = session?.user?.role || 'guest';

  // Cocokkan otorisasi berdasarkan path saja (abaikan query string ?a=b).
  const pathOnly = normalized.split('?')[0];

  if ((pathOnly.startsWith('#admin') || pathOnly.startsWith('#guru')) && !session) {
    return '#login';
  }

  if (pathOnly.startsWith('#admin') && role !== 'admin') {
    return getDefaultRouteByRole(role);
  }

  if (pathOnly.startsWith('#guru') && role !== 'guru') {
    return getDefaultRouteByRole(role);
  }

  if (pathOnly.startsWith('#siswa') && role !== 'siswa') {
    return getDefaultRouteByRole(role);
  }

  return normalized;
}

/** Ambil query string dari hash rute (mis. "#guru/materi-ai?draft=x") sebagai URLSearchParams. */
function parseRouteQuery(route) {
  const idx = String(route || '').indexOf('?');
  if (idx === -1) return new URLSearchParams();
  try {
    return new URLSearchParams(String(route).slice(idx + 1));
  } catch {
    return new URLSearchParams();
  }
}

/**
 * Pasang satu handler logout terpusat pada container aplikasi. Layout setiap
 * halaman mengganti isi container, tetapi event delegation ini tetap aktif dan
 * menangkap tombol #logout-btn baru tanpa setup khusus per halaman.
 */
function initGlobalLogout(container) {
  if (!container || container.dataset.globalLogoutReady === 'true') return;
  container.dataset.globalLogoutReady = 'true';
  let loggingOut = false;

  container.addEventListener('click', async (event) => {
    const button = event.target.closest?.('#logout-btn');
    if (!button || loggingOut) return;

    event.preventDefault();
    // Cegah handler logout lama milik halaman berjalan bersamaan.
    event.stopImmediatePropagation();
    loggingOut = true;
    button.disabled = true;

    await logoutCurrentUser();
    clearLastRoute();
    window.location.hash = '#login';
    loggingOut = false;
  }, true);
}

async function renderRoute() {
  const requestedHash = window.location.hash || '#home';
  const isProtectedRoute = requestedHash.startsWith('#admin')
    || requestedHash.startsWith('#guru')
    || requestedHash.startsWith('#siswa');
  const activeSession = getSession();
  const bypassAuthReady = Boolean(activeSession?.emergency_local);
  if (isProtectedRoute && !bypassAuthReady) {
    const decision = await resolveProtectedRouteAuth(activeSession);
    if (decision === 'login') {
      // Hanya hapus sesi bila memang benar-benar logout (online + tidak ada sesi
      // Firebase). Cold start yang berhasil dipulihkan atau kondisi offline tidak
      // lagi menghapus sesi, sehingga pengguna tidak diminta login berulang.
      localStorage.removeItem('simguru_session');
      localStorage.removeItem('simguru_wali');
      clearLastRoute();
      if (window.location.hash !== '#login') {
        window.location.hash = '#login';
        return;
      }
    }
    // 'ok' / 'offline' → lanjutkan render tanpa memaksa login.
  }

  const route = resolveRoute(window.location.hash);
  persistLastRoute(route);
  const container = document.getElementById('app');

  if (container) initGlobalLogout(container);

  const renderAndFinalize = async (renderer, ...args) => {
    await renderer(...args);
    initHeaderClock(container);
    initSidebarToggle(container);
    // Hanya pengingat (murni localStorage + satu panggilan HTTP ringan yang
    // di-throttle 6 jam). Dua "cron tiruan" yang dulu ada di sini —
    // maybeRunScheduledBackup dan maybeRunGuruAutoBackup — sudah dibuang karena
    // keduanya memicu pembacaan Firestore berskala besar pada SETIAP perpindahan
    // halaman, yang menghabiskan kuota baca harian. Backup otomatis kini
    // dijalankan GitHub Actions setiap Minggu dini hari.
    maybeShowBackupReminder();
  };


  if (!container) {
    return;
  }

  if (typeof container.routeCleanup === 'function') {
    try {
      await container.routeCleanup();
    } finally {
      container.routeCleanup = null;
    }
  }

  if (route === '#home') {
    await renderAndFinalize(renderPublicHomePage, container);
    return;
  }

  if (route.startsWith('#lobi/')) {
    await renderAndFinalize(renderPublicLobbyDetailPage, container, route.replace('#lobi/', ''));
    return;
  }

  if (route === '#admin/dashboard') {
    await renderAndFinalize(renderAdminDashboard, container);
    return;
  }

  if (route === '#admin/pengaturan-ai') {
    await renderAndFinalize(renderAdminAiSettingsPage, container);
    return;
  }

  if (route === '#admin/pengaturan-backup') {
    await renderAndFinalize(renderAdminBackupSettingsPage, container);
    return;
  }

  if (route === '#admin/akun') {
    await renderAndFinalize(renderAdminAccountPage, container);
    return;
  }

  if (route === '#admin/pengatur-sistem') {
    // Halaman pengaturan lama kini dipecah menjadi tiga halaman terpisah.
    // Arahkan tautan/bookmark lama ke Pengaturan AI.
    window.location.hash = '#admin/pengaturan-ai';
    return;
  }

  if (route === '#admin/master-guru') {
    await renderAndFinalize(renderMasterGuruPage, container);
    return;
  }

  if (route === '#admin/master-siswa') {
    await renderAndFinalize(renderMasterSiswaPage, container);
    return;
  }

  if (route === '#admin/master-akademik') {
    await renderAndFinalize(renderMasterAkademikPage, container);
    return;
  }

  if (route === '#admin/master-tahun-ajaran') {
    await renderAndFinalize(renderMasterTahunAjaranPage, container);
    return;
  }

  if (route === '#admin/plotting-jadwal') {
    await renderAndFinalize(renderPlottingJadwalPage, container);
    return;
  }

  if (route === '#admin/master-pembelajaran') {
    await renderAndFinalize(renderMasterPembelajaranPage, container);
    return;
  }

  if (route === '#admin/wali-kelas') {
    await renderAndFinalize(renderAdminWaliKelasPage, container);
    return;
  }

  if (route === '#admin/lobi-sekolah' || route.startsWith('#admin/lobi-sekolah/')) {
    await renderAndFinalize(renderAdminLobbySchoolPage, container);
    return;
  }

  if (route === '#guru/dashboard') {
    await renderAndFinalize(renderGuruDashboard, container);
    return;
  }

  if (route === '#guru/input-absen') {
    await renderAndFinalize(renderGuruInputAbsenPage, container);
    return;
  }

  if (route === '#guru/keaktifan') {
    await renderAndFinalize(renderGuruKeaktifanPage, container);
    return;
  }

  if (route === '#guru/input-nilai') {
    await renderAndFinalize(renderGuruPenilaianPage, container);
    return;
  }

  if (route === '#guru/jurnal') {
    await renderAndFinalize(renderGuruJurnalPage, container);
    return;
  }

  if (route === '#guru/penilaian') {
    await renderAndFinalize(renderGuruPenilaianPage, container);
    return;
  }

  if (route === '#guru/materi') {
    await renderAndFinalize(renderGuruMateriPage, container);
    return;
  }

  if (route === '#guru/materi-ai' || route.startsWith('#guru/materi-ai?')) {
    const params = parseRouteQuery(route);
    await renderAndFinalize(renderGuruMateriAiPage, container, {
      draftId: params.get('draft') || '',
      publishedId: params.get('published') || '',
    });
    return;
  }

  if (route === '#guru/materi-import') {
    await renderAndFinalize(renderGuruMateriImportPage, container);
    return;
  }

  if (route === '#guru/ppt-ai') {
    await renderAndFinalize(renderGuruPptAiPage, container);
    return;
  }

  if (route === '#guru/game') {
    await renderAndFinalize(renderGuruGamePage, container);
    return;
  }

  if (route === '#guru/kuiz') {
    await renderAndFinalize(renderGuruKuizPage, container);
    return;
  }

  if (route === '#guru/pembayaran-buku') {
    await renderAndFinalize(renderGuruPembayaranBukuPage, container);
    return;
  }

  if (route === '#guru/pengatur-sistem') {
    await renderAndFinalize(renderGuruSystemSettingsPage, container);
    return;
  }

  if (route === '#guru/wali-kelas') {
    await renderAndFinalize(renderGuruWaliKelasPage, container);
    return;
  }

  if (route === '#guru/kas-kelas') {
    await renderAndFinalize(renderGuruKasKelasPage, container);
    return;
  }

  if (route === '#guru/pengumuman') {
    await renderAndFinalize(renderGuruPengumumanPage, container);
    return;
  }

  if (route === '#guru/rpm-ai') {
    await renderAndFinalize(renderGuruRpmAiPage, container);
    return;
  }

  if (route === '#guru/backup') {
    await renderAndFinalize(renderGuruBackupPage, container);
    return;
  }

  if (route === '#guru/plotting-jadwal') {
    await renderAndFinalize(renderGuruPlottingJadwalPage, container);
    return;
  }

  if (route === '#siswa/dashboard') {
    await renderAndFinalize(renderSiswaDashboardPage, container);
    return;
  }

  if (route === '#siswa/nilai') {
    await renderAndFinalize(renderSiswaNilaiPage, container);
    return;
  }

  if (route === '#siswa/absensi') {
    await renderAndFinalize(renderSiswaAbsensiPage, container);
    return;
  }

  if (route === '#siswa/materi') {
    await renderAndFinalize(renderSiswaMateriPage, container);
    return;
  }

  if (route === '#siswa/game') {
    await renderAndFinalize(renderSiswaGamePage, container);
    return;
  }

  if (route === '#siswa/kuiz') {
    await renderAndFinalize(renderSiswaKuizPage, container);
    return;
  }

  if (route === '#siswa/kas-kelas') {
    await renderAndFinalize(renderSiswaKasKelasPage, container);
    return;
  }

  if (route === '#siswa/pengumuman') {
    await renderAndFinalize(renderSiswaPengumumanPage, container);
    return;
  }

  if (route === '#siswa/pengatur-sistem') {
    await renderAndFinalize(renderSiswaSystemSettingsPage, container);
    return;
  }

  if (route.startsWith('#chat/room/')) {
    await renderAndFinalize(renderChatRoomPage, container, route.replace('#chat/room/', ''));
    return;
  }

  if (route === '#chat') {
    await renderAndFinalize(renderChatListPage, container);
    return;
  }

  await renderAndFinalize(renderLoginPage, container);
}

/**
 * Kegagalan non-fatal yang tidak boleh mengosongkan aplikasi.
 * Cache IndexedDB Firestore gagal saat beberapa tab terbuka, tetapi Firestore
 * otomatis memakai memory cache sehingga aplikasi tetap berfungsi normal.
 */
function isNonFatalError(error) {
  const text = String(error?.message || error || '');
  const code = String(error?.code || '');
  return code === 'failed-precondition'
    || code === 'unimplemented'
    || /persistence layer|indexeddb|multi-tab|Failed to obtain exclusive access/i.test(text);
}

function showBootstrapError(error) {
  console.error('SIM SMANSARI:', error);
  if (isNonFatalError(error)) return;
  // Setelah halaman pertama berhasil dirender, error lanjutan hanya dicatat di
  // Console. Mengganti seluruh UI karena satu rejection membuat aplikasi
  // terasa "gagal dimuat" padahal masih bisa dipakai.
  if (window.__SIM_APP_READY__ === true) return;
  const container = document.getElementById('app');
  const message = error instanceof Error ? error.message : String(error || 'Kesalahan tidak diketahui.');
  if (container) {
    container.innerHTML = `
      <main class="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <section class="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
          <h1 class="text-lg font-bold text-rose-700">Aplikasi gagal dimuat</h1>
          <p class="mt-2 text-sm text-slate-600">Muat ulang halaman. Jika masalah berlanjut, periksa pesan error di Console browser.</p>
          <pre class="mt-4 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-3 text-xs text-rose-200">${String(message).replace(/[<>&]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[character]))}</pre>
          <button type="button" class="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" onclick="location.reload()">Muat ulang</button>
        </section>
      </main>`;
  }
}

const bootRoute = () => renderRoute()
  .then(() => { window.__SIM_APP_READY__ = true; })
  .catch(showBootstrapError);

/**
 * Fix #1 (lanjutan): pada cold start, URL WebView dimuat ulang tanpa hash
 * sehingga jatuh ke lobi (#home). Bila ada sesi aktif dan halaman terakhir
 * tersimpan, kembalikan pengguna ke halaman itu alih-alih ke lobi.
 */
function bootWithRouteRestore() {
  const current = window.location.hash || '';
  if (!current || current === '#' || current === '#home') {
    const saved = readLastRoute();
    if (saved && getSession()) {
      window.location.hash = saved; // memicu hashchange → bootRoute
      return;
    }
  }
  bootRoute();
}

window.addEventListener('error', (event) => {
  if (event.error) showBootstrapError(event.error);
});
window.addEventListener('unhandledrejection', (event) => showBootstrapError(event.reason));
window.addEventListener('hashchange', bootRoute);
window.addEventListener('DOMContentLoaded', bootWithRouteRestore);
