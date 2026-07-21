import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getCollectionDocs } from '../../firebase/data-service.js';
import { getManagedUsers } from '../../firebase/auth-service.js';
import { seedInitialData } from './seed-data.js';
import {
  adminAccentPanel,
  adminIcons,
  adminMetricCard,
  adminNotice,
  adminPageHero,
  adminSection,
  adminTheme,
  bindAdminLogout,
} from '../../utils/admin-ui.js';

function formatNumber(value) {
  return Number(value || 0).toLocaleString('id-ID');
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 19) return 'Selamat sore';
  return 'Selamat malam';
}

function actionCard({ href, title, description, badge, icon }) {
  return `
    <a href="${href}" class="group relative flex min-h-[128px] flex-col justify-between overflow-hidden rounded-[24px] border border-sky-100/80 bg-white p-4 shadow-[0_14px_34px_-28px_rgba(14,165,233,0.28)] transition duration-200 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_22px_44px_-28px_rgba(14,165,233,0.38)] focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200">
      <div class="flex items-start justify-between gap-3">
        <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-cyan-50 text-sky-600 ring-1 ring-sky-100 transition group-hover:from-sky-500 group-hover:to-cyan-500 group-hover:text-white">
          ${icon}
        </div>
        <span class="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700 ring-1 ring-sky-100">${badge}</span>
      </div>
      <div class="mt-4">
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-semibold text-slate-900">${title}</h3>
          <span class="text-sky-400 transition group-hover:translate-x-0.5 group-hover:text-sky-600">${adminIcons.arrow}</span>
        </div>
        <p class="mt-1 text-xs leading-5 text-slate-500">${description}</p>
      </div>
    </a>
  `;
}

function checklistItem({ done, title, description, href, cta }) {
  return `
    <li class="flex flex-col gap-3 rounded-2xl border border-sky-100/80 bg-gradient-to-br from-white to-sky-50/40 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-start gap-3">
        <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
          ${done ? adminIcons.check : adminIcons.alert}
        </span>
        <div>
          <p class="text-sm font-semibold text-slate-900">${title}</p>
          <p class="mt-0.5 text-xs leading-5 text-slate-500">${description}</p>
        </div>
      </div>
      <a href="${href}" class="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 ${done ? adminTheme.secondaryBtn : adminTheme.primaryBtn}">
        ${cta}
      </a>
    </li>
  `;
}

export async function renderAdminDashboard(container) {
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const context = JSON.parse(localStorage.getItem('simguru_context') || '{}');
  const adminName = session?.user?.nama || session?.user?.username || 'Administrator';
  const firstName = String(adminName).split(' ')[0] || 'Admin';
  const hasPeriod = !!(context.tahun_ajaran_aktif && context.semester_aktif);
  const periodLabel = hasPeriod
    ? `${context.tahun_ajaran_aktif_nama || context.tahun_ajaran_aktif} · ${context.semester_aktif_nama || context.semester_aktif}`
    : 'Periode akademik belum diatur';

  container.innerHTML = renderLayout('Dashboard Admin', `
    <div class="space-y-5" id="admin-dashboard-root" aria-busy="true">
      ${adminPageHero({
        eyebrow: 'Command Center',
        title: `${getGreeting()}, ${firstName}`,
        description: 'Pantau kesiapan sistem, kelola data master, dan selesaikan setup akademik dari satu panel yang ringkas dan segar.',
        chips: [
          `${hasPeriod ? adminIcons.check : adminIcons.alert} ${periodLabel}`,
          `${adminIcons.shield} Role Admin`,
        ],
        actions: `
          <a href="${hasPeriod ? '#admin/master-guru' : '#admin/master-tahun-ajaran'}" class="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-xs font-semibold text-sky-700 shadow-sm transition hover:bg-sky-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50">
            ${hasPeriod ? 'Kelola Master Guru' : 'Atur Tahun Ajaran'}
            ${adminIcons.arrow}
          </a>
        `,
      })}

      <section aria-label="Ringkasan sistem" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" id="admin-metrics">
        ${adminMetricCard({ label: 'Guru', value: '…', hint: 'Memuat data…', icon: adminIcons.users, tone: 'sky' })}
        ${adminMetricCard({ label: 'Siswa', value: '…', hint: 'Memuat data…', icon: adminIcons.users, tone: 'teal' })}
        ${adminMetricCard({ label: 'Mata Pelajaran', value: '…', hint: 'Memuat data…', icon: adminIcons.book, tone: 'violet' })}
        ${adminMetricCard({ label: 'Kelas', value: '…', hint: 'Memuat data…', icon: adminIcons.building, tone: 'amber' })}
      </section>

      <section class="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
        <div class="space-y-4">
          ${adminSection({
            title: 'Operasi harian admin',
            description: 'Aksi cepat 1–2 klik untuk alur setup dan pengelolaan data.',
            badge: 'Quick Actions',
            body: `
              <div class="grid gap-3 sm:grid-cols-2">
                ${actionCard({ href: '#admin/master-tahun-ajaran', title: 'Tahun Ajaran', description: 'Aktifkan periode akademik yang sedang berjalan.', badge: 'Setup', icon: adminIcons.calendar })}
                ${actionCard({ href: '#admin/master-akademik', title: 'Akademik', description: 'Kelola mata pelajaran dan kelas sekolah.', badge: 'Master', icon: adminIcons.book })}
                ${actionCard({ href: '#admin/master-guru', title: 'Master Guru', description: 'Tambah, edit, atau reset akun guru.', badge: 'User', icon: adminIcons.users })}
                ${actionCard({ href: '#admin/master-siswa', title: 'Master Siswa', description: 'Kelola data siswa dan penempatan kelas.', badge: 'User', icon: adminIcons.users })}
                ${actionCard({ href: '#admin/plotting-jadwal', title: 'Mapping Mengajar', description: 'Hubungkan guru, mapel, dan kelas.', badge: 'Relasi', icon: adminIcons.link })}
                ${actionCard({ href: '#admin/lobi-sekolah', title: 'Lobi Sekolah', description: 'Atur portal publik dan tautan sekolah.', badge: 'Portal', icon: adminIcons.building })}
              </div>
            `,
          })}

          ${adminSection({
            title: 'Kesiapan sistem',
            description: 'Checklist setup agar modul guru dan siswa berjalan lancar.',
            badge: 'Checklist',
            actions: `<span id="setup-score" class="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">Memuat…</span>`,
            body: `<ul class="space-y-3" id="setup-checklist"></ul>`,
          })}
        </div>

        <aside class="space-y-4">
          ${adminSection({
            title: 'Seed Data Awal',
            description: 'Isi data master dasar untuk uji coba sistem. Gunakan hanya pada setup awal.',
            badge: 'Bootstrap',
            body: `
              <div id="seed-status" class="rounded-2xl border border-sky-100 bg-sky-50/70 px-3 py-3 text-xs text-sky-800" role="status" aria-live="polite">
                Siap dijalankan. Proses ini menambahkan data master default.
              </div>
              <button id="seed-data-btn" type="button" class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl ${adminTheme.primaryBtn} px-4 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-60">
                <span id="seed-btn-label">Semai Data Awal</span>
              </button>
            `,
          })}

          ${adminSection({
            title: 'Akun Admin',
            description: 'Perbarui password admin secara berkala. Password disimpan terenkripsi di server.',
            badge: 'Security',
            body: `
              <div class="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white px-3 py-3">
                <p class="text-xs text-slate-500">Akun aktif</p>
                <p class="mt-1 text-sm font-semibold text-slate-900">${adminName}</p>
              </div>
              <a href="#admin/pengatur-sistem" class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl ${adminTheme.secondaryBtn} px-4 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200">
                Buka Pengaturan Akun
                ${adminIcons.arrow}
              </a>
            `,
          })}

          <div class="${adminTheme.softCard} p-4 sm:p-5">
            <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700/70">Tips operasional</p>
            <ul class="mt-3 space-y-2 text-xs leading-5 text-slate-600">
              <li class="flex gap-2"><span class="mt-0.5 text-sky-600">${adminIcons.check}</span><span>Atur periode dulu, baru mapping mengajar.</span></li>
              <li class="flex gap-2"><span class="mt-0.5 text-sky-600">${adminIcons.check}</span><span>Buat akun guru sebelum plotting jadwal.</span></li>
              <li class="flex gap-2"><span class="mt-0.5 text-sky-600">${adminIcons.check}</span><span>Hindari seed ulang pada sistem yang sudah beroperasi.</span></li>
            </ul>
          </div>
        </aside>
      </section>
    </div>
  `, { accentPanel: adminAccentPanel() });

  const root = container.querySelector('#admin-dashboard-root');
  const metricsEl = container.querySelector('#admin-metrics');
  const checklistEl = container.querySelector('#setup-checklist');
  const setupScoreEl = container.querySelector('#setup-score');
  const seedBtn = container.querySelector('#seed-data-btn');
  const seedLabel = container.querySelector('#seed-btn-label');
  const seedStatus = container.querySelector('#seed-status');

  const setSeedStatus = (message, tone = 'info') => {
    if (!seedStatus) return;
    seedStatus.outerHTML = adminNotice({ text: message, tone }).replace('<div', '<div id="seed-status" role="status" aria-live="polite"');
  };

  seedBtn?.addEventListener('click', async () => {
    const confirmed = window.confirm('Semai data awal sekarang?\n\nGunakan hanya saat setup pertama agar data operasional tidak tertimpa.');
    if (!confirmed) return;
    seedBtn.disabled = true;
    seedLabel.textContent = 'Menyemai data…';
    setSeedStatus('Proses seed sedang berjalan. Mohon tunggu.', 'info');
    try {
      await seedInitialData();
      setSeedStatus('Data awal berhasil disemai. Ringkasan diperbarui.', 'success');
      await loadDashboardStats();
    } catch (error) {
      console.error(error);
      setSeedStatus(`Gagal menyemai data: ${error?.message || 'Terjadi kesalahan.'}`, 'danger');
    } finally {
      seedBtn.disabled = false;
      seedLabel.textContent = 'Semai Data Awal';
    }
  });

  bindAdminLogout(container);

  async function loadDashboardStats() {
    try {
      const [guruList, siswaList, mapelList, kelasList, pengajaranList] = await Promise.all([
        getManagedUsers('guru').catch(() => []),
        getManagedUsers('siswa').catch(() => []),
        getCollectionDocs('mata_pelajaran').catch(() => []),
        getCollectionDocs('kelas').catch(() => []),
        getCollectionDocs('pengajaran').catch(() => []),
      ]);

      const guruCount = guruList.length;
      const siswaCount = siswaList.length;
      const mapelCount = mapelList.length;
      const kelasCount = kelasList.length;
      const mappingCount = pengajaranList.length;
      const hasUsers = guruCount > 0 && siswaCount > 0;
      const hasMapping = mappingCount > 0;
      const completed = [hasPeriod, hasUsers, hasMapping].filter(Boolean).length;

      if (metricsEl) {
        metricsEl.innerHTML = [
          adminMetricCard({ label: 'Guru', value: formatNumber(guruCount), hint: guruCount ? 'Akun guru aktif di sistem' : 'Belum ada data guru', icon: adminIcons.users, tone: 'sky' }),
          adminMetricCard({ label: 'Siswa', value: formatNumber(siswaCount), hint: siswaCount ? 'Akun siswa terdaftar' : 'Belum ada data siswa', icon: adminIcons.users, tone: 'teal' }),
          adminMetricCard({ label: 'Mata Pelajaran', value: formatNumber(mapelCount), hint: mapelCount ? 'Mapel master tersedia' : 'Belum ada mapel', icon: adminIcons.book, tone: 'violet' }),
          adminMetricCard({ label: 'Kelas', value: formatNumber(kelasCount), hint: kelasCount ? 'Kelas master tersedia' : 'Belum ada kelas', icon: adminIcons.building, tone: 'amber' }),
        ].join('');
      }

      if (checklistEl) {
        checklistEl.innerHTML = [
          checklistItem({
            done: hasPeriod,
            title: 'Periode akademik aktif',
            description: hasPeriod ? periodLabel : 'Belum ada tahun ajaran/semester aktif.',
            href: '#admin/master-tahun-ajaran',
            cta: hasPeriod ? 'Kelola' : 'Atur sekarang',
          }),
          checklistItem({
            done: hasUsers,
            title: 'Data guru & siswa',
            description: hasUsers ? `${formatNumber(guruCount)} guru · ${formatNumber(siswaCount)} siswa` : 'Pastikan akun guru dan siswa sudah tersedia.',
            href: guruCount ? '#admin/master-siswa' : '#admin/master-guru',
            cta: hasUsers ? 'Tinjau' : 'Lengkapi data',
          }),
          checklistItem({
            done: hasMapping,
            title: 'Mapping mengajar',
            description: hasMapping ? `${formatNumber(mappingCount)} relasi mengajar tercatat` : 'Relasi guru–mapel–kelas dibutuhkan untuk absensi dan penilaian.',
            href: '#admin/plotting-jadwal',
            cta: hasMapping ? 'Kelola mapping' : 'Buat mapping',
          }),
        ].join('');
      }

      if (setupScoreEl) {
        setupScoreEl.textContent = `${completed}/3 siap`;
        setupScoreEl.className = `rounded-full px-3 py-1 text-xs font-semibold ring-1 ${completed === 3 ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : completed === 0 ? 'bg-rose-50 text-rose-700 ring-rose-100' : 'bg-amber-50 text-amber-700 ring-amber-100'}`;
      }
      root?.setAttribute('aria-busy', 'false');
    } catch (error) {
      console.error(error);
      if (metricsEl) {
        metricsEl.innerHTML = adminNotice({ text: 'Gagal memuat ringkasan dashboard. Periksa koneksi atau login ulang sebagai admin.', tone: 'danger' });
      }
      if (setupScoreEl) {
        setupScoreEl.textContent = 'Gagal memuat';
        setupScoreEl.className = 'rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-100';
      }
      root?.setAttribute('aria-busy', 'false');
    }
  }

  await loadDashboardStats();
}
