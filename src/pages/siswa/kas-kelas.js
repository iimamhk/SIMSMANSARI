import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import { getClassMembers, getDocumentsWhere, saveDocument } from '../../firebase/data-service.js';
import {
  buildKasId, currentMonthKey, monthLabel, formatRupiah, parseNumber, formatTanggal, todayInput,
  getPeriodKey, getPeriodLabel, getSemesterMonths, getSemesterWeeks, getWeekKey,
  subscribeKas, getKasConfig, saveTransaksi, deleteTransaksi, hitungStatistik,
  exportKasExcel, exportKasPdf, exportKasWord, KATEGORI_PENGELUARAN,
} from '../kas/kas-shared.js';

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
  overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
  return overlay;
}

function receiptModal(container, t) {
  const modal = openModal(container, 'Bukti Pembayaran', `
    <div id="receipt" class="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Bukti Pembayaran</p>
      <div class="mt-4 space-y-2 text-sm text-slate-700">
        <p><span class="text-slate-400">Nama</span><br/><span class="font-semibold text-slate-900">${t.siswa_nama || '-'}</span></p>
        <p><span class="text-slate-400">Tanggal</span><br/><span class="font-semibold text-slate-900">${formatTanggal(t.tanggal)}</span></p>
        <p><span class="text-slate-400">Nominal</span><br/><span class="font-semibold text-slate-900">${formatRupiah(t.nominal)}</span></p>
        <p><span class="text-slate-400">Periode</span><br/><span class="font-semibold text-slate-900">${monthLabel(t.periode)}</span></p>
        <span class="mt-2 inline-block rounded-full bg-emerald-500 px-4 py-1 text-sm font-bold text-white">LUNAS</span>
      </div>
    </div>
    <button data-print class="mt-4 w-full rounded-xl bg-[#4F46E5] px-4 py-3 text-sm font-semibold text-white">Cetak / Simpan</button>
  `);
  modal.querySelector('[data-print]').addEventListener('click', () => {
    const printContents = modal.querySelector('#receipt').innerHTML;
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`<html><head><title>Bukti Pembayaran</title><style>body{font-family:sans-serif;padding:24px}.card{border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc;padding:20px;text-align:center}</style></head><body><div class="card">${printContents}</div></body></html>`);
      win.document.close();
      win.print();
    }
  });
}

export async function renderSiswaKasKelasPage(container) {
  const context = getStoredContext();
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const userId = session?.user?.username || '';
  const userName = session?.user?.nama || '';
  const kelasId = session?.user?.kelas_id || '';

  const kasId = buildKasId(context, kelasId);
  let config = await getKasConfig(kasId);
  const members = kelasId ? await getClassMembers(context, kelasId) : [];

  const isBendahara = !!(config && config.bendahara_id === userId);

  const state = {
    tab: 'dashboard',
    transaksi: [],
    config,
    members,
    context,
    kasId,
    userId,
    userName,
    kelasId,
    isBendahara,
    rekapFilter: 'semester',
    rekapBulan: currentMonthKey(),
  };

  const stat = () => hitungStatistik(state.transaksi, state.members, state.config || {}, state.context);

  const renderContent = () => {
    const content = container.querySelector('#kas-content');
    if (!content) return;
    if (state.tab === 'dashboard') content.innerHTML = renderDashboard(state, stat());
    else if (state.tab === 'pribadi') content.innerHTML = renderPribadi(state);
    else if (state.tab === 'pemasukan' && state.isBendahara) content.innerHTML = renderPemasukan(state);
    else if (state.tab === 'pengeluaran' && state.isBendahara) content.innerHTML = renderPengeluaran(state);
    else if (state.tab === 'rekap' && state.isBendahara) content.innerHTML = renderRekap(state, stat());
    else if (state.tab === 'laporan' && state.isBendahara) content.innerHTML = renderLaporan(state, stat());
    attachContentHandlers(container, state);
  };

  if (!config) {
    container.innerHTML = renderLayout('Kas Kelas', `
      <div class="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h3 class="text-base font-semibold text-slate-900">Kas Kelas Belum Tersedia</h3>
        <p class="mt-1 text-sm text-slate-500">Wali kelas Anda belum mengaktifkan modul Kas Kelas untuk periode ini.</p>
      </div>`);
    container.querySelector('#logout-btn')?.addEventListener('click', () => {
      localStorage.removeItem('simguru_session');
      window.location.hash = '#login';
    });
    return;
  }

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'pribadi', label: 'Pembayaran Saya' },
  ];
  if (isBendahara) {
    tabs.push(
      { id: 'pemasukan', label: 'Pemasukan' },
      { id: 'pengeluaran', label: 'Pengeluaran' },
      { id: 'rekap', label: 'Rekap Kas' },
      { id: 'laporan', label: 'Laporan' },
    );
  }

  const shell = renderLayout(`Kas Kelas ${config.kelas_nama}`, `
    <div class="space-y-4">
      ${isBendahara ? '<div class="rounded-xl bg-indigo-50 px-4 py-2 text-center text-xs font-semibold text-indigo-600">Anda bertindak sebagai Bendahara Kelas</div>' : ''}
      <div class="flex flex-wrap gap-2" id="kas-tabs">
        ${tabs.map((t) => `<button data-tab="${t.id}" class="rounded-full px-3.5 py-2 text-sm font-semibold transition ${state.tab === t.id ? 'bg-[#4F46E5] text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}">${t.label}</button>`).join('')}
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

function renderDashboard(state, s) {
  const labelPeriode = s.labelPeriode || monthLabel(currentMonthKey());
  const target = Number(state.config.target_kas || 0);
  const progress = target > 0 ? Math.min(100, Math.round((s.saldo / target) * 100)) : 0;
  const pengumuman = state.config.pengumuman || '';
  const kelasList = state.transaksi.filter((t) => t.jenis === 'pemasukan' || t.jenis === 'pengeluaran').slice(0, 10);

  return `
    <div class="space-y-4">
      <div class="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 p-5 text-white shadow-[0_20px_60px_rgba(15,23,42,0.2)]">
        <div class="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/15 blur-3xl"></div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80">KAS KELAS ${state.config.kelas_nama}</p>
        <p class="mt-2 text-sm text-white/80">Saldo Saat Ini</p>
        <p class="text-4xl font-extrabold leading-tight">${formatRupiah(s.saldo)}</p>
        <div class="mt-3 flex flex-wrap gap-4 text-sm">
          <span class="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1">↑ ${formatRupiah(s.pemasukanPeriodeIni)} <span class="text-white/70">${labelPeriode}</span></span>
          <span class="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1">↓ ${formatRupiah(s.pengeluaranPeriodeIni)}</span>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div class="rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-100"><p class="text-xs text-slate-500">Pemasukan</p><p class="mt-1 text-sm font-bold text-slate-900">${formatRupiah(s.totalPemasukan)}</p></div>
        <div class="rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-100"><p class="text-xs text-slate-500">Pengeluaran</p><p class="mt-1 text-sm font-bold text-slate-900">${formatRupiah(s.totalPengeluaran)}</p></div>
        <div class="rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-100"><p class="text-xs text-slate-500">Menunggak</p><p class="mt-1 text-sm font-bold text-rose-500">${s.tunggakan.length} siswa</p></div>
      </div>

      ${target > 0 ? `
      <div class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <div class="flex items-center justify-between text-sm"><p class="font-semibold text-slate-900">Target Kas</p><p class="text-slate-500">${formatRupiah(s.saldo)} / ${formatRupiah(target)}</p></div>
        <div class="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500" style="width:${progress}%"></div></div>
        <p class="mt-1 text-right text-xs font-semibold text-emerald-600">${progress}%</p>
      </div>` : ''}

      ${pengumuman ? `<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p class="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">Pengumuman</p><p class="mt-1 whitespace-pre-line text-sm text-amber-800">${pengumuman}</p></div>` : ''}

      <div class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <p class="mb-3 text-sm font-semibold text-slate-900">Riwayat Kas Kelas</p>
        <div class="space-y-2">
          ${kelasList.length ? kelasList.map((t) => `
            <div class="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5">
              <div class="flex h-9 w-9 items-center justify-center rounded-lg ${t.jenis === 'pemasukan' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}">${t.jenis === 'pemasukan' ? '↑' : '↓'}</div>
              <div class="min-w-0 flex-1"><p class="truncate text-sm font-medium text-slate-900">${t.siswa_nama || t.kategori || '-'}</p><p class="truncate text-xs text-slate-500">${formatTanggal(t.tanggal)}</p></div>
              <p class="text-sm font-bold ${t.jenis === 'pemasukan' ? 'text-emerald-600' : 'text-rose-600'}">${formatRupiah(t.nominal)}</p>
            </div>`).join('') : '<p class="text-center text-sm text-slate-400">Belum ada transaksi.</p>'}
        </div>
      </div>
    </div>`;
}

function renderPribadi(state) {
  const frekuensi = state.config.frekuensi || 'bulanan';
  const today = todayInput();
  const currentPeriode = getPeriodKey(today, frekuensi);
  const mine = state.transaksi.filter((t) => t.jenis === 'pemasukan' && t.siswa_id === state.userId);
  const lunasPeriodeIni = mine.some((t) => (t.periode || getMonthKey(new Date(t.tanggal))) === currentPeriode);
  const iuran = Number(state.config.iuran_per_siswa || 0);
  const periodLabel = getPeriodLabel(currentPeriode, frekuensi);

  return `
    <div class="space-y-4">
      <div class="rounded-2xl p-4 text-center shadow-sm ring-1 ring-slate-100 ${lunasPeriodeIni ? 'bg-emerald-50' : 'bg-rose-50'}">
        <p class="text-xs font-semibold uppercase tracking-[0.12em] ${lunasPeriodeIni ? 'text-emerald-600' : 'text-rose-600'}">Status Kas ${periodLabel}</p>
        <p class="mt-1 text-2xl font-extrabold ${lunasPeriodeIni ? 'text-emerald-600' : 'text-rose-600'}">${lunasPeriodeIni ? 'LUNAS' : 'BELUM BAYAR'}</p>
        <p class="mt-1 text-sm ${lunasPeriodeIni ? 'text-emerald-700' : 'text-rose-700'}">Iuran: ${formatRupiah(iuran)}</p>
      </div>
      <div class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <p class="mb-3 text-sm font-semibold text-slate-900">Riwayat Pembayaran Saya</p>
        <div class="space-y-2">
          ${mine.length ? mine.map((t) => `
            <div class="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5">
              <div class="min-w-0 flex-1"><p class="text-sm font-medium text-slate-900">${getPeriodLabel(t.periode || getMonthKey(new Date(t.tanggal)), frekuensi)}</p><p class="text-xs text-slate-500">${formatTanggal(t.tanggal)}</p></div>
              <p class="text-sm font-bold text-emerald-600">${formatRupiah(t.nominal)}</p>
              <button data-receipt="${t.id}" class="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">Bukti</button>
            </div>`).join('') : '<p class="text-center text-sm text-slate-400">Belum ada pembayaran.</p>'}
        </div>
      </div>
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

function renderPemasukan(state) {
  const today = todayInput();
  const frekuensi = state.config.frekuensi || 'bulanan';
  let periodeField = '';
  let defaultPeriode = '';
  if (frekuensi === 'harian') {
    defaultPeriode = today;
    periodeField = `<input id="p-periode" type="date" value="${defaultPeriode}" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />`;
  } else if (frekuensi === 'mingguan') {
    defaultPeriode = getWeekKey(new Date());
    const weeks = getSemesterWeeks(state.context);
    periodeField = `<select id="p-periode" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">${weekOptions(weeks, defaultPeriode)}</select>`;
  } else {
    defaultPeriode = currentMonthKey();
    periodeField = `<select id="p-periode" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">${periodeOptions(getSemesterMonths(state.context), defaultPeriode)}</select>`;
  }
  const periodLabel = frekuensi === 'harian' ? 'Tanggal' : frekuensi === 'mingguan' ? 'Periode Minggu' : 'Periode Bulan';
  return `
    <div class="space-y-4">
      <form id="p-pemasukan" class="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <h4 class="text-base font-semibold text-slate-900">Tambah Pembayaran Kas</h4>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tanggal</label>
          <input id="p-tanggal" type="date" value="${today}" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Siswa</label>
          <select id="p-siswa" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">${memberOptions(state.members)}</select>
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">${periodLabel}</label>
          ${periodeField}
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Nominal</label>
          <input id="p-nominal" type="text" inputmode="numeric" placeholder="Rp 0" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Keterangan</label>
          <input id="p-ket" type="text" placeholder="Misal: Kas Juli 2026" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
        </div>
        <button type="submit" class="w-full rounded-xl bg-[#4F46E5] px-4 py-3 text-sm font-semibold text-white">Simpan Pembayaran</button>
      </form>
    </div>`;
}

function renderPengeluaran(state) {
  const today = todayInput();
  const kategoriOpts = KATEGORI_PENGELUARAN.map((k) => `<option value="${k}">${k}</option>`).join('');
  return `
    <div class="space-y-4">
      <form id="p-pengeluaran" class="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <h4 class="text-base font-semibold text-slate-900">Catat Pengeluaran</h4>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tanggal</label>
          <input id="p-tanggal" type="date" value="${today}" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Kategori</label>
          <select id="p-kategori" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">${kategoriOpts}</select>
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Nominal</label>
          <input id="p-nominal" type="text" inputmode="numeric" placeholder="Rp 0" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Keterangan</label>
          <input id="p-ket" type="text" placeholder="Misal: Fotokopi soal" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
        </div>
        <button type="submit" class="w-full rounded-xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white">Simpan Pengeluaran</button>
      </form>
    </div>`;
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
      periodList = getSemesterMonths(state.context);
      periodLabels = getSemesterMonths(state.context).map((k) => monthLabel(k));
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
            ${getSemesterMonths(state.context).map((k) => `<option value="${k}" ${k === rekapBulan ? 'selected' : ''}>${monthLabel(k)}</option>`).join('')}
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

function renderLaporan(state, s) {
  return `
    <div class="space-y-4">
      <div class="grid grid-cols-3 gap-2">
        <button data-export="excel" class="rounded-xl bg-emerald-500 px-3 py-3 text-sm font-semibold text-white">Excel</button>
        <button data-export="pdf" class="rounded-xl bg-rose-500 px-3 py-3 text-sm font-semibold text-white">PDF</button>
        <button data-export="word" class="rounded-xl bg-blue-500 px-3 py-3 text-sm font-semibold text-white">Word</button>
      </div>
      <div class="space-y-2">
        ${state.transaksi.length ? state.transaksi.map((t) => `
          <div class="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
            <div class="min-w-0 flex-1"><p class="truncate text-sm font-semibold text-slate-900">${t.siswa_nama || t.kategori || '-'}</p><p class="truncate text-xs text-slate-500">${formatTanggal(t.tanggal)} • ${formatRupiah(t.nominal)}</p></div>
            <button data-del="${t.id}" class="rounded-lg bg-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-600">Hapus</button>
          </div>`).join('') : '<p class="text-center text-sm text-slate-400">Belum ada transaksi.</p>'}
      </div>
    </div>`;
}

function attachContentHandlers(container, state) {
  const content = container.querySelector('#kas-content');
  if (!content) return;

  content.querySelectorAll('[data-receipt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = state.transaksi.find((x) => x.id === btn.getAttribute('data-receipt'));
      if (t) receiptModal(container, t);
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

  content.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-del');
      if (!confirm('Hapus transaksi ini?')) return;
      await deleteTransaksi(id);
    });
  });

  const pPemasukan = content.querySelector('#p-pemasukan');
  if (pPemasukan) {
    pPemasukan.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nominal = parseNumber(pPemasukan.querySelector('#p-nominal').value);
      if (!nominal) { alert('Nominal harus diisi.'); return; }
      const siswaId = pPemasukan.querySelector('#p-siswa').value;
      const siswaNama = pPemasukan.querySelector('#p-siswa').selectedOptions[0]?.textContent || '';
      const tanggal = pPemasukan.querySelector('#p-tanggal').value;
      const periode = pPemasukan.querySelector('#p-periode').value;
      await saveTransaksi({
        kas_id: state.kasId, tahun_ajaran_id: state.context.tahun_ajaran_aktif, semester_id: state.context.semester_aktif,
        kelas_id: state.kelasId, kelas_nama: state.config.kelas_nama,
        jenis: 'pemasukan', tanggal,
        siswa_id: siswaId, siswa_nama: siswaNama, periode,
        nominal, keterangan: pPemasukan.querySelector('#p-ket').value.trim(), kategori: 'Iuran',
        created_by: state.userId, created_by_nama: state.userName, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      alert('Pembayaran berhasil disimpan.');
    });
  }

  const pPengeluaran = content.querySelector('#p-pengeluaran');
  if (pPengeluaran) {
    pPengeluaran.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nominal = parseNumber(pPengeluaran.querySelector('#p-nominal').value);
      if (!nominal) { alert('Nominal harus diisi.'); return; }
      await saveTransaksi({
        kas_id: state.kasId, tahun_ajaran_id: state.context.tahun_ajaran_aktif, semester_id: state.context.semester_aktif,
        kelas_id: state.kelasId, kelas_nama: state.config.kelas_nama,
        jenis: 'pengeluaran', tanggal: pPengeluaran.querySelector('#p-tanggal').value,
        kategori: pPengeluaran.querySelector('#p-kategori').value, nominal,
        keterangan: pPengeluaran.querySelector('#p-ket').value.trim(),
        created_by: state.userId, created_by_nama: state.userName, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      alert('Pengeluaran berhasil disimpan.');
    });
  }

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
}
