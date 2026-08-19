import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext, getSessionUserKeys, normalizeUserKey } from '../../utils/helpers.js';
import { getDocumentsWhere, getAttendanceSummary } from '../../firebase/data-service.js';

const statusStyles = {
  H: 'bg-blue-50 text-blue-700 border-blue-200',
  S: 'bg-amber-50 text-amber-700 border-amber-200',
  I: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  A: 'bg-rose-50 text-rose-700 border-rose-200',
};
const ALPA_ALERT_THRESHOLD = 3;

function getDayName(dateString) {
  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return dayNames[new Date(dateString).getDay()] || '-';
}

function formatDate(dateString) {
  if (!dateString) {
    return '-';
  }
  return new Date(dateString).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export async function renderSiswaAbsensiPage(container) {
  const context = getStoredContext();
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const siswaKeys = getSessionUserKeys(session, context);
  const siswaId = session?.user?.username || session?.user?.id || siswaKeys[0] || '';

  // ==========================================================================
  // OPTIMASI READ (Fase 2): counter H/S/I/A dari dokumen ringkasan (1 read).
  // ----------------------------------------------------------------------------
  // Kartu ringkasan kehadiran cukup memakai `absensi_ringkasan_siswa` melalui
  // getAttendanceSummary (1 dokumen). Riwayat per-tanggal — yang butuh baris
  // mentah `absensi` — baru dibaca saat siswa menekan "Muat riwayat", sehingga
  // mayoritas kunjungan (yang hanya melihat rekap) tidak lagi membaca seluruh
  // baris absensi siswa.
  // ==========================================================================
  let summary = { H: 0, S: 0, I: 0, A: 0 };
  try {
    const summaryDoc = siswaId ? await getAttendanceSummary(context, siswaId, siswaKeys) : null;
    if (summaryDoc) {
      summary = {
        H: Number(summaryDoc.total_hadir || 0),
        S: Number(summaryDoc.total_sakit || 0),
        I: Number(summaryDoc.total_izin || 0),
        A: Number(summaryDoc.total_alpa || 0),
      };
    }
  } catch (error) {
    console.warn('Gagal memuat ringkasan absensi:', error);
  }

  // Riwayat per-tanggal dimuat on-demand.
  let records = [];
  let recordsLoaded = false;

  async function loadRecords() {
    const docs = siswaKeys.length
      ? await getDocumentsWhere('absensi', [{ field: 'siswa_id', operator: 'in', value: siswaKeys.slice(0, 10) }], { cacheMs: 60000 })
      : [];
    records = docs
      .filter((item) => item.tahun_ajaran_id === context.tahun_ajaran_aktif && item.semester_id === context.semester_aktif && siswaKeys.includes(normalizeUserKey(item.siswa_id)))
      .sort((a, b) => String(b.tanggal || '').localeCompare(String(a.tanggal || '')));
    recordsLoaded = true;
    return records;
  }

  const hasAlpaWarning = summary.A >= ALPA_ALERT_THRESHOLD;

  const renderRows = (list) => list.length
    ? list.map((item) => `
                <tr class="border-t border-slate-100">
                  <td class="px-3 py-3">${formatDate(item.tanggal)}</td>
                  <td class="px-3 py-3">${getDayName(item.tanggal)}</td>
                  <td class="px-3 py-3">${item.mapel_nama || item.mapel_id || '-'}</td>
                  <td class="px-3 py-3">${item.kelas_nama || item.kelas_id || '-'}</td>
                  <td class="px-3 py-3 text-center">
                    <span class="inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[item.status] || 'border-slate-200 bg-slate-50 text-slate-600'}">${item.status || '-'}</span>
                  </td>
                </tr>
              `).join('')
    : `
                <tr>
                  <td colspan="5" class="px-3 py-10 text-center text-slate-500">Belum ada data absensi pada filter ini.</td>
                </tr>
              `;

  const html = renderLayout('Absensi Siswa', `
    <div class="space-y-6">
      <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div class="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <p class="text-xs uppercase tracking-[0.12em] text-blue-600">Hadir</p>
          <p class="mt-2 text-2xl font-semibold text-blue-700">${summary.H}</p>
        </div>
        <div class="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p class="text-xs uppercase tracking-[0.12em] text-amber-600">Sakit</p>
          <p class="mt-2 text-2xl font-semibold text-amber-700">${summary.S}</p>
        </div>
        <div class="rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
          <p class="text-xs uppercase tracking-[0.12em] text-cyan-600">Izin</p>
          <p class="mt-2 text-2xl font-semibold text-cyan-700">${summary.I}</p>
        </div>
        <div class="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <div class="flex items-center gap-2">
            <p class="text-xs uppercase tracking-[0.12em] text-rose-600">Alpa</p>
            ${hasAlpaWarning ? '<span class="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-semibold text-rose-700">Peringatan</span>' : ''}
          </div>
          <p class="mt-2 text-2xl font-semibold text-rose-700">${summary.A}</p>
        </div>
      </section>

      ${hasAlpaWarning ? `
        <section class="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <div class="flex items-start gap-3">
            <div class="mt-1 h-2.5 w-2.5 rounded-full bg-rose-500"></div>
            <div>
              <p class="text-sm font-semibold text-rose-700">Peringatan Kehadiran</p>
              <p class="mt-1 text-sm text-rose-600">Jumlah Alpa Anda sudah ${summary.A} kali (ambang ${ALPA_ALERT_THRESHOLD}). Segera tingkatkan disiplin kehadiran dan komunikasikan kendala ke wali kelas.</p>
            </div>
          </div>
        </section>
      ` : ''}

      <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="text-xl font-semibold text-slate-900">Riwayat Kehadiran</h2>
            <p class="mt-1 text-sm text-slate-500">Rincian per tanggal dimuat saat dibutuhkan untuk menghemat pembacaan data.</p>
          </div>
          <div class="flex items-center gap-2">
            <label for="filter-mapel" class="text-sm font-medium text-slate-600">Mapel</label>
            <select id="filter-mapel" class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" disabled>
              <option value="">Semua</option>
            </select>
          </div>
        </div>

        <div id="absensi-history-cta" class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <p class="text-sm text-slate-500">Tekan tombol di bawah untuk menampilkan riwayat kehadiran per tanggal.</p>
          <button id="absensi-load-history" type="button" class="mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path></svg>
            <span>Muat riwayat</span>
          </button>
        </div>

        <div id="absensi-history-table" class="overflow-x-auto rounded-2xl border border-slate-100" hidden>
          <table class="min-w-full text-sm text-slate-700">
            <thead class="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th class="px-3 py-3 text-left">Tanggal</th>
                <th class="px-3 py-3 text-left">Hari</th>
                <th class="px-3 py-3 text-left">Mapel</th>
                <th class="px-3 py-3 text-left">Kelas</th>
                <th class="px-3 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody id="absensi-tbody"></tbody>
          </table>
        </div>
      </section>
    </div>
  `);

  container.innerHTML = html;

  const filterSelect = container.querySelector('#filter-mapel');
  const tbody = container.querySelector('#absensi-tbody');
  const historyCta = container.querySelector('#absensi-history-cta');
  const historyTable = container.querySelector('#absensi-history-table');
  const loadHistoryBtn = container.querySelector('#absensi-load-history');

  const applyFilter = () => {
    if (!tbody) return;
    const val = filterSelect?.value || '';
    const filtered = val ? records.filter((r) => (r.mapel_nama || r.mapel_id) === val) : records;
    tbody.innerHTML = renderRows(filtered);
  };

  // Muat riwayat on-demand: hanya di sinilah baris mentah `absensi` dibaca.
  loadHistoryBtn?.addEventListener('click', async () => {
    if (loadHistoryBtn.dataset.loading === 'true') return;
    loadHistoryBtn.dataset.loading = 'true';
    loadHistoryBtn.disabled = true;
    const label = loadHistoryBtn.querySelector('span');
    const original = label ? label.textContent : '';
    if (label) label.textContent = 'Memuat...';
    try {
      if (!recordsLoaded) await loadRecords();
      // Isi opsi filter mapel dari data yang baru dimuat.
      if (filterSelect) {
        const subjects = [...new Set(records.map((r) => r.mapel_nama || r.mapel_id).filter(Boolean))].sort((a, b) => a.localeCompare(b));
        filterSelect.innerHTML = `<option value="">Semua</option>${subjects.map((s) => `<option value="${s}">${s}</option>`).join('')}`;
        filterSelect.disabled = false;
      }
      historyCta?.setAttribute('hidden', '');
      historyTable?.removeAttribute('hidden');
      applyFilter();
    } catch (error) {
      console.warn('Gagal memuat riwayat absensi:', error);
      if (label) label.textContent = original || 'Muat riwayat';
      loadHistoryBtn.dataset.loading = 'false';
      loadHistoryBtn.disabled = false;
    }
  });

  filterSelect?.addEventListener('change', applyFilter);

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
