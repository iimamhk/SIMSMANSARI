import { renderLayout } from '../../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../../utils/helpers.js';
import { getClassMembers, getDocumentsWhere, saveDocument } from '../../../firebase/data-service.js';
import {
  buildKasId, currentMonthKey, monthLabel, getSemesterMonths, getSemesterWeeks,
  formatRupiah, parseNumber, formatTanggal, todayInput, getDateKey, getWeekKey,
  getPeriodKey, getPeriodLabel,
  subscribeKas, getKasConfig, saveKasConfig, saveTransaksi, deleteTransaksi,
  hitungStatistik, exportKasExcel, exportKasPdf, exportKasWord, KATEGORI_PENGELUARAN,
} from '../../kas/kas-shared.js';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'pemasukan', label: 'Pemasukan' },
  { id: 'pengeluaran', label: 'Pengeluaran' },
  { id: 'riwayat', label: 'Riwayat' },
  { id: 'rekap', label: 'Rekap Kas' },
  { id: 'laporan', label: 'Laporan' },
  { id: 'pengaturan', label: 'Pengaturan' },
];

const RIIWAYAT_FILTER = [
  { id: 'semua', label: 'Semua' },
  { id: 'hari', label: 'Hari Ini' },
  { id: 'minggu', label: 'Minggu' },
  { id: 'bulan', label: 'Bulan' },
  { id: 'semester', label: 'Semester' },
  { id: 'tahun', label: 'Tahun' },
];

function openModal(container, title, bodyHtml) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center';
  overlay.innerHTML = `
    <div class="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-lg font-semibold text-slate-900">${title}</h3>
        <button data-close class="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">✕</button>
      </div>
      ${bodyHtml}
    </div>`;
  container.appendChild(overlay);
  overlay.querySelector('[data-close]').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.remove();
  });
  return overlay;
}

export async function renderGuruKasKelasPage(container) {
  const context = getStoredContext();
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const guruId = session?.user?.username || '';
  const guruNama = session?.user?.nama || '';

  const waliRels = await getDocumentsWhere('wali_kelas', [
    { field: 'guru_id', value: guruId },
    { field: 'tahun_ajaran_id', value: context.tahun_ajaran_aktif },
    { field: 'semester_id', value: context.semester_aktif },
  ]);
  const wali = waliRels[0];

  if (!wali) {
    container.innerHTML = renderLayout('Kas Kelas', `
      <div class="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h3 class="text-base font-semibold text-slate-900">Bukan Wali Kelas</h3>
        <p class="mt-1 text-sm text-slate-500">Modul Kas Kelas hanya tersedia untuk guru yang ditunjuk sebagai wali kelas.</p>
      </div>`);
    container.querySelector('#logout-btn')?.addEventListener('click', () => {
      localStorage.removeItem('simguru_session');
      window.location.hash = '#login';
    });
    return;
  }

  const kasId = buildKasId(context, wali.kelas_id);
  let config = await getKasConfig(kasId);
  if (!config) {
    const now = new Date().toISOString();
    config = {
      id: kasId,
      tahun_ajaran_id: context.tahun_ajaran_aktif,
      semester_id: context.semester_aktif,
      kelas_id: wali.kelas_id,
      kelas_nama: wali.kelas_nama,
      wali_kelas_id: guruId,
      wali_kelas_nama: guruNama,
      bendahara_id: '',
      bendahara_nama: '',
      target_kas: 0,
      iuran_per_siswa: 0,
      tanggal_jatuh_tempo: 10,
      frekuensi: 'bulanan',
      pengumuman: '',
      created_at: now,
      updated_at: now,
    };
    await saveKasConfig(config, kasId);
  }

  const members = await getClassMembers(context, wali.kelas_id);

  const state = {
    tab: 'dashboard',
    filter: 'semua',
    rekapFilter: 'semester',
    rekapBulan: currentMonthKey(),
    transaksi: [],
    config,
    members,
    semesterMonths: getSemesterMonths(context),
    context,
    kasId,
    guruId,
    guruNama,
  };

  const stat = () => hitungStatistik(state.transaksi, state.members, state.config, state.context);

  const renderContent = () => {
    const content = container.querySelector('#kas-content');
    if (!content) return;
    if (state.tab === 'dashboard') content.innerHTML = renderDashboard(state, stat());
    else if (state.tab === 'pemasukan') content.innerHTML = renderPemasukanForm(state);
    else if (state.tab === 'pengeluaran') content.innerHTML = renderPengeluaranForm(state);
    else if (state.tab === 'riwayat') content.innerHTML = renderRiwayat(state, stat());
    else if (state.tab === 'rekap') content.innerHTML = renderRekap(state, stat());
    else if (state.tab === 'laporan') content.innerHTML = renderLaporan(state, stat());
    else     if (state.tab === 'pengaturan') content.innerHTML = renderPengaturan(state);
    attachContentHandlers(container, state);
  };

  const shell = renderLayout(`Kas Kelas ${wali.kelas_nama}`, `
    <div class="space-y-4">
      <div class="flex flex-wrap gap-2" id="kas-tabs">
        ${TABS.map((t) => `
          <button data-tab="${t.id}" class="rounded-full px-3.5 py-2 text-sm font-semibold transition ${state.tab === t.id ? 'bg-[#4F46E5] text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}">${t.label}</button>
        `).join('')}
      </div>
      <div id="kas-content"></div>
    </div>
  `);
  container.innerHTML = shell;

  const unsubscribe = subscribeKas(kasId, (data) => {
    state.transaksi = (data || []).slice().sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
    renderContent();
  });

  const tabBar = container.querySelector('#kas-tabs');
  tabBar.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-tab]');
    if (!btn) return;
    state.tab = btn.getAttribute('data-tab');
    tabBar.querySelectorAll('button').forEach((b) => {
      const active = b === btn;
      b.className = `rounded-full px-3.5 py-2 text-sm font-semibold transition ${active ? 'bg-[#4F46E5] text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`;
    });
    renderContent();
  });

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    if (typeof unsubscribe === 'function') unsubscribe();
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });

  renderContent();
}

function card(title, value, sub, grad) {
  return `
    <div class="relative overflow-hidden rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <div class="absolute -right-6 -top-6 h-16 w-16 rounded-full ${grad} opacity-20 blur-2xl"></div>
      <p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">${title}</p>
      <p class="mt-1 text-xl font-bold text-slate-900">${value}</p>
      <p class="mt-0.5 text-xs text-slate-400">${sub}</p>
    </div>`;
}

function renderDashboard(state, s) {
  const labelPeriode = s.labelPeriode || monthLabel(currentMonthKey());
  const target = Number(state.config.target_kas || 0);
  const progress = target > 0 ? Math.min(100, Math.round((s.saldo / target) * 100)) : 0;
  const pengumuman = state.config.pengumuman || '';

  return `
    <div class="space-y-4">
      <div class="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 p-5 text-white shadow-[0_20px_60px_rgba(15,23,42,0.2)]">
        <div class="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/15 blur-3xl"></div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80">KAS KELAS ${state.config.kelas_nama}</p>
        <p class="mt-2 text-sm text-white/80">Saldo Saat Ini</p>
        <p class="text-4xl font-extrabold leading-tight">${formatRupiah(s.saldo)}</p>
        <div class="mt-3 flex flex-wrap gap-4 text-sm">
          <span class="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1">↑ ${formatRupiah(s.pemasukanPeriodeIni)} <span class="text-white/70">Pemasukan ${labelPeriode}</span></span>
          <span class="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1">↓ ${formatRupiah(s.pengeluaranPeriodeIni)} <span class="text-white/70">Pengeluaran</span></span>
        </div>
        <p class="mt-3 inline-flex items-center gap-1 rounded-full bg-rose-500/90 px-3 py-1 text-sm font-semibold">⚠ ${s.tunggakan.length} siswa belum bayar</p>
      </div>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        ${card('Pemasukan', formatRupiah(s.totalPemasukan), 'Total', 'bg-emerald-400')}
        ${card('Pengeluaran', formatRupiah(s.totalPengeluaran), 'Total', 'bg-rose-400')}
        ${card('Saldo', formatRupiah(s.saldo), 'Saat ini', 'bg-indigo-400')}
        ${card('Tunggakan', `${s.tunggakan.length} siswa`, 'Menunggak', 'bg-amber-400')}
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <button data-quick="pemasukan" class="flex items-center justify-center gap-2 rounded-2xl bg-[#4F46E5] px-4 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-700">
          <span class="text-xl">＋</span> Tambah Pembayaran
        </button>
        <button data-quick="pengeluaran" class="flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-4 text-base font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50">
          <span class="text-xl">－</span> Catat Pengeluaran
        </button>
      </div>

      ${target > 0 ? `
      <div class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <div class="flex items-center justify-between text-sm">
          <p class="font-semibold text-slate-900">Target Kas</p>
          <p class="text-slate-500">${formatRupiah(s.saldo)} / ${formatRupiah(target)}</p>
        </div>
        <div class="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100">
          <div class="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all" style="width:${progress}%"></div>
        </div>
        <p class="mt-1 text-right text-xs font-semibold text-emerald-600">${progress}%</p>
      </div>` : ''}

      ${pengumuman ? `
      <div class="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">Pengumuman</p>
        <p class="mt-1 whitespace-pre-line text-sm text-amber-800">${pengumuman}</p>
      </div>` : ''}

      ${s.tunggakan.length ? `
      <div class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <p class="mb-2 text-sm font-semibold text-slate-900">Siswa Menunggak (${labelPeriode})</p>
        <div class="flex flex-wrap gap-2">
          ${s.tunggakan.map((m) => `<span class="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-100">${m.siswa_nama || m.nama || '-'}</span>`).join('')}
        </div>
      </div>` : ''}
    </div>`;
}

function memberOptions(members, selected = '') {
  const sorted = members.slice().sort((a, b) => {
    const namaA = (a.siswa_nama || a.nama || '').toLowerCase();
    const namaB = (b.siswa_nama || b.nama || '').toLowerCase();
    return namaA.localeCompare(namaB, 'id');
  });
  return sorted
    .map((m) => `<option value="${m.siswa_id || m.id}" ${m.siswa_id === selected ? 'selected' : ''}>${m.siswa_nama || m.nama || '-'}</option>`)
    .join('');
}

function periodeOptions(semesterMonths, selected) {
  return semesterMonths
    .map((k) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${monthLabel(k)}</option>`)
    .join('');
}

function weekOptions(semesterWeeks, selected) {
  return semesterWeeks
    .map((w) => `<option value="${w.key}" ${w.key === selected ? 'selected' : ''}>${w.label}</option>`)
    .join('');
}

function renderPemasukanForm(state) {
  const today = todayInput();
  const frekuensi = state.config.frekuensi || 'bulanan';
  let periodeField = '';
  let defaultPeriode = '';
  if (frekuensi === 'harian') {
    defaultPeriode = today;
    periodeField = `<input id="periode" type="date" value="${defaultPeriode}" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />`;
  } else if (frekuensi === 'mingguan') {
    defaultPeriode = getWeekKey(new Date());
    const weeks = getSemesterWeeks(state.context);
    periodeField = `<select id="periode" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">${weekOptions(weeks, defaultPeriode)}</select>`;
  } else {
    defaultPeriode = currentMonthKey();
    periodeField = `<select id="periode" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">${periodeOptions(state.semesterMonths, defaultPeriode)}</select>`;
  }
  const periodLabel = frekuensi === 'harian' ? 'Tanggal' : frekuensi === 'mingguan' ? 'Periode Minggu' : 'Periode Bulan';
  return `
    <div class="space-y-4">
      <form id="pemasukan-form" class="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <h4 class="text-base font-semibold text-slate-900">Tambah Pembayaran Kas</h4>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tanggal</label>
          <input id="tanggal" type="date" value="${today}" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Siswa</label>
          <select id="siswa" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">${memberOptions(state.members)}</select>
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">${periodLabel}</label>
          ${periodeField}
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Nominal</label>
          <input id="nominal" type="text" inputmode="numeric" placeholder="Rp 0" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Keterangan</label>
          <input id="keterangan" type="text" placeholder="Misal: Kas Juli 2026" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Bukti (URL/No. Referensi)</label>
          <input id="bukti" type="text" placeholder="Opsional" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
        </div>
        <button type="submit" class="w-full rounded-xl bg-[#4F46E5] px-4 py-3 text-sm font-semibold text-white">Simpan Pembayaran</button>
      </form>
      <button data-bulk-pemasukan class="w-full rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-[#4F46E5] hover:text-[#4F46E5]">
        ＋ Input Masal (Beberapa Siswa)
      </button>
    </div>`;
}

function renderBulkPemasukanModal(state) {
  const frekuensi = state.config.frekuensi || 'bulanan';
  const today = todayInput();
  let defaultPeriode = '';
  if (frekuensi === 'harian') {
    defaultPeriode = today;
  } else if (frekuensi === 'mingguan') {
    defaultPeriode = getWeekKey(new Date());
  } else {
    defaultPeriode = currentMonthKey();
  }
  const memberChecks = state.members.slice().sort((a, b) => {
    const namaA = (a.siswa_nama || a.nama || '').toLowerCase();
    const namaB = (b.siswa_nama || b.nama || '').toLowerCase();
    return namaA.localeCompare(namaB, 'id');
  }).map((m) => {
    const id = m.siswa_id || m.id;
    const nama = m.siswa_nama || m.nama || '-';
    return `<label class="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3"><input type="checkbox" value="${id}" class="bulk-siswa h-4 w-4 rounded border-slate-300 text-[#4F46E5] focus:ring-[#4F46E5]" checked /><span class="text-sm text-slate-700">${nama}</span></label>`;
  }).join('');
  return `
    <div class="space-y-4">
      <form id="bulk-pemasukan-form" class="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <h4 class="text-base font-semibold text-slate-900">Input Pembayaran Masal</h4>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tanggal Pembayaran</label>
          <input id="bulk-tanggal" type="date" value="${today}" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Periode</label>
          ${frekuensi === 'harian' ? `<input id="bulk-periode" type="date" value="${defaultPeriode}" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />` : frekuensi === 'mingguan' ? `<select id="bulk-periode" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">${weekOptions(getSemesterWeeks(state.context), defaultPeriode)}</select>` : `<select id="bulk-periode" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">${periodeOptions(state.semesterMonths, defaultPeriode)}</select>`}
        </div>
        <div class="max-h-60 space-y-2 overflow-y-auto">${memberChecks}</div>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Nominal per Siswa (Rp)</label>
          <input id="bulk-nominal" type="text" inputmode="numeric" placeholder="Rp 0" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Keterangan</label>
          <input id="bulk-keterangan" type="text" placeholder="Misal: Kas Juli 2026" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
        </div>
        <div class="flex gap-2">
          <button type="button" data-close-bulk class="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600">Batal</button>
          <button type="button" data-preview-bulk class="flex-1 rounded-xl bg-[#4F46E5] px-4 py-3 text-sm font-semibold text-white">Preview & Konfirmasi</button>
        </div>
      </form>
    </div>`;
}

function renderPengeluaranForm(state) {
  const today = todayInput();
  const kategoriOpts = KATEGORI_PENGELUARAN.map((k) => `<option value="${k}">${k}</option>`).join('');
  return `
    <div class="space-y-4">
      <form id="pengeluaran-form" class="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <h4 class="text-base font-semibold text-slate-900">Catat Pengeluaran</h4>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tanggal</label>
          <input id="tanggal" type="date" value="${today}" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Kategori</label>
          <select id="kategori" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">${kategoriOpts}</select>
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Nominal</label>
          <input id="nominal" type="text" inputmode="numeric" placeholder="Rp 0" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Keterangan</label>
          <input id="keterangan" type="text" placeholder="Misal: Fotokopi soal" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Bukti (URL/No. Referensi)</label>
          <input id="bukti" type="text" placeholder="Opsional" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
        </div>
        <button type="submit" class="w-full rounded-xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white">Simpan Pengeluaran</button>
      </form>
    </div>`;
}

function filterTransaksi(list, filter, context) {
  if (filter === 'semua') return list;
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayMs = 86400000;
  return list.filter((t) => {
    const d = new Date(t.tanggal);
    if (filter === 'hari') return d >= startOfDay;
    if (filter === 'minggu') {
      const diff = (now - d) / dayMs;
      return diff >= 0 && diff <= 7;
    }
    if (filter === 'bulan') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (filter === 'tahun') return d.getFullYear() === now.getFullYear();
    if (filter === 'semester') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === context.semester_aktif?.split('_').slice(0, 2).join('-') || d.getFullYear() === now.getFullYear();
    return true;
  });
}

function renderRiwayat(state, s) {
  const list = filterTransaksi(state.transaksi, state.filter, state.context);
  const filterBtns = RIIWAYAT_FILTER.map((f) => `
    <button data-filter="${f.id}" class="rounded-full px-3 py-1.5 text-xs font-semibold transition ${state.filter === f.id ? 'bg-[#4F46E5] text-white' : 'bg-slate-100 text-slate-600'}">${f.label}</button>
  `).join('');

  const rows = list.length ? list.map((t) => `
    <div class="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
      <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.jenis === 'pemasukan' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}">
        ${t.jenis === 'pemasukan' ? '↑' : '↓'}
      </div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold text-slate-900">${t.siswa_nama || t.kategori || '-'}</p>
        <p class="truncate text-xs text-slate-500">${formatTanggal(t.tanggal)} • ${t.keterangan || '-'}</p>
      </div>
      <p class="text-sm font-bold ${t.jenis === 'pemasukan' ? 'text-emerald-600' : 'text-rose-600'}">${formatRupiah(t.nominal)}</p>
      <div class="flex flex-col gap-1">
        <button data-edit="${t.id}" class="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">Edit</button>
        <button data-delete="${t.id}" class="rounded-lg bg-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-600">Hapus</button>
      </div>
    </div>`).join('') : `<p class="rounded-2xl bg-slate-50 py-10 text-center text-sm text-slate-400">Belum ada transaksi.</p>`;

  return `
    <div class="space-y-3">
      <div class="flex flex-wrap gap-2">${filterBtns}</div>
      <div class="space-y-2.5">${rows}</div>
    </div>`;
}

function renderLaporan(state, s) {
  const list = state.transaksi;
  const kategori = Object.entries(s.kategoriMap).sort((a, b) => b[1] - a[1]);
  const maxKat = kategori.length ? kategori[0][1] : 0;
  const frekuensi = state.config.frekuensi || 'bulanan';
  let periodList = [];
  let periodLabelHeader = '';
  if (frekuensi === 'harian') {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      periodList.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    periodLabelHeader = `Hari Bulan ${monthLabel(`${year}-${String(month + 1).padStart(2, '0')}`)}`;
  } else if (frekuensi === 'mingguan') {
    periodList = getSemesterWeeks(state.context).map((w) => w.key);
    periodLabelHeader = 'Minggu';
  } else {
    periodList = state.semesterMonths;
    periodLabelHeader = 'Bulan';
  }
  const paidMap = {};
  list.filter((t) => t.jenis === 'pemasukan' && t.siswa_id && t.periode).forEach((t) => {
    paidMap[t.siswa_id] = paidMap[t.siswa_id] || new Set();
    paidMap[t.siswa_id].add(t.periode);
  });
  const perSiswa = state.members.map((m) => {
    const id = m.siswa_id || m.id;
    const paid = paidMap[id] || new Set();
    const cells = periodList.map((k) => {
      const isPaid = paid.has(k);
      const label = frekuensi === 'harian' ? k.split('-')[2] : frekuensi === 'mingguan' ? `W${k.split('-W')[1]}` : k.split('-')[1];
      return `<span class="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] ${isPaid ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}">${label}</span>`;
    }).join('');
    return `<div class="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100"><p class="mb-2 text-sm font-semibold text-slate-900">${m.siswa_nama || m.nama || '-'}</p><div class="flex flex-wrap gap-1">${cells}</div></div>`;
  }).join('');

  const periodText = getPeriodLabel(getPeriodKey(new Date(), frekuensi), frekuensi);
  const pengingat = s.tunggakan.map((m) => {
    const nama = m.siswa_nama || m.nama || '-';
    const msg = `Halo ${nama}, kas kelas ${periodText.toLowerCase()} sebesar ${formatRupiah(state.config.iuran_per_siswa || 0)} belum dibayarkan.`;
    return `<div class="flex items-center justify-between gap-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100"><p class="text-sm text-slate-700">${msg}</p><button data-copy="${encodeURIComponent(msg)}" class="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">Salin</button></div>`;
  }).join('') || `<p class="rounded-2xl bg-slate-50 py-6 text-center text-sm text-slate-400">Tidak ada siswa menunggak.</p>`;

  const sorted = list.slice().sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));
  let running = 0;
  const mutasiRows = sorted.map((t, i) => {
    const masuk = t.jenis === 'pemasukan' ? Number(t.nominal || 0) : 0;
    const keluar = t.jenis === 'pengeluaran' ? Number(t.nominal || 0) : 0;
    running += masuk - keluar;
    return `
      <tr class="border-t border-slate-100 text-sm">
        <td class="px-3 py-2 text-slate-400">${i + 1}</td>
        <td class="px-3 py-2 text-slate-600">${formatTanggal(t.tanggal)}</td>
        <td class="px-3 py-2 text-slate-700">${t.siswa_nama || t.kategori || '-'}${t.keterangan ? ` • ${t.keterangan}` : ''}</td>
        <td class="px-3 py-2 text-right font-medium text-emerald-600">${masuk ? formatRupiah(masuk) : '-'}</td>
        <td class="px-3 py-2 text-right font-medium text-rose-600">${keluar ? formatRupiah(keluar) : '-'}</td>
        <td class="px-3 py-2 text-right font-bold text-slate-900">${formatRupiah(running)}</td>
      </tr>`;
  }).join('');

  return `
    <div class="space-y-4">
      <div class="grid grid-cols-3 gap-3">
        ${card('Pemasukan', formatRupiah(s.totalPemasukan), '', 'bg-emerald-400')}
        ${card('Pengeluaran', formatRupiah(s.totalPengeluaran), '', 'bg-rose-400')}
        ${card('Saldo', formatRupiah(s.saldo), '', 'bg-indigo-400')}
      </div>

      <div class="grid grid-cols-3 gap-2">
        <button data-export="excel" class="rounded-xl bg-emerald-500 px-3 py-3 text-sm font-semibold text-white">Excel</button>
        <button data-export="pdf" class="rounded-xl bg-rose-500 px-3 py-3 text-sm font-semibold text-white">PDF</button>
        <button data-export="word" class="rounded-xl bg-blue-500 px-3 py-3 text-sm font-semibold text-white">Word</button>
      </div>

      <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div class="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-3">
          <p class="text-sm font-semibold text-slate-700">Mutasi Kas (Rekening)</p>
          <span class="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-600">Saldo Akhir ${formatRupiah(s.saldo)}</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead class="bg-white text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th class="px-3 py-2">#</th>
                <th class="px-3 py-2">Tanggal</th>
                <th class="px-3 py-2">Keterangan</th>
                <th class="px-3 py-2 text-right">Dana Masuk</th>
                <th class="px-3 py-2 text-right">Dana Keluar</th>
                <th class="px-3 py-2 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>${mutasiRows || `<tr><td colspan="6" class="px-3 py-6 text-center text-sm text-slate-400">Belum ada mutasi kas.</td></tr>`}</tbody>
          </table>
        </div>
      </div>

      ${kategori.length ? `
      <div class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <p class="mb-3 text-sm font-semibold text-slate-900">Kategori Pengeluaran</p>
        <div class="space-y-2">${kategori.map(([k, v]) => `
          <div>
            <div class="flex justify-between text-xs"><span class="text-slate-600">${k}</span><span class="font-semibold text-slate-900">${formatRupiah(v)}</span></div>
            <div class="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full bg-rose-400" style="width:${maxKat ? Math.round((v / maxKat) * 100) : 0}%"></div></div>
          </div>`).join('')}</div>
      </div>` : ''}

      <div class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <p class="mb-3 text-sm font-semibold text-slate-900">Daftar Siswa Menunggak</p>
        <div class="flex flex-wrap gap-2">${s.tunggakan.map((m) => `<span class="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-100">${m.siswa_nama || m.nama || '-'}</span>`).join('') || '<span class="text-sm text-slate-400">Semua lunas.</span>'}</div>
      </div>

      <div class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <p class="mb-3 text-sm font-semibold text-slate-900">Pengingat Otomatis</p>
        <div class="space-y-2">${pengingat}</div>
      </div>

      <div class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <p class="mb-3 text-sm font-semibold text-slate-900">Riwayat Per Siswa</p>
        <div class="grid gap-2 sm:grid-cols-2">${perSiswa}</div>
      </div>
    </div>`;
}

function renderPengaturan(state) {
  const memberOpts = state.members
    .map((m) => `<option value="${m.siswa_id || m.id}" ${state.config.bendahara_id === (m.siswa_id || m.id) ? 'selected' : ''}>${m.siswa_nama || m.nama || '-'}</option>`)
    .join('');
  const frekuensi = state.config.frekuensi || 'bulanan';
  const iuranLabel = frekuensi === 'harian' ? 'Iuran per Siswa / Hari (Rp)' : frekuensi === 'mingguan' ? 'Iuran per Siswa / Minggu (Rp)' : 'Iuran per Siswa / Bulan (Rp)';
  const frekuensiOpts = ['bulanan', 'mingguan', 'harian'].map((f) => `<option value="${f}" ${f === frekuensi ? 'selected' : ''}>${f.charAt(0).toUpperCase() + f.slice(1)}</option>`).join('');
  return `
    <form id="pengaturan-form" class="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <h4 class="text-base font-semibold text-slate-900">Pengaturan Kas Kelas</h4>
      <div>
        <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Bendahara Kelas</label>
        <select id="bendahara" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><option value="">— Pilih Bendahara —</option>${memberOpts}</select>
      </div>
      <div>
        <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Model Pengumpulan</label>
        <select id="frekuensi" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">${frekuensiOpts}</select>
      </div>
      <div>
        <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">${iuranLabel}</label>
        <input id="iuran" type="text" inputmode="numeric" value="${state.config.iuran_per_siswa || 0}" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
      </div>
      <div>
        <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tanggal Jatuh Tempo</label>
        <input id="tempo" type="number" min="1" max="31" value="${state.config.tanggal_jatuh_tempo || 10}" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
      </div>
      <div>
        <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Target Kas (Rp)</label>
        <input id="target" type="text" inputmode="numeric" value="${state.config.target_kas || 0}" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
      </div>
      <div>
        <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Pengumuman</label>
        <textarea id="pengumuman" rows="3" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" placeholder="Info untuk siswa...">${state.config.pengumuman || ''}</textarea>
      </div>
      <button type="submit" class="w-full rounded-xl bg-[#4F46E5] px-4 py-3 text-sm font-semibold text-white">Simpan Pengaturan</button>
    </form>`;
  }

  function renderRekap(state, s) {
    const frekuensi = state.config.frekuensi || 'bulanan';
    const rekapFilter = state.rekapFilter || 'semester';
    const rekapBulan = state.rekapBulan || currentMonthKey();
    let periodList = [];
    let periodLabels = [];
    if (frekuensi === 'bulanan') {
      if (rekapFilter === 'bulan') {
        periodList = [rekapBulan];
        periodLabels = [monthLabel(rekapBulan)];
      } else {
        periodList = state.semesterMonths;
        periodLabels = state.semesterMonths.map((k) => monthLabel(k));
      }
    } else if (frekuensi === 'mingguan') {
      const weeks = getSemesterWeeks(state.context);
      if (rekapFilter === 'bulan') {
        periodList = weeks.filter((w) => w.key.startsWith(rekapBulan)).map((w) => w.key);
        periodLabels = periodList.map((k) => {
          const w = weeks.find((ww) => ww.key === k);
          return w ? `Minggu ${k.split('-W')[1]}` : k;
        });
      } else {
        periodList = weeks.map((w) => w.key);
        periodLabels = weeks.map((w) => `Minggu ${w.key.split('-W')[1]}`);
      }
    } else {
      if (rekapFilter === 'bulan') {
        const parts = rekapBulan.split('-');
        const year = Number(parts[0]);
        const month = Number(parts[1]) - 1;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
          periodList.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
          periodLabels.push(String(d));
        }
      } else {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
          periodList.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
          periodLabels.push(String(d));
        }
      }
    }

    const paidMap = {};
    state.transaksi.filter((t) => t.jenis === 'pemasukan' && t.siswa_id && t.periode).forEach((t) => {
      paidMap[t.siswa_id] = paidMap[t.siswa_id] || {};
      paidMap[t.siswa_id][t.periode] = (paidMap[t.siswa_id][t.periode] || 0) + Number(t.nominal || 0);
    });

    const sortedMembers = state.members.slice().sort((a, b) => {
      const namaA = (a.siswa_nama || a.nama || '').toLowerCase();
      const namaB = (b.siswa_nama || b.nama || '').toLowerCase();
      return namaA.localeCompare(namaB, 'id');
    });

    const rows = sortedMembers.map((m) => {
      const id = m.siswa_id || m.id;
      const paid = paidMap[id] || {};
      const cells = periodList.map((k) => {
        const val = paid[k] || 0;
        return `<td class="px-3 py-2 text-right text-sm text-slate-700">${val ? formatRupiah(val) : '-'}</td>`;
      }).join('');
      const total = periodList.reduce((sum, k) => sum + (paid[k] || 0), 0);
      return `<tr class="border-t border-slate-100 text-sm">
        <td class="px-3 py-2 text-slate-900 font-medium">${m.siswa_nama || m.nama || '-'}</td>
        ${cells}
        <td class="px-3 py-2 text-right text-sm font-bold text-slate-900">${formatRupiah(total)}</td>
      </tr>`;
    }).join('');

    const filterBtnClass = (f) => `rounded-full px-3 py-1.5 text-xs font-semibold transition ${rekapFilter === f ? 'bg-[#4F46E5] text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`;

    return `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center gap-2">
          <button data-rekap-filter="semester" class="${filterBtnClass('semester')}">Semester</button>
          <button data-rekap-filter="bulan" class="${filterBtnClass('bulan')}">Bulan</button>
          ${rekapFilter === 'bulan' ? `
            <select data-rekap-bulan class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
              ${state.semesterMonths.map((k) => `<option value="${k}" ${k === rekapBulan ? 'selected' : ''}>${monthLabel(k)}</option>`).join('')}
            </select>
          ` : ''}
        </div>
        <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div class="overflow-x-auto">
            <table class="w-full text-left">
              <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-3 py-3">Nama Siswa</th>
                  ${periodLabels.map((l) => `<th class="px-3 py-3 text-right">${l}</th>`).join('')}
                  <th class="px-3 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>${rows || `<tr><td colspan="${periodList.length + 2}" class="px-3 py-6 text-center text-sm text-slate-400">Belum ada data pembayaran.</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

function transaksiPayload(state, values) {
  const now = new Date().toISOString();
  return {
    kas_id: state.kasId,
    tahun_ajaran_id: state.context.tahun_ajaran_aktif,
    semester_id: state.context.semester_aktif,
    kelas_id: state.config.kelas_id,
    kelas_nama: state.config.kelas_nama,
    ...values,
    created_by: state.guruId,
    created_by_nama: state.guruNama,
    created_at: now,
    updated_at: now,
  };
}

function attachContentHandlers(container, state) {
  const content = container.querySelector('#kas-content');
  if (!content) return;

  content.querySelectorAll('[data-quick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.getAttribute('data-quick');
      state.tab = kind;
      container.querySelectorAll('#kas-tabs button').forEach((b) => {
        const active = b.getAttribute('data-tab') === kind;
        b.className = `rounded-full px-3.5 py-2 text-sm font-semibold transition ${active ? 'bg-[#4F46E5] text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`;
      });
      const c = container.querySelector('#kas-content');
      c.innerHTML = kind === 'pemasukan' ? renderPemasukanForm(state) : renderPengeluaranForm(state);
      attachContentHandlers(container, state);
    });
  });

  content.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filter = btn.getAttribute('data-filter');
      const c = container.querySelector('#kas-content');
      c.innerHTML = renderRiwayat(state, hitungStatistik(state.transaksi, state.members, state.config, state.context));
      attachContentHandlers(container, state);
    });
  });

  content.querySelectorAll('[data-rekap-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.rekapFilter = btn.getAttribute('data-rekap-filter');
      const c = container.querySelector('#kas-content');
      c.innerHTML = renderRekap(state, hitungStatistik(state.transaksi, state.members, state.config, state.context));
      attachContentHandlers(container, state);
    });
  });

  content.querySelectorAll('[data-rekap-bulan]').forEach((select) => {
    select.addEventListener('change', () => {
      state.rekapBulan = select.value;
      const c = container.querySelector('#kas-content');
      c.innerHTML = renderRekap(state, hitungStatistik(state.transaksi, state.members, state.config, state.context));
      attachContentHandlers(container, state);
    });
  });

  content.querySelectorAll('[data-export]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = hitungStatistik(state.transaksi, state.members, state.config, state.context);
      const kind = btn.getAttribute('data-export');
      if (kind === 'excel') exportKasExcel(state.transaksi, state.context, state.config);
      else if (kind === 'pdf') exportKasPdf(state.transaksi, state.context, state.config, s);
      else if (kind === 'word') exportKasWord(state.transaksi, state.context, state.config, s);
    });
  });

  content.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigator.clipboard?.writeText(decodeURIComponent(btn.getAttribute('data-copy'))).then(() => {
        btn.textContent = 'Tersalin';
        setTimeout(() => { btn.textContent = 'Salin'; }, 1500);
      }).catch(() => {});
    });
  });

  const pemasukanForm = content.querySelector('#pemasukan-form');
  if (pemasukanForm) {
    pemasukanForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const siswaId = pemasukanForm.querySelector('#siswa').value;
      const siswaNama = pemasukanForm.querySelector('#siswa').selectedOptions[0]?.textContent || '';
      const nominal = parseNumber(pemasukanForm.querySelector('#nominal').value);
      if (!nominal) { alert('Nominal harus diisi.'); return; }
      const tanggal = pemasukanForm.querySelector('#tanggal').value;
      const periode = pemasukanForm.querySelector('#periode').value;
      const payload = transaksiPayload(state, {
        jenis: 'pemasukan',
        tanggal,
        siswa_id: siswaId,
        siswa_nama: siswaNama,
        periode,
        nominal,
        keterangan: pemasukanForm.querySelector('#keterangan').value.trim(),
        bukti_url: pemasukanForm.querySelector('#bukti').value.trim(),
        kategori: 'Iuran',
      });
      await saveTransaksi(payload);
      alert('Pembayaran kas berhasil disimpan.');
    });
  }

  content.querySelectorAll('[data-bulk-pemasukan]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const overlay = openModal(container, 'Input Pembayaran Masal', renderBulkPemasukanModal(state));
      overlay.querySelector('[data-close-bulk]')?.addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
      const previewBtn = overlay.querySelector('[data-preview-bulk]');
      if (previewBtn) {
        previewBtn.addEventListener('click', () => {
          const checkboxes = overlay.querySelectorAll('.bulk-siswa:checked');
          const selectedIds = Array.from(checkboxes).map((cb) => cb.value);
          const selectedNames = Array.from(checkboxes).map((cb) => cb.parentElement.querySelector('span').textContent);
          const nominal = parseNumber(overlay.querySelector('#bulk-nominal').value);
          if (!nominal) { alert('Nominal harus diisi.'); return; }
          if (selectedIds.length === 0) { alert('Pilih minimal satu siswa.'); return; }
          const keterangan = overlay.querySelector('#bulk-keterangan').value.trim();
          const tanggal = overlay.querySelector('#bulk-tanggal').value;
          const periode = overlay.querySelector('#bulk-periode').value;
          const confirmOverlay = openModal(container, 'Konfirmasi Pembayaran Masal', `
            <div class="space-y-3">
              <div class="max-h-48 overflow-y-auto space-y-2">
                ${selectedNames.map((nama) => `<div class="flex items-center justify-between rounded-lg bg-slate-50 p-2 text-sm"><span class="font-medium text-slate-700">${nama}</span><span class="font-semibold text-emerald-600">${formatRupiah(nominal)}</span></div>`).join('')}
              </div>
              <div class="flex items-center justify-between rounded-lg bg-indigo-50 p-3 text-sm font-semibold text-indigo-700">
                <span>Total (${selectedIds.length} siswa)</span>
                <span>${formatRupiah(nominal * selectedIds.length)}</span>
              </div>
              <p class="text-xs text-slate-500">Periode: ${getPeriodLabel(periode, state.config.frekuensi || 'bulanan')} • Tanggal: ${formatTanggal(tanggal)}</p>
              <div class="flex gap-2">
                <button data-close-confirm class="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600">Kembali</button>
                <button data-confirm-bulk class="flex-1 rounded-xl bg-[#4F46E5] px-4 py-3 text-sm font-semibold text-white">Ya, Simpan Semua</button>
              </div>
            </div>
          `);
          confirmOverlay.querySelector('[data-close-confirm]')?.addEventListener('click', () => confirmOverlay.remove());
          confirmOverlay.addEventListener('click', (event) => { if (event.target === confirmOverlay) confirmOverlay.remove(); });
          confirmOverlay.querySelector('[data-confirm-bulk]')?.addEventListener('click', async () => {
            confirmOverlay.remove();
            overlay.remove();
            const promises = selectedIds.map((id, idx) => {
              const siswaNama = selectedNames[idx];
              return saveTransaksi(transaksiPayload(state, {
                jenis: 'pemasukan',
                tanggal,
                siswa_id: id,
                siswa_nama: siswaNama,
                periode,
                nominal,
                keterangan,
                bukti_url: '',
                kategori: 'Iuran',
              }));
            });
            await Promise.all(promises);
            alert(`${selectedIds.length} pembayaran berhasil disimpan.`);
          });
        });
      }
    });
  });

  const pengeluaranForm = content.querySelector('#pengeluaran-form');
  if (pengeluaranForm) {
    pengeluaranForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nominal = parseNumber(pengeluaranForm.querySelector('#nominal').value);
      if (!nominal) { alert('Nominal harus diisi.'); return; }
      const payload = transaksiPayload(state, {
        jenis: 'pengeluaran',
        tanggal: pengeluaranForm.querySelector('#tanggal').value,
        kategori: pengeluaranForm.querySelector('#kategori').value,
        nominal,
        keterangan: pengeluaranForm.querySelector('#keterangan').value.trim(),
        bukti_url: pengeluaranForm.querySelector('#bukti').value.trim(),
      });
      await saveTransaksi(payload);
      alert('Pengeluaran kas berhasil disimpan.');
    });
  }

  content.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-delete');
      const t = state.transaksi.find((x) => x.id === id);
      if (!confirm(`Hapus transaksi ini?\n\n${t?.siswa_nama || t?.kategori || '-'} • ${formatRupiah(t?.nominal)}`)) return;
      await deleteTransaksi(id);
      alert('Transaksi berhasil dihapus.');
    });
  });

  content.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-edit');
      const t = state.transaksi.find((x) => x.id === id);
      if (!t) return;
      const isPemasukan = t.jenis === 'pemasukan';
      const modal = openModal(container, 'Edit Transaksi', `
        <form id="edit-form" class="space-y-3">
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tanggal</label>
            <input id="e-tanggal" type="date" value="${t.tanggal ? t.tanggal.slice(0, 10) : todayInput()}" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
          </div>
          ${isPemasukan ? `
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Siswa</label>
            <select id="e-siswa" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">${memberOptions(state.members, t.siswa_id)}</select>
          </div>` : `
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Kategori</label>
            <select id="e-kategori" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">${KATEGORI_PENGELUARAN.map((k) => `<option value="${k}" ${k === t.kategori ? 'selected' : ''}>${k}</option>`).join('')}</select>
          </div>`}
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Nominal</label>
            <input id="e-nominal" type="text" inputmode="numeric" value="${t.nominal}" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Keterangan</label>
            <input id="e-keterangan" type="text" value="${t.keterangan || ''}" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
          </div>
          <button type="submit" class="w-full rounded-xl bg-[#4F46E5] px-4 py-3 text-sm font-semibold text-white">Simpan Perubahan</button>
        </form>
      `);
      modal.querySelector('#edit-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nominal = parseNumber(modal.querySelector('#e-nominal').value);
        if (!nominal) { alert('Nominal harus diisi.'); return; }
        const updates = {
          tanggal: modal.querySelector('#e-tanggal').value,
          nominal,
          keterangan: modal.querySelector('#e-keterangan').value.trim(),
          updated_at: new Date().toISOString(),
        };
        if (isPemasukan) {
          const siswaId = modal.querySelector('#e-siswa').value;
          updates.siswa_id = siswaId;
          updates.siswa_nama = state.members.find((m) => (m.siswa_id || m.id) === siswaId)?.siswa_nama || '';
        } else {
          updates.kategori = modal.querySelector('#e-kategori').value;
        }
        await saveTransaksi({ ...t, ...updates }, id);
        modal.remove();
        alert('Transaksi berhasil diperbarui.');
      });
    });
  });

  const pengaturanForm = content.querySelector('#pengaturan-form');
  if (pengaturanForm) {
    pengaturanForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const bendaharaId = pengaturanForm.querySelector('#bendahara').value;
      const bendaharaNama = bendaharaId ? pengaturanForm.querySelector('#bendahara').selectedOptions[0]?.textContent || '' : '';
      const updated = {
        ...state.config,
        bendahara_id: bendaharaId,
        bendahara_nama: bendaharaNama,
        frekuensi: pengaturanForm.querySelector('#frekuensi').value,
        target_kas: parseNumber(pengaturanForm.querySelector('#target').value),
        iuran_per_siswa: parseNumber(pengaturanForm.querySelector('#iuran').value),
        tanggal_jatuh_tempo: Number(pengaturanForm.querySelector('#tempo').value) || 10,
        pengumuman: pengaturanForm.querySelector('#pengumuman').value.trim(),
        updated_at: new Date().toISOString(),
      };
      await saveKasConfig(updated, state.kasId);
      state.config = updated;
      alert('Pengaturan kas kelas berhasil disimpan.');
    });
  }
}



