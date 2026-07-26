import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getDashboardCounts, recalculateDashboardCounts, getDocumentsWhere, getActiveTeachingAssignments } from '../../firebase/data-service.js';
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
    <a href="${href}" class="group flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2">
      <div class="flex items-center justify-between gap-3">
        <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-primary-container)] text-[var(--color-primary)] transition group-hover:scale-105">${icon}</span>
        <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">${badge}</span>
      </div>
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-semibold text-slate-900">${title}</h3>
          <span class="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[var(--color-primary)]">${adminIcons.arrow}</span>
        </div>
        <p class="mt-1 text-xs leading-5 text-slate-500">${description}</p>
      </div>
    </a>
  `;
}

function checklistItem({ done, title, description, href, cta }) {
  return `
    <li class="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-start gap-3">
        <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
          ${done ? adminIcons.check : adminIcons.alert}
        </span>
        <div>
          <p class="text-sm font-semibold text-slate-900">${title}</p>
          <p class="mt-0.5 text-xs leading-5 text-slate-500">${description}</p>
        </div>
      </div>
      <a href="${href}" class="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 ${done ? adminTheme.secondaryBtn : adminTheme.primaryBtn}">
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
        ${adminMetricCard({ label: 'Mata Pelajaran', value: '…', hint: 'Memuat data…', icon: adminIcons.book, tone: 'cyan' })}
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

          ${adminSection({
            title: 'Backup Data',
            description: 'Ekspor laporan absensi dan nilai seluruh guru dalam format Excel (.xlsx).',
            badge: 'Export',
            body: `
              <div id="backup-status" class="rounded-2xl border border-sky-100 bg-sky-50/70 px-3 py-3 text-xs text-sky-800" role="status" aria-live="polite">
                Siap dijalankan. Proses ini mengekspor data seluruh guru ke file Excel.
              </div>
              <button id="backup-excel-btn" type="button" class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl ${adminTheme.primaryBtn} px-4 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-60">
                Backup Excel (.xlsx)
              </button>
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

  const backupBtn = container.querySelector('#backup-excel-btn');
  const backupStatus = container.querySelector('#backup-status');

  const setBackupStatus = (message, tone = 'info') => {
    if (!backupStatus) return;
    backupStatus.outerHTML = adminNotice({ text: message, tone }).replace('<div', '<div id="backup-status" role="status" aria-live="polite"');
  };

  async function ensureXlsxLoaded() {
    if (window.XLSX) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Gagal memuat library Excel.'));
      document.head.appendChild(script);
    });
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function fetchAllDocuments(collectionName, filters = []) {
    const docs = [];
    let page = null;
    do {
      const options = { limit: 500 };
      if (page) options.after = page;
      const result = await getManagedUsers('siswa');
      const filtered = result.filter(item => item.role === 'siswa');
      if (filters.length === 0) {
        docs.push(...filtered);
        break;
      }
      docs.push(...filtered.filter(item => filters.every(f => {
        if (f.operator === '==') return item[f.field] === f.value;
        return true;
      })));
      break;
    } while (false);
    return docs;
  }

  backupBtn?.addEventListener('click', async () => {
    if (!backupBtn || !backupStatus) return;
    const original = backupBtn.innerHTML;
    backupBtn.disabled = true;
    backupBtn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4"></path></svg> Membuat backup...';
    setBackupStatus('Menyiapkan data backup...', 'info');

    try {
      await ensureXlsxLoaded();

      const ctx = getStoredContext() || {};
      const year = ctx.tahun_ajaran_aktif || '2026_2027';
      const semester = ctx.semester_aktif || '2026_2027_1';

      const assignments = await getActiveTeachingAssignments(ctx);
      if (!assignments.length) {
        throw new Error('Tidak ada data pengajaran/pembelajaran.');
      }

      const kelasIds = [...new Set(assignments.map(a => a.kelas_id))];
      const siswaMap = {};
      for (const kelasId of kelasIds) {
        const students = await getManagedUsers('siswa');
        siswaMap[kelasId] = students.filter(s => s.kelas_id === kelasId);
      }

      const guruIds = [...new Set(assignments.map(a => a.guru_id))];
      const [absensiDocs, tugasDocs, ujianDocs, babDocs, tugasBabDocs, uhKolomDocs] = await Promise.all([
        Promise.all(guruIds.map(guruId => getDocumentsWhere('absensi', [
          { field: 'guru_id', value: guruId },
          { field: 'tahun_ajaran_id', value: year },
          { field: 'semester_id', value: semester },
        ]))).then(arrs => arrs.flat()),
        Promise.all(guruIds.map(guruId => getDocumentsWhere('nilai_tugas', [
          { field: 'guru_id', value: guruId },
          { field: 'tahun_ajaran_id', value: year },
          { field: 'semester_id', value: semester },
        ]))).then(arrs => arrs.flat()),
        Promise.all(guruIds.map(guruId => getDocumentsWhere('nilai_ujian', [
          { field: 'guru_id', value: guruId },
          { field: 'tahun_ajaran_id', value: year },
          { field: 'semester_id', value: semester },
        ]))).then(arrs => arrs.flat()),
        Promise.all(guruIds.map(guruId => getDocumentsWhere('bab', [
          { field: 'guru_id', value: guruId },
          { field: 'tahun_ajaran_id', value: year },
          { field: 'semester_id', value: semester },
        ]))).then(arrs => arrs.flat()),
        Promise.all(guruIds.map(guruId => getDocumentsWhere('tugas_bab', [
          { field: 'guru_id', value: guruId },
          { field: 'tahun_ajaran_id', value: year },
          { field: 'semester_id', value: semester },
        ]))).then(arrs => arrs.flat()),
        Promise.all(guruIds.map(guruId => getDocumentsWhere('ulangan_harian_kolom', [
          { field: 'guru_id', value: guruId },
          { field: 'tahun_ajaran_id', value: year },
          { field: 'semester_id', value: semester },
        ]))).then(arrs => arrs.flat()),
      ]);

      const workbook = window.XLSX.utils.book_new();

      const addSheet = (name, rows, opts = {}) => {
        const ws = window.XLSX.utils.aoa_to_sheet(rows);
        if (opts.widths && opts.widths.length) {
          ws['!cols'] = opts.widths.map(w => ({ wch: w }));
        }
        const range = window.XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
        for (let r = 0; r < (opts.headerRows || 1); r++) {
          for (let c = range.s.c; c <= range.e.c; c++) {
            const ref = window.XLSX.utils.encode_cell({ r, c });
            if (!ws[ref]) continue;
            ws[ref].s = {
              font: { bold: true, color: { rgb: 'FFFFFF' } },
              fill: { fgColor: { rgb: '1F4E79' } },
              alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            };
          }
        }
        if (opts.freezeHeader) {
          ws['!freeze'] = { xSplit: 0, ySplit: opts.headerRows || 1, topLeftCell: `A${(opts.headerRows || 1) + 1}`, activePane: 'bottomLeft', state: 'frozen' };
        }
        window.XLSX.utils.book_append_sheet(workbook, ws, name.replace(/[[\]:?*\/\\]/g, '').slice(0, 100));
      };

      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      addSheet('Ringkasan', [
        ['Field', 'Nilai'],
        ['Waktu Backup', timestamp],
        ['Total Guru', guruIds.length],
        ['Total Assignment', assignments.length],
      ], { widths: [28, 48], headerRows: 1 });

      const assignmentsByGuru = assignments.reduce((acc, a) => {
        (acc[a.guru_id] = acc[a.guru_id] || []).push(a);
        return acc;
      }, {});

      for (const [guruId, guruAssignments] of Object.entries(assignmentsByGuru)) {
        const guruName = guruAssignments[0].guru_nama || `Guru-${guruId}`;
        const mapelName = guruAssignments[0].mapel_nama || 'Mapel';
        const sheetName = `${guruName} (${mapelName})`;

        for (const assignment of guruAssignments.sort((a, b) => String(a.kelas_nama || '').localeCompare(String(b.kelas_nama || '')))) {
          const kelasNama = assignment.kelas_nama || assignment.kelas_id || 'Unknown';
          const pengajaranId = assignment.id;
          const siswaList = siswaMap[assignment.kelas_id] || [];
          const absensi = absensiDocs.filter(a => a.pengajaran_id === pengajaranId);
          const nilaiTugas = tugasDocs.filter(n => n.pengajaran_id === pengajaranId);
          const nilaiUjian = ujianDocs.filter(n => n.pengajaran_id === pengajaranId);
          const bab = babDocs.filter(b => b.pengajaran_id === pengajaranId);
          const tugasBab = tugasBabDocs.filter(t => t.pengajaran_id === pengajaranId);
          const uhKolom = uhKolomDocs.filter(uh => uh.pengajaran_id === pengajaranId);

          const sortedSiswa = siswaList.sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || '')));

          const rekapRows = [['No', 'Nama Siswa', 'Hadir', 'Sakit', 'Izin', 'Alpa', 'Total', '%']];
          const rekapMap = {};
          absensi.forEach(a => {
            if (!rekapMap[a.siswa_id]) rekapMap[a.siswa_id] = { nama: a.siswa_nama, H: 0, S: 0, I: 0, A: 0, Total: 0 };
            rekapMap[a.siswa_id][a.status]++;
            rekapMap[a.siswa_id].Total++;
          });
          let no = 1;
          sortedSiswa.forEach(s => {
            const d = rekapMap[s.id] || { nama: s.nama, H: 0, S: 0, I: 0, A: 0, Total: 0 };
            const pct = d.Total > 0 ? `${((d.H / d.Total) * 100).toFixed(1)}%` : '0%';
            rekapRows.push([no++, d.nama, d.H, d.S, d.I, d.A, d.Total, pct]);
          });
          const totalH = Object.values(rekapMap).reduce((s, r) => s + r.H, 0);
          const totalS = Object.values(rekapMap).reduce((s, r) => s + r.S, 0);
          const totalI = Object.values(rekapMap).reduce((s, r) => s + r.I, 0);
          const totalA = Object.values(rekapMap).reduce((s, r) => s + r.A, 0);
          const totalAll = Object.values(rekapMap).reduce((s, r) => s + r.Total, 0);
          const pctAll = totalAll > 0 ? `${((totalH / totalAll) * 100).toFixed(1)}%` : '0%';
          rekapRows.push(['', 'Total', totalH, totalS, totalI, totalA, totalAll, pctAll]);
          addSheet(`Rekap - ${kelasNama} (${guruId.slice(0,8)})`, rekapRows, { widths: [6, 30, 10, 10, 10, 10, 12, 12], headerRows: 1 });

          const dates = [...new Set(absensi.map(a => a.tanggal))].sort();
          const dateHeaders = dates.map(d => d ? new Date(d).toISOString().slice(0, 10) : '');
          const harianRows = [['No', 'Nama Siswa', ...dateHeaders, 'H', 'S', 'I', 'A']];
          const bySiswaDate = {};
          absensi.forEach(a => {
            if (!bySiswaDate[a.siswa_id]) bySiswaDate[a.siswa_id] = {};
            bySiswaDate[a.siswa_id][a.tanggal] = a.status;
          });
          no = 1;
          sortedSiswa.forEach(s => {
            const row = [no++, s.nama];
            dates.forEach(d => row.push(bySiswaDate[s.id]?.[d] || ''));
            const counts = { H: 0, S: 0, I: 0, A: 0 };
            Object.values(bySiswaDate[s.id] || {}).forEach(st => { if (counts[st] !== undefined) counts[st]++; });
            row.push(counts.H, counts.S, counts.I, counts.A);
            harianRows.push(row);
          });
          const footer = ['Total', ''];
          dates.forEach(d => {
            let h = 0, s = 0, i = 0, a = 0;
            absensi.forEach(x => { if (x.tanggal === d) { if (x.status==='H') h++; else if (x.status==='S') s++; else if (x.status==='I') i++; else if (x.status==='A') a++; } });
            footer.push(`${h}/${h+s+i+a}`);
          });
          footer.push('', '', '', '');
          harianRows.push(footer);
          addSheet(`Harian - ${kelasNama} (${guruId.slice(0,8)})`, harianRows, { widths: [6, 30, ...dateHeaders.map(() => 14), 8, 8, 8, 8], headerRows: 1 });

          const babMap = {};
          bab.forEach(b => { babMap[b.id] = { ...b, tugas: [] }; });
          tugasBab.forEach(t => { if (babMap[t.bab_id]) babMap[t.bab_id].tugas.push(t); });
          Object.values(babMap).forEach(b => b.tugas.sort((x, y) => (x.urutan || 0) - (y.urutan || 0)));

          const nilaiMap = {};
          nilaiTugas.forEach(nt => {
            if (!nilaiMap[nt.siswa_id]) nilaiMap[nt.siswa_id] = {};
            if (!nilaiMap[nt.siswa_id][nt.bab_id]) nilaiMap[nt.siswa_id][nt.bab_id] = {};
            nilaiMap[nt.siswa_id][nt.bab_id][nt.tugas_id] = nt.nilai;
          });
          nilaiUjian.forEach(nu => {
            if (!nilaiMap[nu.siswa_id]) nilaiMap[nu.siswa_id] = {};
            if (nu.jenis_nilai === 'ulangan_harian') nilaiMap[nu.siswa_id][nu.tipe] = nu.nilai;
            else if (nu.jenis_nilai === 'pts') nilaiMap[nu.siswa_id].pts = nu.nilai;
            else if (nu.jenis_nilai === 'pas') nilaiMap[nu.siswa_id].pas = nu.nilai;
          });

          const nilaiRows = [['No', 'Nama Siswa']];
          const tugasScoresMap = {};
          const uhScoresMap = {};
          const ptsMap = {};
          const pasMap = {};
          const akhirMap = {};

          sortedSiswa.forEach((s, idx) => {
            const row = [idx + 1, s.nama];
            const studentNilai = nilaiMap[s.id] || {};
            let totalTugas = 0, countTugas = 0;
            const tugasList = [];
            Object.values(babMap).forEach(b => {
              if (b.tugas.length === 0) {
                row.push('');
              } else {
                b.tugas.forEach(t => {
                  const score = studentNilai[b.id]?.[t.id] ?? '';
                  row.push(score);
                  if (typeof score === 'number') { totalTugas += score; countTugas++; }
                });
              }
            });
            const rerataTugas = countTugas ? Number((totalTugas / countTugas).toFixed(1)) : '';
            row.push(rerataTugas);
            tugasScoresMap[s.id] = rerataTugas;

            let totalUH = 0, countUH = 0;
            uhKolom.forEach(uh => {
              const score = studentNilai[uh.id] ?? '';
              row.push(score);
              if (typeof score === 'number') { totalUH += score; countUH++; }
            });
            const rerataUH = countUH ? Number((totalUH / countUH).toFixed(1)) : '';
            row.push(rerataUH);
            uhScoresMap[s.id] = rerataUH;

            const pts = studentNilai.pts ?? '';
            const pas = studentNilai.pas ?? '';
            row.push(pts, pas);
            ptsMap[s.id] = pts;
            pasMap[s.id] = pas;

            const akhir = (rerataTugas || 0) * 0.25 + (rerataUH || 0) * 0.25 + (pts || 0) * 0.25 + (pas || 0) * 0.25;
            row.push(Number(akhir.toFixed(1)));
            akhirMap[s.id] = Number(akhir.toFixed(1));
            nilaiRows.push(row);
          });
          addSheet(`Nilai - ${kelasNama} (${guruId.slice(0,8)})`, nilaiRows, { widths: [6, 30], headerRows: 1 });
        }
      }

      const wbArray = window.XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbArray], { type: 'application/octet-stream' });
      const fileName = `Laporan-SIMSMANSARI-${timestamp}.xlsx`;
      downloadBlob(blob, fileName);
      setBackupStatus('Backup berhasil dibuat dan diunduh.', 'success');
    } catch (error) {
      console.error(error);
      setBackupStatus(`Gagal membuat backup: ${error?.message || 'Terjadi kesalahan.'}`, 'danger');
    } finally {
      backupBtn.disabled = false;
      backupBtn.innerHTML = original;
    }
  });

  async function loadDashboardStats() {
    try {
      // Coba baca dari dokumen dashboard_counts (1 read saja)
      const cached = await getDashboardCounts(context) || await recalculateDashboardCounts(context);
      if (cached) {
        const guruCount = Number(cached.jumlah_guru || 0);
        const siswaCount = Number(cached.jumlah_siswa || 0);
        const mapelCount = Number(cached.jumlah_mapel || 0);
        const kelasCount = Number(cached.jumlah_kelas || 0);
        const mappingCount = Number(cached.jumlah_pengajaran || 0);
        const hasUsers = guruCount > 0 && siswaCount > 0;
        const hasMapping = mappingCount > 0;
        const completed = [hasPeriod, hasUsers, hasMapping].filter(Boolean).length;

        if (metricsEl) {
          metricsEl.innerHTML = [
            adminMetricCard({ label: 'Guru', value: formatNumber(guruCount), hint: guruCount ? 'Akun guru aktif di sistem' : 'Belum ada data guru', icon: adminIcons.users, tone: 'sky' }),
            adminMetricCard({ label: 'Siswa', value: formatNumber(siswaCount), hint: siswaCount ? 'Akun siswa terdaftar' : 'Belum ada data siswa', icon: adminIcons.users, tone: 'teal' }),
            adminMetricCard({ label: 'Mata Pelajaran', value: formatNumber(mapelCount), hint: mapelCount ? 'Mapel master tersedia' : 'Belum ada mapel', icon: adminIcons.book, tone: 'cyan' }),
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
        return;
      }

      // Fallback: baca langsung dari Firestore (terjadi sekali setiap 5 menit)
      const [guruList, siswaList, mapelList, kelasList, pengajaranList] = await Promise.all([
        getManagedUsers('guru').catch(() => []),
        getManagedUsers('siswa').catch(() => []),
        getCollectionDocs('mata_pelajaran').catch(() => []),
        getCollectionDocs('kelas').catch(() => []),
        getCollectionDocs('pengajaran').catch(() => []),
      ]);

      const guruCount = Array.isArray(guruList) ? guruList.length : 0;
      const siswaCount = Array.isArray(siswaList) ? siswaList.length : 0;
      const mapelCount = Array.isArray(mapelList) ? mapelList.length : 0;
      const kelasCount = Array.isArray(kelasList) ? kelasList.length : 0;
      const mappingCount = Array.isArray(pengajaranList) ? pengajaranList.length : 0;
      const hasUsers = guruCount > 0 && siswaCount > 0;
      const hasMapping = mappingCount > 0;
      const completed = [hasPeriod, hasUsers, hasMapping].filter(Boolean).length;

      if (metricsEl) {
        metricsEl.innerHTML = [
          adminMetricCard({ label: 'Guru', value: formatNumber(guruCount), hint: guruCount ? 'Akun guru aktif di sistem' : 'Belum ada data guru', icon: adminIcons.users, tone: 'sky' }),
          adminMetricCard({ label: 'Siswa', value: formatNumber(siswaCount), hint: siswaCount ? 'Akun siswa terdaftar' : 'Belum ada data siswa', icon: adminIcons.users, tone: 'teal' }),
          adminMetricCard({ label: 'Mata Pelajaran', value: formatNumber(mapelCount), hint: mapelCount ? 'Mapel master tersedia' : 'Belum ada mapel', icon: adminIcons.book, tone: 'cyan' }),
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

      // Simpan hasil perhitungan untuk dashboard berikutnya
      recalculateDashboardCounts(context).catch(() => {});
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
