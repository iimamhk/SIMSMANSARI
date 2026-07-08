import { renderLoginPage } from '../pages/login.js';
import { renderPublicHomePage } from '../pages/public-home.js';
import { renderPublicLobbyDetailPage } from '../pages/public-lobby-detail.js';
import { renderAdminDashboard } from '../pages/admin/dashboard.js';
import { renderAdminLobbySchoolPage } from '../pages/admin/lobi-sekolah.js';
import { renderSystemSettingsPage } from '../pages/admin/pengatur-sistem.js';
import { renderGuruDashboard } from '../pages/guru/dashboard.js';
import { renderGuruInputAbsenPage } from '../pages/guru/input-absen.js';
import { renderGuruPenilaianPage } from '../pages/guru/penilaian.js';
import { renderGuruMateriPage } from '../pages/guru/materi.js';
import { renderGuruSystemSettingsPage } from '../pages/guru/pengatur-sistem.js';
import { renderGuruGamePage } from '../pages/guru/game.js';
import { renderSiswaDashboardPage } from '../pages/siswa/dashboard.js';
import { renderSiswaNilaiPage } from '../pages/siswa/nilai.js';
import { renderSiswaAbsensiPage } from '../pages/siswa/absensi.js';
import { renderSiswaMateriPage } from '../pages/siswa/materi.js';
import { renderSiswaSystemSettingsPage } from '../pages/siswa/pengatur-sistem.js';
import { renderSiswaGamePage } from '../pages/siswa/game.js';
import { renderGuruKuizPage } from '../pages/guru/kuiz.js';
import { renderSiswaKuizPage } from '../pages/siswa/kuiz.js';
import { renderMasterGuruPage } from '../pages/admin/master-guru.js';
import { renderMasterSiswaPage } from '../pages/admin/master-siswa.js';
import { renderMasterAkademikPage } from '../pages/admin/master-akademik.js';
import { renderMasterTahunAjaranPage } from '../pages/admin/master-tahun-ajaran.js';
import { renderPlottingJadwalPage } from '../pages/admin/plotting-jadwal.js';
import { renderMasterPembelajaranPage } from '../pages/admin/master-pembelajaran.js';

function getSession() {
  const raw = localStorage.getItem('simguru_session');
  return raw ? JSON.parse(raw) : null;
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

function renderRoute() {
  const route = resolveRoute(window.location.hash);
  const container = document.getElementById('app');

  if (!container) {
    return;
  }

  if (route === '#home') {
    renderPublicHomePage(container);
    return;
  }

  if (route.startsWith('#lobi/')) {
    renderPublicLobbyDetailPage(container, route.replace('#lobi/', ''));
    return;
  }

  if (route === '#admin/dashboard') {
    renderAdminDashboard(container);
    return;
  }

  if (route === '#admin/pengatur-sistem') {
    renderSystemSettingsPage(container);
    return;
  }

  if (route === '#admin/master-guru') {
    renderMasterGuruPage(container);
    return;
  }

  if (route === '#admin/master-siswa') {
    renderMasterSiswaPage(container);
    return;
  }

  if (route === '#admin/master-akademik') {
    renderMasterAkademikPage(container);
    return;
  }

  if (route === '#admin/master-tahun-ajaran') {
    renderMasterTahunAjaranPage(container);
    return;
  }

  if (route === '#admin/plotting-jadwal') {
    renderPlottingJadwalPage(container);
    return;
  }

  if (route === '#admin/master-pembelajaran') {
    renderMasterPembelajaranPage(container);
    return;
  }

  if (route === '#admin/lobi-sekolah' || route.startsWith('#admin/lobi-sekolah/')) {
    renderAdminLobbySchoolPage(container);
    return;
  }

  if (route === '#guru/dashboard') {
    renderGuruDashboard(container);
    return;
  }

  if (route === '#guru/input-absen') {
    renderGuruInputAbsenPage(container);
    return;
  }

  if (route === '#guru/input-nilai') {
    renderGuruPenilaianPage(container);
    return;
  }

  if (route === '#guru/penilaian') {
    renderGuruPenilaianPage(container);
    return;
  }

  if (route === '#guru/materi') {
    renderGuruMateriPage(container);
    return;
  }

  if (route === '#guru/game') {
    renderGuruGamePage(container);
    return;
  }

  if (route === '#guru/kuiz') {
    renderGuruKuizPage(container);
    return;
  }

  if (route === '#guru/pengatur-sistem') {
    renderGuruSystemSettingsPage(container);
    return;
  }

  if (route === '#siswa/dashboard') {
    renderSiswaDashboardPage(container);
    return;
  }

  if (route === '#siswa/nilai') {
    renderSiswaNilaiPage(container);
    return;
  }

  if (route === '#siswa/absensi') {
    renderSiswaAbsensiPage(container);
    return;
  }

  if (route === '#siswa/materi') {
    renderSiswaMateriPage(container);
    return;
  }

  if (route === '#siswa/game') {
    renderSiswaGamePage(container);
    return;
  }

  if (route === '#siswa/kuiz') {
    renderSiswaKuizPage(container);
    return;
  }

  if (route === '#siswa/pengatur-sistem') {
    renderSiswaSystemSettingsPage(container);
    return;
  }

  renderLoginPage(container);
}

window.addEventListener('hashchange', renderRoute);
window.addEventListener('DOMContentLoaded', renderRoute);
