import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getDashboardCounts, recalculateDashboardCounts } from '../../firebase/data-service.js';
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

function actionCard({ href, title, description, icon }) {
  return `
    <a href="${href}" class="group flex items-center gap-3.5 rounded-2xl border border-slate-200 bg-white p-3.5 transition duration-200 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2">
      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-container)] text-[var(--color-primary)] transition group-hover:scale-105">${icon}</span>
      <span class="min-w-0 flex-1">
        <span class="flex items-center gap-1.5">
          <span class="text-sm font-semibold text-slate-900">${title}</span>
        </span>
        <span class="mt-0.5 block text-xs leading-5 text-slate-500">${description}</span>
      </span>
      <span class="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[var(--color-primary)]">${adminIcons.arrow}</span>
    </a>
  `;
}

function checklistItem({ done, title, description, href, cta }) {
  return `
    <li class="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-start gap-3">
        <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
          ${done ? adminIcons.check : adminIcons.alert}
        </span>
        <div>
          <p class="text-sm font-semibold text-slate-900">${title}</p>
          <p class="mt-0.5 text-xs leading-5 text-slate-500">${description}</p>
        </div>
      </div>
      <a href="${href}" class="inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 ${done ? adminTheme.secondaryBtn : adminTheme.primaryBtn}">
        ${cta}
      </a>
    </li>
  `;
}

function quickLinkTile({ href, title, description, icon }) {
  return `
    <a href="${href}" class="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2">
      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition group-hover:bg-[var(--color-primary-container)] group-hover:text-[var(--color-primary)]">${icon}</span>
      <span class="min-w-0 flex-1">
        <span class="block text-sm font-semibold text-slate-900">${title}</span>
        <span class="mt-0.5 block text-xs leading-5 text-slate-500">${description}</span>
      </span>
      <span class="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[var(--color-primary)]">${adminIcons.arrow}</span>
    </a>
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
    : 'Periode belum diatur';

  container.innerHTML = renderLayout('Dashboard Admin', `
    <div class="space-y-6" id="admin-dashboard-root" aria-busy="true">
      ${adminPageHero({
        eyebrow: 'Panel Admin',
        title: `${getGreeting()}, ${firstName}`,
        description: 'Ringkasan data sekolah dan pintasan pengelolaan dalam satu tempat.',
        chips: [
          `${hasPeriod ? adminIcons.check : adminIcons.alert} ${periodLabel}`,
          `${adminIcons.shield} Administrator`,
        ],
        actions: `
          <a href="${hasPeriod ? '#admin/master-guru' : '#admin/master-tahun-ajaran'}" class="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-xs font-semibold text-sky-700 shadow-sm transition hover:bg-sky-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50">
            ${hasPeriod ? 'Kelola Guru' : 'Atur Tahun Ajaran'}
            ${adminIcons.arrow}
          </a>
        `,
      })}

      <section aria-label="Ringkasan data" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" id="admin-metrics">
        ${adminMetricCard({ label: 'Guru', value: '…', icon: adminIcons.users, tone: 'sky' })}
        ${adminMetricCard({ label: 'Siswa', value: '…', icon: adminIcons.users, tone: 'teal' })}
        ${adminMetricCard({ label: 'Mata Pelajaran', value: '…', icon: adminIcons.book, tone: 'cyan' })}
        ${adminMetricCard({ label: 'Kelas', value: '…', icon: adminIcons.building, tone: 'amber' })}
      </section>

      <section class="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div class="space-y-5">
          ${adminSection({
            title: 'Kelola data',
            description: 'Buka modul pengelolaan yang paling sering dipakai.',
            body: `
              <div class="grid gap-3 sm:grid-cols-2">
                ${actionCard({ href: '#admin/master-tahun-ajaran', title: 'Tahun Ajaran', description: 'Aktifkan periode akademik berjalan.', icon: adminIcons.calendar })}
                ${actionCard({ href: '#admin/master-akademik', title: 'Akademik', description: 'Mata pelajaran dan kelas.', icon: adminIcons.book })}
                ${actionCard({ href: '#admin/master-guru', title: 'Data Guru', description: 'Akun dan profil guru.', icon: adminIcons.users })}
                ${actionCard({ href: '#admin/master-siswa', title: 'Data Siswa', description: 'Data siswa dan penempatan kelas.', icon: adminIcons.users })}
                ${actionCard({ href: '#admin/plotting-jadwal', title: 'Mapping Mengajar', description: 'Relasi guru, mapel, dan kelas.', icon: adminIcons.link })}
                ${actionCard({ href: '#admin/lobi-sekolah', title: 'Lobi Sekolah', description: 'Portal publik sekolah.', icon: adminIcons.building })}
              </div>
            `,
          })}

          ${adminSection({
            title: 'Kesiapan sistem',
            description: 'Langkah dasar agar modul guru dan siswa berjalan.',
            actions: `<span id="setup-score" class="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">Memuat…</span>`,
            body: `<ul class="space-y-3" id="setup-checklist"></ul>`,
          })}
        </div>

        <aside class="space-y-5">
          ${adminSection({
            title: 'Pengaturan',
            description: 'Konfigurasi terpisah agar fokus dan tidak tercampur.',
            body: `
              <div class="space-y-3">
                ${quickLinkTile({ href: '#admin/akun', title: 'Akun & Keamanan', description: 'Ubah username dan password admin.', icon: adminIcons.shield })}
                ${quickLinkTile({ href: '#admin/pengaturan-ai', title: 'Pengaturan AI', description: 'Kredensial dan model AI materi.', icon: adminIcons.spark })}
                ${quickLinkTile({ href: '#admin/pengaturan-backup', title: 'Backup & Ekspor', description: 'Backup Google Drive dan ekspor Excel.', icon: adminIcons.download })}
              </div>
            `,
          })}

          ${adminSection({
            title: 'Data awal',
            description: 'Isi data master contoh. Gunakan hanya saat setup pertama.',
            badge: 'Setup',
            body: `
              <div id="seed-status" class="rounded-2xl border border-sky-100 bg-sky-50/70 px-3 py-3 text-xs text-sky-800" role="status" aria-live="polite">
                Menambahkan data master default. Hindari menjalankan ini pada sistem yang sudah berisi data.
              </div>
              <button id="seed-data-btn" type="button" class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl ${adminTheme.secondaryBtn} px-4 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-60">
                <span id="seed-btn-label">Semai Data Awal</span>
              </button>
            `,
          })}
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

  function renderStats(counts) {
    const guruCount = Number(counts?.jumlah_guru || 0);
    const siswaCount = Number(counts?.jumlah_siswa || 0);
    const mapelCount = Number(counts?.jumlah_mapel || 0);
    const kelasCount = Number(counts?.jumlah_kelas || 0);
    const mappingCount = Number(counts?.jumlah_pengajaran || 0);
    const hasUsers = guruCount > 0 && siswaCount > 0;
    const hasMapping = mappingCount > 0;
    const completed = [hasPeriod, hasUsers, hasMapping].filter(Boolean).length;

    if (metricsEl) {
      metricsEl.innerHTML = [
        adminMetricCard({ label: 'Guru', value: formatNumber(guruCount), hint: guruCount ? '' : 'Belum ada data', icon: adminIcons.users, tone: 'sky' }),
        adminMetricCard({ label: 'Siswa', value: formatNumber(siswaCount), hint: siswaCount ? '' : 'Belum ada data', icon: adminIcons.users, tone: 'teal' }),
        adminMetricCard({ label: 'Mata Pelajaran', value: formatNumber(mapelCount), hint: mapelCount ? '' : 'Belum ada data', icon: adminIcons.book, tone: 'cyan' }),
        adminMetricCard({ label: 'Kelas', value: formatNumber(kelasCount), hint: kelasCount ? '' : 'Belum ada data', icon: adminIcons.building, tone: 'amber' }),
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
          description: hasUsers ? `${formatNumber(guruCount)} guru · ${formatNumber(siswaCount)} siswa` : 'Pastikan akun guru dan siswa tersedia.',
          href: guruCount ? '#admin/master-siswa' : '#admin/master-guru',
          cta: hasUsers ? 'Tinjau' : 'Lengkapi',
        }),
        checklistItem({
          done: hasMapping,
          title: 'Mapping mengajar',
          description: hasMapping ? `${formatNumber(mappingCount)} relasi mengajar tercatat` : 'Diperlukan untuk absensi dan penilaian.',
          href: '#admin/plotting-jadwal',
          cta: hasMapping ? 'Kelola' : 'Buat mapping',
        }),
      ].join('');
    }

    if (setupScoreEl) {
      setupScoreEl.textContent = `${completed}/3 siap`;
      setupScoreEl.className = `rounded-full px-3 py-1 text-xs font-semibold ring-1 ${completed === 3 ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : completed === 0 ? 'bg-rose-50 text-rose-700 ring-rose-100' : 'bg-amber-50 text-amber-700 ring-amber-100'}`;
    }
  }

  async function loadDashboardStats() {
    try {
      // Baca dokumen agregat dashboard_counts (1 read). Bila belum ada / kedaluwarsa,
      // recalculateDashboardCounts memakai .count() aggregation (murah, bukan membaca
      // seluruh dokumen). Tidak ada pembacaan koleksi penuh di dashboard ini.
      const counts = (await getDashboardCounts(context)) || (await recalculateDashboardCounts(context));
      renderStats(counts || {});
      root?.setAttribute('aria-busy', 'false');
    } catch (error) {
      console.error(error);
      if (metricsEl) {
        metricsEl.innerHTML = adminNotice({ text: 'Gagal memuat ringkasan. Periksa koneksi atau login ulang sebagai admin.', tone: 'danger' });
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
