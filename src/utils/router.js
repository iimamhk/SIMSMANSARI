import { initHeaderClock, initSidebarToggle } from '../layouts/dashboard-layout.js';
import { renderLoginPage } from '../pages/login.js';
import { renderPublicHomePage } from '../pages/public-home.js';
import { renderPublicLobbyDetailPage } from '../pages/public-lobby-detail.js';
import { renderAdminDashboard } from '../pages/admin/dashboard.js';
import { renderAdminLobbySchoolPage } from '../pages/admin/lobi-sekolah.js';
import { renderSystemSettingsPage } from '../pages/admin/pengatur-sistem.js';
import { renderGuruDashboard } from '../pages/guru/dashboard.js';
import { renderGuruInputAbsenPage } from '../pages/guru/input-absen.js';
import { renderGuruKeaktifanPage } from '../pages/guru/keaktifan.js';
import { renderGuruJurnalPage } from '../pages/guru/jurnal.js';
import { renderGuruPenilaianPage } from '../pages/guru/penilaian.js';
import { renderGuruMateriPage } from '../pages/guru/materi-workspace.js';
import { renderGuruMateriAiPage } from '../pages/guru/materi-ai.js';
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
import { waitForAuthReady } from '../firebase/auth-service.js';
import { maybeShowBackupReminder } from '../utils/backup-reminder.js';

function getSession() {
  const raw = localStorage.getItem('simguru_session');
  const session = raw ? JSON.parse(raw) : null;
  return session?.firebase_uid || session?.emergency_local ? session : null;
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

  if ((normalized.startsWith('#admin') || normalized.startsWith('#guru')) && !session) {
    return '#login';
  }

  if (normalized.startsWith('#admin') && role !== 'admin') {
    return getDefaultRouteByRole(role);
  }

  if (normalized.startsWith('#guru') && role !== 'guru') {
    return getDefaultRouteByRole(role);
  }

  if (normalized.startsWith('#siswa') && role !== 'siswa') {
    return getDefaultRouteByRole(role);
  }

  return normalized;
}

async function renderRoute() {
  const requestedHash = window.location.hash || '#home';
  const isProtectedRoute = requestedHash.startsWith('#admin')
    || requestedHash.startsWith('#guru')
    || requestedHash.startsWith('#siswa');
  const activeSession = getSession();
  const bypassAuthReady = Boolean(activeSession?.emergency_local);
  if (isProtectedRoute && !bypassAuthReady && !(await waitForAuthReady())) {
    localStorage.removeItem('simguru_session');
    localStorage.removeItem('simguru_wali');
    if (window.location.hash !== '#login') {
      window.location.hash = '#login';
      return;
    }
  }

  const route = resolveRoute(window.location.hash);
  const container = document.getElementById('app');

  const renderAndFinalize = async (renderer, ...args) => {
    await renderer(...args);
    initHeaderClock(container);
    initSidebarToggle(container);
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

  if (route === '#admin/pengatur-sistem') {
    await renderAndFinalize(renderSystemSettingsPage, container);
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

  if (route === '#guru/materi-ai') {
    await renderAndFinalize(renderGuruMateriAiPage, container);
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

function showBootstrapError(error) {
  const container = document.getElementById('app');
  const message = error instanceof Error ? error.message : String(error || 'Kesalahan tidak diketahui.');
  console.error('SIM SMANSARI gagal memuat halaman:', error);
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

window.addEventListener('error', (event) => {
  if (event.error) showBootstrapError(event.error);
});
window.addEventListener('unhandledrejection', (event) => showBootstrapError(event.reason));
window.addEventListener('hashchange', () => renderRoute().catch(showBootstrapError));
window.addEventListener('DOMContentLoaded', () => renderRoute().catch(showBootstrapError));
