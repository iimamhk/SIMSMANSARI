import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import {
  getTeachingAssignmentsForUser,
  getActiveTeachingAssignments,
  getAttendanceRecords,
  getClassMembers,
  saveDocument,
  getDocumentsWhere,
  deleteDocument,
} from '../../firebase/data-service.js';

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('simguru_session') || '{}');
  } catch {
    return {};
  }
}

const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const statusMeta = {
  H: { label: 'Hadir', short: 'H', classes: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  S: { label: 'Sakit', short: 'S', classes: 'border-amber-200 bg-amber-50 text-amber-700' },
  I: { label: 'Izin', short: 'I', classes: 'border-cyan-200 bg-cyan-50 text-cyan-700' },
  A: { label: 'Alpa', short: 'A', classes: 'border-rose-200 bg-rose-50 text-rose-700' },
};
const statusOrder = ['H', 'S', 'I', 'A'];

function getDayName(dateString) {
  if (!dateString) return '-';
  const day = new Date(dateString).getDay();
  return dayNames[day] || '-';
}

function formatIndoDate(dateString) {
  if (!dateString) return '-';
  const d = new Date(dateString);
  return `${dayNames[d.getDay()]}, ${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
}

function todayISO() {
  const t = new Date();
  const day = t.getDay();
  if (day === 0) t.setDate(t.getDate() + 1);
  else if (day === 6) t.setDate(t.getDate() + 2);
  return t.toISOString().slice(0, 10);
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusBadge(status) {
  const meta = statusMeta[status] || statusMeta.H;
  return `<span class="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${meta.classes}">${meta.short}</span>`;
}

function statusSelectOptions(current) {
  return statusOrder
    .map((s) => `<option value="${s}" ${s === current ? 'selected' : ''}>${statusMeta[s].short} - ${statusMeta[s].label}</option>`)
    .join('');
}

function journalAbsensiText(journal) {
  const list = Array.isArray(journal.absensi) ? journal.absensi : [];
  return list.length ? list.map((a) => `${a.siswa_nama || '-'} (${a.status || '-'})`).join(', ') : '-';
}

function journalKetText(journal) {
  const ketMap = journal.keterangan || {};
  const values = Object.values(ketMap).filter((v) => v && String(v).trim());
  return values.length ? values.join('; ') : '-';
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

function buildJournalExcel(journals) {
  if (!window.XLSX) {
    alert('Library Excel belum dimuat. Coba muat ulang halaman.');
    return;
  }

  const worksheetData = [
    ['No', 'Hari / Tanggal', 'Kelas', 'Mata Pelajaran', 'Jam Ke', 'Tujuan Pembelajaran', 'Refleksi', 'Absensi (S/I/A)', 'Keterangan'],
    ...journals.map((j, index) => [
      index + 1,
      formatIndoDate(j.tanggal),
      j.kelas_nama || '-',
      j.mapel_nama || '-',
      j.jam_ke || '-',
      j.tujuan_pembelajaran || '-',
      j.refleksi || '-',
      journalAbsensiText(j),
      journalKetText(j),
    ]),
  ];

  const workbook = window.XLSX.utils.book_new();
  const worksheet = window.XLSX.utils.aoa_to_sheet(worksheetData);
  worksheet['!cols'] = [
    { wch: 4 }, { wch: 22 }, { wch: 8 }, { wch: 20 }, { wch: 8 },
    { wch: 40 }, { wch: 40 }, { wch: 40 }, { wch: 30 },
  ];
  window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Jurnal');
  const wbout = window.XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([wbout], { type: 'application/octet-stream' }), 'rekap-jurnal-guru.xlsx');
}

function buildJournalPdf(journals, appContext = {}) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    alert('Library PDF belum dimuat. Coba muat ulang halaman.');
    return;
  }

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  const maxWidth = doc.internal.pageSize.width - margin * 2;
  let y = margin;

  doc.setFontSize(16);
  doc.text('Rekap Jurnal Guru', margin, y);
  y += 22;
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Tahun Ajaran: ${appContext.tahun_ajaran_aktif_nama || appContext.tahun_ajaran_aktif || '-'}  |  Semester: ${appContext.semester_aktif_nama || appContext.semester_aktif || '-'}`, margin, y);
  doc.setTextColor(0);
  y += 24;

  const writeWrapped = (text, x, currentY, indent = 0, bold = false) => {
    doc.setFont(undefined, bold ? 'bold' : 'normal');
    const lines = doc.splitTextToSize(String(text), maxWidth - indent);
    doc.text(lines, x + indent, currentY);
    return currentY + lines.length * 14;
  };

  if (!journals.length) {
    doc.setFontSize(11);
    doc.text('Belum ada data jurnal.', margin, y);
  }

  journals.forEach((j, index) => {
    if (y > doc.internal.pageSize.height - margin - 120) {
      doc.addPage();
      y = margin;
    }
    y = writeWrapped(`${index + 1}. ${formatIndoDate(j.tanggal)}  |  ${j.kelas_nama || '-'}  |  ${j.mapel_nama || '-'}`, margin, y, 0, true);
    y = writeWrapped(`Jam Ke: ${j.jam_ke || '-'}`, margin, y, 12);
    y = writeWrapped(`Tujuan: ${j.tujuan_pembelajaran || '-'}`, margin, y, 12);
    y = writeWrapped(`Refleksi: ${j.refleksi || '-'}`, margin, y, 12);
    y = writeWrapped(`Absensi: ${journalAbsensiText(j)}`, margin, y, 12);
    y = writeWrapped(`Ket: ${journalKetText(j)}`, margin, y, 12);
    y += 16;
  });

  doc.save('rekap-jurnal-guru.pdf');
}

export async function renderGuruJurnalPage(container) {
  const context = getStoredContext();
  const session = getSession();
  const userId = session?.user?.username || context?.user_logged_in || '';
  const assignments = userId
    ? await getTeachingAssignmentsForUser(context, userId)
    : await getActiveTeachingAssignments(context);
  const selectedAssignment = assignments[0] || null;
  const selectedDate = todayISO();
  const members = selectedAssignment ? await getClassMembers(context, selectedAssignment.kelas_id) : [];
  const attendanceRecords = selectedAssignment ? await getAttendanceRecords(context, selectedAssignment.id) : [];

  const assignmentOptions = assignments
    .map((item) => `<option value="${item.id}" ${item.id === selectedAssignment?.id ? 'selected' : ''}>${item.kelas_nama} • ${item.mapel_nama}</option>`)
    .join('');

  const html = renderLayout('Jurnal Guru', `
    <div class="space-y-5">
      <div class="relative overflow-hidden rounded-[28px] border border-indigo-100 bg-gradient-to-br from-white via-indigo-50 to-violet-50 p-4 shadow-[0_24px_70px_-42px_rgba(79,70,229,0.55)] sm:p-5">
        <div class="absolute -left-10 top-0 h-24 w-24 rounded-full bg-indigo-200/50 blur-3xl"></div>
        <div class="absolute bottom-0 right-6 h-20 w-20 rounded-full bg-violet-200/50 blur-3xl"></div>
        <div class="relative">
          <div class="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-700 backdrop-blur-sm">
            <span class="inline-block h-2 w-2 rounded-full bg-indigo-500"></span>
            Jurnal Digital
          </div>
          <h2 class="text-lg font-semibold text-slate-900 sm:text-xl">Jurnal Mengajar Guru</h2>
          <div class="mt-4 md:sticky md:top-4 md:z-20 md:rounded-2xl md:bg-white/70 md:p-1 md:backdrop-blur">
            <div class="grid grid-cols-2 gap-2 rounded-[24px] border border-white/80 bg-white/70 p-1 shadow-[0_14px_32px_-24px_rgba(15,23,42,0.5)] sm:flex sm:flex-wrap sm:rounded-full">
              <button data-tab="input" type="button" class="tab-btn inline-flex w-full items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-semibold transition bg-gradient-to-r from-slate-900 via-indigo-700 to-violet-600 text-white shadow-[0_16px_36px_-16px_rgba(15,23,42,0.75)] ring-1 ring-white/20">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                  <path d="M8 11h8M8 15h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
                Isi Jurnal
              </button>
              <button data-tab="rekap" type="button" class="tab-btn inline-flex w-full items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-semibold transition bg-white/75 text-slate-600 ring-1 ring-slate-200/80 hover:bg-white hover:text-slate-900 hover:ring-indigo-200">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 6h16M8 11h8M8 16h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
                Rekap Jurnal
              </button>
            </div>
          </div>
        </div>
      </div>

      <section id="tab-input" class="space-y-4">
        <div class="rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.24)] sm:p-5">
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="text-sm font-medium text-slate-700">Kelas</label>
              <select id="assignment-select" class="mt-1.5 w-full appearance-none rounded-2xl border-2 border-blue-600 bg-gradient-to-r from-indigo-600 via-blue-500 to-orange-500 px-3.5 py-3 text-sm font-bold text-white shadow-[0_14px_30px_-18px_rgba(59,130,246,0.95)] outline-none transition hover:from-indigo-700 hover:via-blue-600 hover:to-orange-600 focus:border-orange-300 focus:ring-4 focus:ring-orange-200/70">
                ${assignmentOptions || '<option value="">Tidak ada relasi aktif</option>'}
              </select>
            </div>
            <div>
              <label class="text-sm font-medium text-slate-700">Hari / Tanggal</label>
              <input id="journal-date" type="date" value="${selectedDate}" class="mt-1.5 w-full rounded-2xl border border-indigo-100 bg-gradient-to-r from-white to-indigo-50 px-3.5 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100" />
            </div>
          </div>

          <p id="journal-day-label" class="mt-3 text-sm font-semibold text-indigo-700">${formatIndoDate(selectedDate)}</p>

          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label class="text-sm font-medium text-slate-700">Mata Pelajaran</label>
              <input id="journal-mapel" type="text" placeholder="Otomatis dari relasi" class="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100" />
            </div>
            <div>
              <label class="text-sm font-medium text-slate-700">Jam Ke</label>
              <input id="journal-jam" type="text" placeholder="Otomatis dari relasi" class="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100" />
            </div>
          </div>

          <div class="mt-4 grid gap-4">
            <div>
              <label class="text-sm font-medium text-slate-700">Tujuan Pembelajaran</label>
              <textarea id="journal-tujuan" rows="3" placeholder="Contoh: Peserta didik mampu memahami operasi polinomial" class="mt-1.5 w-full rounded-[22px] border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"></textarea>
            </div>
            <div>
              <label class="text-sm font-medium text-slate-700">Refleksi</label>
              <textarea id="journal-refleksi" rows="3" placeholder="Contoh: Siswa antusias mengikuti pembelajaran" class="mt-1.5 w-full rounded-[22px] border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"></textarea>
            </div>
          </div>
        </div>

        <div class="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.24)] sm:p-5">
          <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="text-sm font-semibold text-slate-800">Absensi Siswa</p>
              <p class="mt-1 text-xs text-slate-500">Status terambil otomatis dari modul absen &amp; dapat diedit.</p>
            </div>
            <button id="save-journal-btn" type="button" class="rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_30px_-18px_rgba(79,70,229,0.95)] transition hover:-translate-y-0.5 hover:from-indigo-600 hover:to-violet-600">Simpan Jurnal</button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[520px] text-sm">
              <thead>
                <tr class="border-b border-slate-200 text-left text-[11px] uppercase tracking-[0.12em] text-slate-500">
                  <th class="w-10 px-2 py-2">No</th>
                  <th class="px-2 py-2">Nama</th>
                  <th class="px-2 py-2">Status (S/I/A)</th>
                  <th class="px-2 py-2">Ket.</th>
                </tr>
              </thead>
              <tbody id="journal-attendance-body" class="divide-y divide-slate-100"></tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="tab-rekap" class="hidden space-y-4">
        <div class="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.24)] sm:p-5">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-xl font-semibold text-slate-900">Rekap Jurnal Lengkap</h2>
            <div class="flex flex-wrap items-center gap-2">
              <button id="export-excel-btn" type="button" class="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100">
                <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
                Excel
              </button>
              <button id="export-pdf-btn" type="button" class="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">
                <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
                PDF
              </button>
              <span class="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-700">Semester Aktif</span>
            </div>
          </div>
          <div class="mb-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label class="text-sm font-medium text-slate-700">Kelas</label>
              <select id="rekap-kelas" class="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100">
                <option value="all">Semua Kelas</option>
                ${assignmentOptions}
              </select>
            </div>
            <div>
              <label class="text-sm font-medium text-slate-700">Urutkan</label>
              <select id="rekap-sort" class="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100">
                <option value="desc">Terbaru</option>
                <option value="asc">Terlama</option>
              </select>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full min-w-[860px] text-sm">
              <thead>
                <tr class="border-b border-slate-200 text-left text-[11px] uppercase tracking-[0.1em] text-slate-500">
                  <th class="w-10 px-2 py-2">No</th>
                  <th class="px-2 py-2">Hari / Tanggal</th>
                  <th class="px-2 py-2">Kelas</th>
                  <th class="px-2 py-2">Mata Pelajaran</th>
                  <th class="px-2 py-2">Jam Ke</th>
                  <th class="px-2 py-2">Tujuan Pembelajaran</th>
                  <th class="px-2 py-2">Refleksi</th>
                  <th class="px-2 py-2">Absensi</th>
                  <th class="px-2 py-2">Ket.</th>
                  <th class="px-2 py-2">Aksi</th>
                </tr>
              </thead>
              <tbody id="rekap-body" class="divide-y divide-slate-100"></tbody>
            </table>
          </div>
          <div id="rekap-empty" class="hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">Belum ada jurnal yang tercatat.</div>
        </div>
      </section>
    </div>

    <div id="journal-modal" class="fixed inset-0 z-[60] hidden items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div class="modal-card w-full max-w-sm rounded-[28px] border border-white/60 bg-white p-6 text-center shadow-[0_30px_80px_-30px_rgba(15,23,42,0.5)]">
        <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg">
          <svg viewBox="0 0 24 24" class="h-8 w-8 text-white" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 id="journal-modal-title" class="mt-4 text-lg font-semibold text-slate-900">Jurnal Telah Diisi</h3>
        <p id="journal-modal-desc" class="mt-2 text-sm text-slate-500">Jurnal mengajar berhasil disimpan ke sistem. Terima kasih atas catatannya.</p>
        <button id="journal-modal-close" type="button" class="mt-5 w-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_30px_-18px_rgba(79,70,229,0.95)] transition hover:-translate-y-0.5 hover:from-indigo-600 hover:to-violet-600">Selesai</button>
      </div>
    </div>
  `);

  container.innerHTML = html;

  const assignmentSelect = container.querySelector('#assignment-select');
  const journalDateInput = container.querySelector('#journal-date');
  const journalDayLabel = container.querySelector('#journal-day-label');
  const journalMapelInput = container.querySelector('#journal-mapel');
  const journalJamInput = container.querySelector('#journal-jam');
  const journalTujuanInput = container.querySelector('#journal-tujuan');
  const journalRefleksiInput = container.querySelector('#journal-refleksi');
  const attendanceBody = container.querySelector('#journal-attendance-body');
  const saveJournalBtn = container.querySelector('#save-journal-btn');
  const tabButtons = Array.from(container.querySelectorAll('.tab-btn'));
  const tabInput = container.querySelector('#tab-input');
  const tabRekap = container.querySelector('#tab-rekap');
  const rekapKelas = container.querySelector('#rekap-kelas');
  const rekapSort = container.querySelector('#rekap-sort');
  const rekapBody = container.querySelector('#rekap-body');
  const rekapEmpty = container.querySelector('#rekap-empty');
  const modal = container.querySelector('#journal-modal');
  const modalClose = container.querySelector('#journal-modal-close');

  let selectedAssignmentId = selectedAssignment?.id || '';
  let currentMembers = members;
  let currentAttendance = attendanceRecords;
  let currentAssignment = selectedAssignment;
  let editingId = null;
  let editingCreatedAt = '';
  let prefillAbsensi = null;
  let prefillKet = {};
  let currentJournals = [];

  function getAssignmentById(id) {
    return assignments.find((item) => item.id === id) || null;
  }

  function getStatusForStudent(studentId) {
    const record = currentAttendance.find((item) => item.tanggal === selectedDate && String(item.siswa_id) === String(studentId));
    return record ? record.status : 'H';
  }

  function getKetForStudent(studentId) {
    const record = currentAttendance.find((item) => item.tanggal === selectedDate && String(item.siswa_id) === String(studentId));
    return record?.keterangan ? String(record.keterangan) : '';
  }

  function applyRelationToFields() {
    const assignment = getAssignmentById(selectedAssignmentId);
    currentAssignment = assignment;
    if (!assignment) return;
    journalMapelInput.value = assignment.mapel_nama || '';
    journalJamInput.value = assignment.jam_ke || '';
  }

  async function refreshAttendanceForSelection() {
    const assignment = getAssignmentById(selectedAssignmentId);
    if (!assignment) {
      currentMembers = [];
      currentAttendance = [];
      renderAttendanceRows();
      return;
    }
    currentMembers = await getClassMembers(context, assignment.kelas_id);
    currentAttendance = await getAttendanceRecords(context, assignment.id);
    renderAttendanceRows();
  }

  function renderAttendanceRows() {
    if (prefillAbsensi) {
      if (!prefillAbsensi.length) {
        attendanceBody.innerHTML = '<tr><td colspan="4" class="px-2 py-4 text-center text-sm text-slate-500">Tidak ada siswa berstatus S/I/A pada jurnal ini.</td></tr>';
        return;
      }

      const sorted = [...prefillAbsensi].sort((a, b) => {
        const nameA = (a.siswa_nama || '').toLowerCase();
        const nameB = (b.siswa_nama || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });

      attendanceBody.innerHTML = sorted
        .map((entry, index) => {
          const studentId = entry.siswa_id || entry.id;
          const name = entry.siswa_nama || '-';
          const status = entry.status || 'S';
          const ket = prefillKet[studentId] || '';
          return `
            <tr class="hover:bg-slate-50/70">
              <td class="px-2 py-2 text-slate-500">${index + 1}</td>
              <td class="px-2 py-2 font-medium text-slate-800">${escapeHtml(name)}</td>
              <td class="px-2 py-2">
                <select class="journal-status-select w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" data-student-id="${studentId}" data-student-name="${escapeHtml(name)}">
                  ${statusSelectOptions(status)}
                </select>
              </td>
              <td class="px-2 py-2">
                <input type="text" class="journal-ket-input w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" data-student-id="${studentId}" placeholder="Keterangan" value="${escapeHtml(ket)}" />
              </td>
            </tr>
          `;
        })
        .join('');
      return;
    }

    if (!currentMembers.length) {
      attendanceBody.innerHTML = '<tr><td colspan="4" class="px-2 py-4 text-center text-sm text-slate-500">Belum ada siswa pada kelas ini.</td></tr>';
      return;
    }

    const sorted = [...currentMembers]
      .filter((member) => {
        const studentId = member.siswa_id || member.id;
        const status = getStatusForStudent(studentId);
        return status === 'S' || status === 'I' || status === 'A';
      })
      .sort((a, b) => {
        const nameA = (a.siswa_nama || a.nama || '').toLowerCase();
        const nameB = (b.siswa_nama || b.nama || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });

    if (!sorted.length) {
      attendanceBody.innerHTML = '<tr><td colspan="4" class="px-2 py-4 text-center text-sm text-slate-500">Tidak ada siswa berstatus S/I/A pada tanggal ini.</td></tr>';
      return;
    }

    attendanceBody.innerHTML = sorted
      .map((member, index) => {
        const studentId = member.siswa_id || member.id;
        const name = member.siswa_nama || member.nama || '-';
        const status = getStatusForStudent(studentId);
        const ket = getKetForStudent(studentId);
        return `
          <tr class="hover:bg-slate-50/70">
            <td class="px-2 py-2 text-slate-500">${index + 1}</td>
            <td class="px-2 py-2 font-medium text-slate-800">${escapeHtml(name)}</td>
            <td class="px-2 py-2">
              <select class="journal-status-select w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" data-student-id="${studentId}" data-student-name="${escapeHtml(name)}">
                ${statusSelectOptions(status)}
              </select>
            </td>
            <td class="px-2 py-2">
              <input type="text" class="journal-ket-input w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" data-student-id="${studentId}" placeholder="Keterangan" value="${escapeHtml(ket)}" />
            </td>
          </tr>
        `;
      })
      .join('');
  }

  function loadJournalIntoForm(journal) {
    editingId = journal.firestoreId || journal.id || null;
    editingCreatedAt = journal.created_at || '';
    prefillAbsensi = Array.isArray(journal.absensi) ? journal.absensi : [];
    prefillKet = journal.keterangan || {};

    const assignmentId = journal.pengajaran_id || '';
    if (assignmentId && getAssignmentById(assignmentId)) {
      selectedAssignmentId = assignmentId;
      assignmentSelect.value = assignmentId;
    }
    applyRelationToFields();

    journalDateInput.value = journal.tanggal || '';
    journalDayLabel.textContent = formatIndoDate(journalDateInput.value);
    journalMapelInput.value = journal.mapel_nama || '';
    journalJamInput.value = journal.jam_ke || '';
    journalTujuanInput.value = journal.tujuan_pembelajaran || '';
    journalRefleksiInput.value = journal.refleksi || '';

    renderAttendanceRows();
    setMainTab('input');
  }

  function setMainTab(targetTab) {
    const key = targetTab === 'rekap' ? 'rekap' : 'input';
    tabInput.classList.toggle('hidden', key !== 'input');
    tabRekap.classList.toggle('hidden', key !== 'rekap');

    tabButtons.forEach((button) => {
      const active = button.getAttribute('data-tab') === key;
      button.className = `tab-btn inline-flex w-full items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-semibold transition ${active ? 'bg-gradient-to-r from-slate-900 via-indigo-700 to-violet-600 text-white shadow-[0_16px_36px_-16px_rgba(15,23,42,0.75)] ring-1 ring-white/20' : 'bg-white/75 text-slate-600 ring-1 ring-slate-200/80 hover:bg-white hover:text-slate-900 hover:ring-indigo-200'}`;
    });

    if (key === 'rekap') {
      loadRecap();
    }
  }

  async function loadRecap() {
    const filterKelas = rekapKelas?.value || 'all';
    const sortDir = rekapSort?.value || 'desc';
    let journals = await getDocumentsWhere('jurnal_guru', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
      { field: 'guru_id', operator: '==', value: userId },
    ], { cacheMs: 120000 });

    if (filterKelas !== 'all') {
      journals = journals.filter((item) => item.pengajaran_id === filterKelas);
    }

    journals = journals.sort((a, b) => {
      const av = String(a.tanggal || '');
      const bv = String(b.tanggal || '');
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    currentJournals = journals;

    if (!journals.length) {
      rekapBody.innerHTML = '';
      rekapEmpty.classList.remove('hidden');
      return;
    }
    rekapEmpty.classList.add('hidden');

    rekapBody.innerHTML = journals
      .map((journal, index) => {
        const absensiList = Array.isArray(journal.absensi) ? journal.absensi : [];
        const ketMap = journal.keterangan || {};
        const absensiCell = absensiList.length
          ? absensiList
              .map((a) => `<div class="flex items-center gap-1.5">${statusBadge(a.status)}<span class="text-slate-600">${escapeHtml(a.siswa_nama || '-')}</span></div>`)
              .join('')
          : '<span class="text-slate-400">-</span>';
        const ketValues = Object.values(ketMap).filter((v) => v && String(v).trim());
        const ketCell = ketValues.length ? ketValues.map((v) => `<div>${escapeHtml(v)}</div>`).join('') : '<span class="text-slate-400">-</span>';
        return `
          <tr class="align-top hover:bg-slate-50/70">
            <td class="px-2 py-3 text-slate-500">${index + 1}</td>
            <td class="px-2 py-3 font-medium text-slate-800">${formatIndoDate(journal.tanggal)}</td>
            <td class="px-2 py-3 text-slate-700">${escapeHtml(journal.kelas_nama || '-')}</td>
            <td class="px-2 py-3 text-slate-700">${escapeHtml(journal.mapel_nama || '-')}</td>
            <td class="px-2 py-3 text-slate-700">${escapeHtml(journal.jam_ke || '-')}</td>
            <td class="px-2 py-3 text-slate-600">${escapeHtml(journal.tujuan_pembelajaran || '-')}</td>
            <td class="px-2 py-3 text-slate-600">${escapeHtml(journal.refleksi || '-')}</td>
            <td class="px-2 py-3 space-y-1">${absensiCell}</td>
            <td class="px-2 py-3 space-y-1 text-xs text-slate-500">${ketCell}</td>
            <td class="px-2 py-3">
              <div class="flex flex-col gap-1.5">
                <button type="button" class="rekap-edit-btn rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-100" data-id="${journal.firestoreId || journal.id}">Edit</button>
                <button type="button" class="rekap-delete-btn rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100" data-id="${journal.firestoreId || journal.id}">Hapus</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    Array.from(rekapBody.querySelectorAll('.rekap-delete-btn')).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!id) return;
        if (!confirm('Hapus jurnal ini?')) return;
        await deleteDocument('jurnal_guru', id);
        loadRecap();
      });
    });

    Array.from(rekapBody.querySelectorAll('.rekap-edit-btn')).forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const journal = journals.find((item) => (item.firestoreId || item.id) === id);
        if (journal) loadJournalIntoForm(journal);
      });
    });
  }

  function showModal(isEdit = false) {
    const titleEl = modal.querySelector('#journal-modal-title');
    const descEl = modal.querySelector('#journal-modal-desc');
    if (titleEl) titleEl.textContent = isEdit ? 'Jurnal Diperbarui' : 'Jurnal Telah Diisi';
    if (descEl) descEl.textContent = isEdit
      ? 'Perubahan jurnal mengajar berhasil disimpan.'
      : 'Jurnal mengajar berhasil disimpan ke sistem. Terima kasih atas catatannya.';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    requestAnimationFrame(() => {
      const card = modal.querySelector('.modal-card');
      if (card) {
        card.style.animation = 'navPillIn 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)';
      }
    });
  }

  function hideModal() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => setMainTab(button.getAttribute('data-tab')));
  });

  assignmentSelect?.addEventListener('change', async () => {
    selectedAssignmentId = assignmentSelect.value;
    applyRelationToFields();
    await refreshAttendanceForSelection();
  });

  journalDateInput?.addEventListener('change', async () => {
    journalDayLabel.textContent = formatIndoDate(journalDateInput.value);
    await refreshAttendanceForSelection();
  });

  rekapKelas?.addEventListener('change', loadRecap);
  rekapSort?.addEventListener('change', loadRecap);
  container.querySelector('#export-excel-btn')?.addEventListener('click', () => {
    if (!currentJournals.length) {
      alert('Belum ada data jurnal untuk diekspor.');
      return;
    }
    buildJournalExcel(currentJournals);
  });
  container.querySelector('#export-pdf-btn')?.addEventListener('click', () => {
    if (!currentJournals.length) {
      alert('Belum ada data jurnal untuk diekspor.');
      return;
    }
    buildJournalPdf(currentJournals, context);
  });
  modalClose?.addEventListener('click', hideModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) hideModal();
  });

  saveJournalBtn?.addEventListener('click', async () => {
    const assignment = getAssignmentById(selectedAssignmentId);
    if (!assignment) {
      alert('Pilih kelas terlebih dahulu.');
      return;
    }
    const tanggal = journalDateInput.value;
    if (!tanggal) {
      alert('Pilih hari / tanggal mengajar.');
      return;
    }
    const tujuan = journalTujuanInput.value.trim() || '-';
    const refleksi = journalRefleksiInput.value.trim() || '-';

    const rows = Array.from(attendanceBody.querySelectorAll('tr'));
    const absensi = [];
    const keterangan = {};
    rows.forEach((row) => {
      const statusSelect = row.querySelector('.journal-status-select');
      const ketInput = row.querySelector('.journal-ket-input');
      if (!statusSelect || !ketInput) return;
      const studentId = statusSelect.getAttribute('data-student-id');
      const studentName = statusSelect.getAttribute('data-student-name') || '-';
      const status = statusSelect.value;
      const ket = ketInput.value.trim();
      absensi.push({ siswa_id: studentId, siswa_nama: studentName, status });
      if (ket) keterangan[studentId] = ket;
    });

    const payload = {
      tahun_ajaran_id: context.tahun_ajaran_aktif,
      semester_id: context.semester_aktif,
      pengajaran_id: assignment.id,
      guru_id: userId,
      guru_nama: session?.user?.nama || '',
      kelas_id: assignment.kelas_id,
      kelas_nama: assignment.kelas_nama,
      mapel_id: assignment.mapel_id,
      mapel_nama: journalMapelInput.value.trim() || assignment.mapel_nama,
      jam_ke: journalJamInput.value.trim() || assignment.jam_ke,
      tanggal,
      hari: getDayName(tanggal),
      tujuan_pembelajaran: tujuan,
      refleksi,
      absensi,
      keterangan,
      created_at: editingId ? (editingCreatedAt || new Date().toISOString()) : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const isEdit = !!editingId;
    await saveDocument('jurnal_guru', payload, editingId || undefined);
    editingId = null;
    editingCreatedAt = '';
    prefillAbsensi = null;
    prefillKet = {};
    applyRelationToFields();
    renderAttendanceRows();
    showModal(isEdit);
  });

  applyRelationToFields();
  renderAttendanceRows();
}
