import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import { getTeachingAssignmentsForUser, getActiveTeachingAssignments, getClassMembers, getAttendanceRecords, saveDocument, getDocumentsWhere } from '../../firebase/data-service.js';

const statusLabels = ['H', 'S', 'I', 'A'];
const statusClasses = {
  H: 'border-[#007AFF] bg-[#007AFF] text-white',
  S: 'border-[#F59E0B] bg-[#FEEBC8] text-[#92400E]',
  I: 'border-[#0EA5E9] bg-[#DBEAFE] text-[#0C4A6E]',
  A: 'border-[#EF4444] bg-[#FECACA] text-[#991B1B]',
};
const attendanceTabActiveClass = 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-[0_14px_30px_-18px_rgba(14,165,233,0.95)]';
const attendanceTabIdleClass = 'bg-white/80 text-slate-700 hover:bg-white hover:text-slate-900';

function getWeekStart(dateString) {
  const date = new Date(dateString);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('simguru_session') || '{}');
  } catch {
    return {};
  }
}

function getDefaultAttendanceDate() {
  const today = new Date();
  const day = today.getDay();
  if (day === 0) {
    today.setDate(today.getDate() + 1);
  } else if (day === 6) {
    today.setDate(today.getDate() + 2);
  }
  return today.toISOString().slice(0, 10);
}

function getDayName(dateString) {
  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return dayNames[new Date(dateString).getDay()] || '-';
}

function isWeekday(dateString) {
  const day = new Date(dateString).getDay();
  return day >= 1 && day <= 5;
}



function formatAttendanceDate(dateString) {
  return dateString ? new Date(dateString).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
}

function createStatusBadge(status) {
  return `<span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusClasses[status] || 'border-slate-200 bg-slate-100 text-slate-600'}">${status}</span>`;
}

function buildExcel(records, assignmentLabel) {
  if (!window.XLSX) {
    return null;
  }

  const worksheetData = [
    ['Tanggal', 'Hari', 'Guru', 'Mapel', 'Kelas', 'Siswa', 'Status'],
    ...records.map((item) => [
      formatAttendanceDate(item.tanggal),
      getDayName(item.tanggal),
      item.guru_nama || '-',
      item.mapel_nama || '-',
      item.kelas_nama || '-',
      item.siswa_nama || '-',
      item.status || '-',
    ]),
  ];

  const workbook = window.XLSX.utils.book_new();
  const worksheet = window.XLSX.utils.aoa_to_sheet(worksheetData);
  window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Absensi');
  const wbout = window.XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], { type: 'application/octet-stream' });
}

function downloadFile(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildPdf(records, assignmentLabel) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    return null;
  }

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  let y = 40;
  doc.setFontSize(14);
  doc.text('Laporan Absensi', margin, y);
  doc.setFontSize(10);
  doc.text(`Periode: ${assignmentLabel}`, margin, y + 18);
  y += 40;

  const headers = ['Tanggal', 'Hari', 'Siswa', 'Status'];
  const rows = records.map((item) => [
    formatAttendanceDate(item.tanggal),
    getDayName(item.tanggal),
    item.siswa_nama || '-',
    item.status || '-',
  ]);

  doc.setFontSize(9);
  const lineHeight = 16;
  const maxLinesPerPage = 32;
  let rowIndex = 0;

  const printHeader = () => {
    doc.text(headers.join(' | '), margin, y);
    y += lineHeight;
  };

  printHeader();
  while (rowIndex < rows.length) {
    if (y + lineHeight > doc.internal.pageSize.height - margin) {
      doc.addPage();
      y = margin;
      printHeader();
    }
    const line = rows[rowIndex].join(' | ');
    doc.text(line, margin, y);
    y += lineHeight;
    rowIndex += 1;
  }

  return doc.output('blob');
}

function getRecordKey(entry) {
  return `${entry.pengajaran_id || ''}_${entry.siswa_id || ''}_${entry.tanggal || ''}`;
}

export async function renderGuruInputAbsenPage(container) {
  const context = getStoredContext();
  const session = getSession();
  const userId = session?.user?.username || context?.user_logged_in || '';
  const userAssignments = userId ? await getTeachingAssignmentsForUser(context, userId) : [];
  const fallbackAssignments = userAssignments.length ? userAssignments : await getActiveTeachingAssignments(context);
  const assignments = fallbackAssignments;
  const selectedAssignment = assignments[0] || null;
  const attendanceDate = getDefaultAttendanceDate();
  const attendanceRecords = selectedAssignment ? await getAttendanceRecords(context, selectedAssignment.id) : [];
  const members = selectedAssignment ? await getClassMembers(context, selectedAssignment.kelas_id) : [];

  const assignmentOptions = assignments
    .map((item) => `<option value="${item.id}" ${item.id === selectedAssignment?.id ? 'selected' : ''}>${item.kelas_nama} • ${item.mapel_nama}</option>`)
    .join('');

  const html = renderLayout('Input Absensi', `
    <div class="space-y-5">
      <div class="relative overflow-hidden rounded-[28px] border border-sky-100 bg-gradient-to-br from-white via-sky-50 to-cyan-50 p-4 shadow-[0_24px_70px_-42px_rgba(14,165,233,0.55)] sm:p-5">
        <div class="absolute -left-10 top-0 h-24 w-24 rounded-full bg-sky-200/50 blur-3xl"></div>
        <div class="absolute bottom-0 right-6 h-20 w-20 rounded-full bg-cyan-200/50 blur-3xl"></div>
        <div class="relative">
          <div class="mb-3 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700 backdrop-blur-sm">
            <span class="inline-block h-2 w-2 rounded-full bg-sky-500"></span>
            Workspace Absensi
          </div>
          <h2 class="text-lg font-semibold text-slate-900 sm:text-xl">Input Absensi Harian</h2>
          <div class="mt-4 md:sticky md:top-4 md:z-20 md:rounded-2xl md:bg-white/70 md:p-1 md:backdrop-blur">
            <div class="grid grid-cols-2 gap-2 rounded-[24px] border border-white/80 bg-white/70 p-1 shadow-[0_14px_32px_-24px_rgba(15,23,42,0.5)] sm:flex sm:flex-wrap sm:rounded-full">
            <button data-tab="input" type="button" class="tab-btn inline-flex w-full items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-semibold transition sm:w-auto ${attendanceTabActiveClass}">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" stroke-width="1.8"/>
                <path d="M8 3.5v3M16 3.5v3M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
              Absensi
            </button>
            <button data-tab="rekap" type="button" class="tab-btn inline-flex w-full items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-semibold transition sm:w-auto ${attendanceTabIdleClass}">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 6h16M8 11h8M8 16h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
              Rekap
            </button>
            <button data-tab="pencapaian" type="button" class="tab-btn inline-flex w-full items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-semibold transition sm:w-auto ${attendanceTabIdleClass}">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 4l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7L12 4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
              </svg>
              Pencapaian
            </button>
            </div>
          </div>
        </div>
      </div>

      <section id="tab-input" class="space-y-4">
        <div class="rounded-[24px] border border-amber-100 bg-gradient-to-r from-amber-50 via-white to-rose-50 p-1 shadow-[0_12px_30px_-24px_rgba(120,53,15,0.22)]">
          <div class="flex flex-wrap gap-2">
            <button type="button" data-absensi-subtab="absensi" class="absensi-subtab-btn rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-xs font-semibold text-white shadow-sm">Absensi</button>
            <button type="button" data-absensi-subtab="keluar-kelas" class="absensi-subtab-btn rounded-full border border-transparent bg-white/90 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-white">Siswa Keluar Kelas</button>
          </div>
        </div>

        <section id="absensi-subtab-absensi" class="grid max-w-full gap-3 xl:grid-cols-[1.6fr_1fr]">
          <div class="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 p-3 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.24)] sm:p-4">
            <div class="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-sm font-medium text-slate-700">Relasi Mengajar</label>
                <select id="assignment-select" class="mt-1.5 w-full rounded-2xl border border-sky-100 bg-gradient-to-r from-white to-sky-50 px-3.5 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100">
                  ${assignmentOptions || '<option value="">Tidak ada relasi aktif</option>'}
                </select>
              </div>
              <div>
                <label class="text-sm font-medium text-slate-700">Tanggal Absensi</label>
                <input id="attendance-date" type="date" value="${attendanceDate}" class="mt-1.5 w-full rounded-2xl border border-sky-100 bg-gradient-to-r from-white to-sky-50 px-3.5 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" />
              </div>
            </div>

            <div class="mt-4 rounded-[26px] border border-slate-100 bg-gradient-to-b from-slate-50 to-white p-3 shadow-inner sm:p-3.5">
              <div class="mb-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p class="text-sm font-semibold text-slate-800">Daftar Siswa</p>
                  <p id="attendance-summary" class="mt-1 text-xs text-slate-500">Pilih kelas dan tanggal untuk melihat status.</p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <button id="save-absen-btn" class="rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_30px_-18px_rgba(14,165,233,0.95)] transition hover:-translate-y-0.5 hover:from-sky-600 hover:to-cyan-600">Simpan Absensi</button>
                  <button id="reset-status-btn" type="button" class="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50">Reset</button>
                </div>
              </div>
              <ul id="member-list" class="max-w-full space-y-2 text-sm text-slate-600"></ul>
            </div>
          </div>

          <div class="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 p-3 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.24)] sm:p-4">
            <div class="mb-3">
              <h2 class="text-lg font-semibold text-slate-900 sm:text-xl">Ringkasan Hari Ini</h2>
            </div>
            <div class="space-y-3">
              <div class="grid gap-2.5 sm:grid-cols-2">
                <div class="rounded-[24px] border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-3 text-center shadow-sm transition hover:-translate-y-0.5">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Hadir</p>
                  <p id="today-summary-present" class="mt-2 text-3xl font-semibold text-slate-900">0</p>
                </div>
                <div class="rounded-[24px] border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-3 text-center shadow-sm transition hover:-translate-y-0.5">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Sakit / Izin</p>
                  <p id="today-summary-excused" class="mt-2 text-3xl font-semibold text-slate-900">0</p>
                </div>
              </div>
              <div class="rounded-[24px] border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-3 text-center shadow-sm transition hover:-translate-y-0.5">
                <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">Alpa</p>
                <p id="today-summary-absent" class="mt-2 text-3xl font-semibold text-slate-900">0</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="tab-rekap" class="hidden space-y-6">
        <div class="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.24)] sm:p-5">
          <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-xl font-semibold text-slate-900">Rekap Kehadiran Profesional</h2>
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-3">
            <div>
              <label class="text-sm font-medium text-slate-700">Tipe Filter</label>
              <select id="rekap-filter-type" class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none">
                <option value="month">Berdasarkan Bulan</option>
                <option value="semester">1 Semester Penuh</option>
                <option value="custom">Rentang Tertentu</option>
              </select>
            </div>
            <div>
              <label class="text-sm font-medium text-slate-700" id="rekap-label-1">Pilih Bulan</label>
              <select id="rekap-month" class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none">
                <option value="01">Januari</option>
                <option value="02">Februari</option>
                <option value="03">Maret</option>
                <option value="04">April</option>
                <option value="05">Mei</option>
                <option value="06">Juni</option>
                <option value="07">Juli</option>
                <option value="08">Agustus</option>
                <option value="09">September</option>
                <option value="10">Oktober</option>
                <option value="11">November</option>
                <option value="12">Desember</option>
              </select>
            </div>
            <div>
              <label class="text-sm font-medium text-slate-700" id="rekap-label-2">Tahun</label>
              <input id="rekap-year" type="number" placeholder="2024" class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none" />
            </div>
          </div>

          <div id="rekap-custom-range" class="hidden mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label class="text-sm font-medium text-slate-700">Tanggal Mulai</label>
              <input id="rekap-start-date" type="date" class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none" />
            </div>
            <div>
              <label class="text-sm font-medium text-slate-700">Tanggal Akhir</label>
              <input id="rekap-end-date" type="date" class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none" />
            </div>
          </div>

          <div class="mt-6 max-w-full overflow-hidden rounded-[24px] border border-slate-100 bg-gradient-to-b from-white to-slate-50 shadow-inner">
            <div class="max-w-full overflow-x-auto p-3">
            <table class="min-w-max text-xs text-slate-700">
              <thead id="rekap-table-head">
                <tr class="border-b border-slate-300 bg-slate-50">
                  <th class="sticky left-0 z-10 w-28 bg-slate-50 px-2 py-2 text-left font-semibold uppercase tracking-[0.1em] text-slate-600 text-xs">Nama</th>
                </tr>
              </thead>
              <tbody id="rekap-table-body"></tbody>
            </table>
            </div>
          </div>

          <div class="mt-6 grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
            <div class="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-center shadow-sm transition hover:-translate-y-0.5">
              <p class="text-xs font-medium text-slate-600">H</p>
              <p id="rekap-summary-present" class="mt-2 text-lg font-bold text-blue-600">0</p>
            </div>
            <div class="rounded-2xl border border-orange-100 bg-orange-50 p-3 text-center shadow-sm transition hover:-translate-y-0.5">
              <p class="text-xs font-medium text-slate-600">S</p>
              <p id="rekap-summary-sick" class="mt-2 text-lg font-bold text-orange-600">0</p>
            </div>
            <div class="rounded-2xl border border-cyan-100 bg-cyan-50 p-3 text-center shadow-sm transition hover:-translate-y-0.5">
              <p class="text-xs font-medium text-slate-600">I</p>
              <p id="rekap-summary-permission" class="mt-2 text-lg font-bold text-cyan-600">0</p>
            </div>
            <div class="rounded-2xl border border-red-100 bg-red-50 p-3 text-center shadow-sm transition hover:-translate-y-0.5">
              <p class="text-xs font-medium text-slate-600">A</p>
              <p id="rekap-summary-absent" class="mt-2 text-lg font-bold text-red-600">0</p>
            </div>
            <div class="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm transition hover:-translate-y-0.5">
              <p class="text-xs font-medium text-slate-600">Total Data</p>
              <p id="summary-total-records" class="mt-2 text-lg font-bold text-slate-900">0</p>
            </div>
            <div class="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm transition hover:-translate-y-0.5">
              <p class="text-xs font-medium text-slate-600">Jumlah Siswa</p>
              <p id="summary-total-students" class="mt-2 text-lg font-bold text-slate-900">0</p>
            </div>
          </div>
        </div>

      <section id="tab-pencapaian" class="hidden space-y-6">
        <div class="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.24)] sm:p-5">
          <div class="mb-4">
            <h2 class="text-xl font-semibold text-slate-900">Pencapaian Kehadiran</h2>
          </div>
          <div class="grid gap-4 lg:grid-cols-2">
            <div class="rounded-[24px] bg-gradient-to-b from-slate-50 to-white p-5 shadow-inner">
              <p class="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Sering Hadir</p>
              <p class="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Sering Tidak Hadir</p>
              <ol id="top-absent-list" class="mt-4 space-y-3 text-sm text-slate-700"></ol>
            </div>
          </div>
        </div>
        <div class="rounded-[28px] border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-5 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.18)]">
          <p class="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Motivasi</p>
          <p id="motivation-text" class="mt-4 text-base leading-7 text-slate-700"></p>
        </div>
      </section>
    </div>
  `);

  container.innerHTML = html;

  const assignmentSelect = container.querySelector('#assignment-select');
  const attendanceDateInput = container.querySelector('#attendance-date');
  const checkAllBtn = container.querySelector('#check-all-btn');
  const resetStatusBtn = container.querySelector('#reset-status-btn');
  const saveAbsenBtn = container.querySelector('#save-absen-btn');
  const attendanceSummary = container.querySelector('#attendance-summary');
  const memberListEl = container.querySelector('#member-list');
  const rekapFilterType = container.querySelector('#rekap-filter-type');
  const rekapMonth = container.querySelector('#rekap-month');
  const rekapYear = container.querySelector('#rekap-year');
  const rekapCustomRange = container.querySelector('#rekap-custom-range');
  const rekapStartDate = container.querySelector('#rekap-start-date');
  const rekapEndDate = container.querySelector('#rekap-end-date');
  const todaySummaryPresent = container.querySelector('#today-summary-present');
  const todaySummaryExcused = container.querySelector('#today-summary-excused');
  const todaySummaryAbsent = container.querySelector('#today-summary-absent');
  const rekapSummaryPresent = container.querySelector('#rekap-summary-present');
  const rekapSummarySick = container.querySelector('#rekap-summary-sick');
  const rekapSummaryPermission = container.querySelector('#rekap-summary-permission');
  const rekapSummaryAbsent = container.querySelector('#rekap-summary-absent');
  const rekapTableBody = container.querySelector('#rekap-table-body');
  const tabButtons = Array.from(container.querySelectorAll('.tab-btn'));
  const absensiSubtabButtons = Array.from(container.querySelectorAll('.absensi-subtab-btn'));
  const tabInput = container.querySelector('#tab-input');
  const absensiSubtabAbsensi = container.querySelector('#absensi-subtab-absensi');
  const absensiSubtabKeluarKelas = container.querySelector('#absensi-subtab-keluar-kelas');
  const tabRekap = container.querySelector('#tab-rekap');
  const tabPencapaian = container.querySelector('#tab-pencapaian');
  const topPresentList = container.querySelector('#top-present-list');
  const topAbsentList = container.querySelector('#top-absent-list');
  const motivationText = container.querySelector('#motivation-text');
  const specialNoteStudent = container.querySelector('#special-note-student');
  const specialNoteType = container.querySelector('#special-note-type');
  const specialNoteTime = container.querySelector('#special-note-time');
  const specialNoteText = container.querySelector('#special-note-text');
  const saveSpecialNoteBtn = container.querySelector('#save-special-note-btn');
  const specialNoteMessage = container.querySelector('#special-note-message');
  const specialNoteHistory = container.querySelector('#special-note-history');
  const specialNoteHistoryStudent = container.querySelector('#special-note-history-student');
  const specialNoteHistoryType = container.querySelector('#special-note-history-type');
  const specialNoteHistoryStart = container.querySelector('#special-note-history-start');
  const specialNoteHistoryEnd = container.querySelector('#special-note-history-end');

  let selectedAssignmentId = selectedAssignment?.id || '';
  let selectedDate = attendanceDate;
  let currentAssignments = assignments;
  let currentMembers = members;
  let currentAttendance = attendanceRecords;
  let currentSpecialNotes = [];
  let activeAbsensiSubtab = 'absensi';

  function getCurrentAssignment() {
    return currentAssignments.find((item) => item.id === selectedAssignmentId) || currentAssignments[0] || null;
  }

  function getAttendanceForDate(date) {
    return currentAttendance.filter((record) => record.tanggal === date);
  }

  function setSpecialNoteMessage(text, isError = false) {
    specialNoteMessage.textContent = text;
    specialNoteMessage.className = isError ? 'text-xs text-rose-600' : 'text-xs text-slate-500';
  }

  async function refreshSpecialNotes() {
    const assignment = getCurrentAssignment();
    if (!assignment) {
      currentSpecialNotes = [];
      return;
    }

    try {
      const docs = await getDocumentsWhere('catatan_khusus', [
        { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
        { field: 'semester_id', operator: '==', value: context.semester_aktif },
        { field: 'pengajaran_id', operator: '==', value: assignment.id },
      ]);
      currentSpecialNotes = [...docs].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    } catch (error) {
      console.error('Gagal memuat catatan khusus:', error);
      currentSpecialNotes = [];
    }
  }

  function getSortedMembers() {
    return [...currentMembers].sort((a, b) => {
      const nameA = (a.siswa_nama || a.nama || '').toLowerCase();
      const nameB = (b.siswa_nama || b.nama || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }

  function renderSpecialNoteStudentOptions() {
    const sortedMembers = [...currentMembers].sort((a, b) => {
      const nameA = (a.siswa_nama || a.nama || '').toLowerCase();
      const nameB = (b.siswa_nama || b.nama || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    if (!sortedMembers.length) {
      specialNoteStudent.innerHTML = '<option value="">Belum ada siswa</option>';
      return;
    }

    specialNoteStudent.innerHTML = sortedMembers
      .map((member) => {
        const id = member.siswa_id || member.id;
        const name = member.siswa_nama || member.nama || '-';
        return `<option value="${id}">${name}</option>`;
      })
      .join('');
  }

  function renderSpecialNoteHistoryStudentOptions() {
    const sortedMembers = [...currentMembers].sort((a, b) => {
      const nameA = (a.siswa_nama || a.nama || '').toLowerCase();
      const nameB = (b.siswa_nama || b.nama || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    specialNoteHistoryStudent.innerHTML = ['<option value="all">Semua siswa</option>', ...sortedMembers.map((member) => {
      const id = member.siswa_id || member.id;
      const name = member.siswa_nama || member.nama || '-';
      return `<option value="${id}">${name}</option>`;
    })].join('');
  }

  function renderSpecialNoteHistory() {
    let filteredNotes = [...currentSpecialNotes];

    const studentFilter = specialNoteHistoryStudent?.value || 'all';
    const typeFilter = specialNoteHistoryType?.value || 'all';
    const startDate = specialNoteHistoryStart?.value || '';
    const endDate = specialNoteHistoryEnd?.value || '';

    if (studentFilter !== 'all') {
      filteredNotes = filteredNotes.filter((item) => String(item.siswa_id || '') === studentFilter);
    }

    if (typeFilter !== 'all') {
      filteredNotes = filteredNotes.filter((item) => String(item.jenis || '') === typeFilter);
    }

    if (startDate) {
      filteredNotes = filteredNotes.filter((item) => String(item.tanggal || '') >= startDate);
    }

    if (endDate) {
      filteredNotes = filteredNotes.filter((item) => String(item.tanggal || '') <= endDate);
    }

    if (!filteredNotes.length) {
      specialNoteHistory.innerHTML = '<div class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">Belum ada catatan khusus untuk kelas ini.</div>';
      return;
    }

    specialNoteHistory.innerHTML = filteredNotes
      .slice(0, 40)
      .map((item, index) => {
        const dateLabel = item.tanggal ? formatAttendanceDate(item.tanggal) : '-';
        const timeLabel = item.jam || '-';
        const typeLabel = item.jenis || '-';
        const studentLabel = item.siswa_nama || '-';
        const noteLabel = item.catatan || '-';
        return `
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>#${index + 1} • ${dateLabel} • ${timeLabel}</span>
              <span class="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700">${typeLabel}</span>
            </div>
            <p class="mt-2 text-sm font-semibold text-slate-800">${studentLabel}</p>
            <p class="mt-1 text-sm text-slate-600">${noteLabel}</p>
          </div>
        `;
      })
      .join('');
  }

  function setAbsensiSubtab(nextTab) {
    activeAbsensiSubtab = nextTab === 'keluar-kelas' ? 'keluar-kelas' : 'absensi';

    absensiSubtabButtons.forEach((button) => {
      const isActive = button.getAttribute('data-absensi-subtab') === activeAbsensiSubtab;
      button.className = `absensi-subtab-btn rounded-full border px-4 py-2 text-xs font-semibold transition ${isActive ? 'border-amber-400 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-[0_10px_22px_-14px_rgba(245,158,11,0.9)]' : 'border-transparent bg-white/90 text-slate-700 hover:bg-white hover:border-amber-100'}`;
    });

    absensiSubtabAbsensi?.classList.toggle('hidden', activeAbsensiSubtab !== 'absensi');
    absensiSubtabKeluarKelas?.classList.toggle('hidden', activeAbsensiSubtab !== 'keluar-kelas');
  }

  function setRowStatus(row, targetStatus) {
    const buttons = row.querySelectorAll('.status-btn');
    buttons.forEach((btn) => {
      const status = btn.getAttribute('data-status');
      const isActive = status === targetStatus;
      btn.dataset.active = isActive ? 'true' : 'false';
      btn.className = `status-btn rounded-full border px-3 py-2 text-xs font-semibold transition hover:-translate-y-0.5 ${isActive ? statusClasses[status] : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`;
    });
  }

  function getStatusForStudent(studentId) {
    const record = getAttendanceForDate(selectedDate).find((item) => item.siswa_id === studentId);
    return record ? record.status : 'H';
  }

  function renderMemberRows() {
    if (!currentMembers.length) {
      memberListEl.innerHTML = '<li class="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">Belum ada siswa yang terdaftar pada kelas ini.</li>';
      return;
    }

    const sortedMembers = [...currentMembers].sort((a, b) => {
      const nameA = (a.siswa_nama || a.nama || '').toLowerCase();
      const nameB = (b.siswa_nama || b.nama || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    memberListEl.innerHTML = sortedMembers
      .map((member, index) => {
        const studentId = member.siswa_id || member.id;
        const status = getStatusForStudent(studentId) || 'H';
        return `
          <li class="max-w-full rounded-[22px] border border-slate-200/80 bg-white px-3 py-2.5 shadow-[0_16px_40px_-34px_rgba(15,23,42,0.45)] transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_24px_48px_-34px_rgba(14,165,233,0.35)] sm:px-3.5 sm:py-3">
            <div class="flex min-w-0 items-start gap-2 sm:items-center sm:justify-between">
              <div class="flex min-w-0 items-center gap-2">
                <div class="min-w-0">
                  <div class="student-name truncate text-sm font-semibold text-slate-900">${index + 1}. ${member.siswa_nama || member.nama || '-'}</div>
                </div>
              </div>
            </div>
            <div class="mt-2.5 flex flex-wrap gap-1.5 sm:justify-end">
              ${statusLabels
                .map((value) => `
                  <button type="button" class="status-btn rounded-full border px-2.5 py-1.5 text-xs font-semibold transition hover:-translate-y-0.5 ${value === status ? statusClasses[value] : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}" data-student-id="${studentId}" data-status="${value}" data-active="${value === status}">${value}</button>
                `)
                .join('')}
            </div>
          </li>
        `;
      })
      .join('');

    const recordsForDay = getAttendanceForDate(selectedDate);
    attendanceSummary.textContent = `${recordsForDay.length} catatan ditemukan untuk tanggal ${formatAttendanceDate(selectedDate)} (${getDayName(selectedDate)}).`;
    renderTodaySummary();
  }

  function renderTodaySummary() {
    const rows = Array.from(memberListEl.querySelectorAll('li'));
    if (!rows.length) {
      todaySummaryPresent.textContent = '0';
      todaySummaryExcused.textContent = '0';
      todaySummaryAbsent.textContent = '0';
      return;
    }

    let present = 0;
    let excused = 0;
    let absent = 0;

    rows.forEach((row) => {
      const selectedButton = row.querySelector('.status-btn[data-active="true"]') || row.querySelector('.status-btn');
      const status = selectedButton?.getAttribute('data-status') || 'H';
      if (status === 'H') present += 1;
      else if (status === 'S' || status === 'I') excused += 1;
      else if (status === 'A') absent += 1;
    });

    todaySummaryPresent.textContent = String(present);
    todaySummaryExcused.textContent = String(excused);
    todaySummaryAbsent.textContent = String(absent);
  }

  function getRecapPeriod() {
    const filterType = rekapFilterType?.value || 'month';
    const year = parseInt(rekapYear?.value || new Date().getFullYear(), 10);

    if (filterType === 'month') {
      const month = parseInt(rekapMonth?.value || '01', 10);
      const first = new Date(year, month - 1, 1);
      const last = new Date(year, month, 0);
      return { start: first.toISOString().slice(0, 10), end: last.toISOString().slice(0, 10) };
    }

    if (filterType === 'semester') {
      const month = parseInt(rekapMonth?.value || '01', 10);
      const first = month <= 6 ? new Date(year, 0, 1) : new Date(year, 6, 1);
      const last = month <= 6 ? new Date(year, 5, 30) : new Date(year, 11, 31);
      return { start: first.toISOString().slice(0, 10), end: last.toISOString().slice(0, 10) };
    }

    if (filterType === 'custom') {
      return {
        start: rekapStartDate?.value || selectedDate,
        end: rekapEndDate?.value || selectedDate,
      };
    }

    return { start: selectedDate, end: selectedDate };
  }

  function getDatesInRange(start, end) {
    const days = [];
    const current = new Date(start);
    const endDate = new Date(end);

    while (current <= endDate) {
      days.push(current.toISOString().slice(0, 10));
      current.setDate(current.getDate() + 1);
    }

    return days;
  }

  function renderRecap() {
    const period = getRecapPeriod();
    const dates = getDatesInRange(period.start, period.end);
    const records = currentAttendance.filter((item) => item.tanggal >= period.start && item.tanggal <= period.end);

    const present = records.filter((item) => item.status === 'H').length;
    const sick = records.filter((item) => item.status === 'S').length;
    const permission = records.filter((item) => item.status === 'I').length;
    const absent = records.filter((item) => item.status === 'A').length;

    rekapSummaryPresent.textContent = present;
    rekapSummarySick.textContent = sick;
    rekapSummaryPermission.textContent = permission;
    rekapSummaryAbsent.textContent = absent;
    container.querySelector('#summary-total-records').textContent = records.length;
    container.querySelector('#summary-total-students').textContent = currentMembers.length;

    // Generate header row with all columns
    const tableHead = container.querySelector('#rekap-table-head');
    const dateHeaderCells = dates
      .map((date) => {
        const day = new Date(date).getDay();
        const isWeekend = day === 0 || day === 6;
        const dayLabel = new Date(date).toLocaleDateString('id-ID', { weekday: 'short' });
        const dateLabel = new Date(date).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' });
        const weekendClass = isWeekend ? 'bg-rose-50 text-rose-700' : 'bg-white text-slate-600';
        return `<th class="px-2 py-2 text-center font-semibold text-xs ${weekendClass}">${dateLabel}<br/><span class="text-[10px]">${dayLabel}</span></th>`;
      })
      .join('');
    
    tableHead.innerHTML = `
      <tr class="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-sky-50/60">
        <th class="sticky left-0 z-10 w-12 bg-slate-50 px-2 py-3 text-left font-semibold uppercase tracking-[0.1em] text-slate-600 text-xs">No</th>
        <th class="sticky left-12 z-10 w-44 bg-slate-50 px-2 py-3 text-left font-semibold uppercase tracking-[0.1em] text-slate-600 text-xs">Nama</th>
        ${dateHeaderCells}
        <th class="px-2 py-3 text-center font-semibold uppercase tracking-[0.1em] text-slate-600 text-xs bg-blue-50">H</th>
        <th class="px-2 py-3 text-center font-semibold uppercase tracking-[0.1em] text-slate-600 text-xs bg-orange-50">S</th>
        <th class="px-2 py-3 text-center font-semibold uppercase tracking-[0.1em] text-slate-600 text-xs bg-cyan-50">I</th>
        <th class="px-2 py-3 text-center font-semibold uppercase tracking-[0.1em] text-slate-600 text-xs bg-red-50">A</th>
        <th class="px-2 py-3 text-center font-semibold uppercase tracking-[0.1em] text-slate-600 text-xs">Total</th>
      </tr>
    `;

    const sortedMembers = [...currentMembers].sort((a, b) => {
      const nameA = (a.siswa_nama || a.nama || '').toLowerCase();
      const nameB = (b.siswa_nama || b.nama || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    rekapTableBody.innerHTML = sortedMembers
      .map((member, index) => {
        const memberId = member.siswa_id || member.id;
        const memberRecords = records.filter((r) => r.siswa_id === memberId);
        const countH = memberRecords.filter((r) => r.status === 'H').length;
        const countS = memberRecords.filter((r) => r.status === 'S').length;
        const countI = memberRecords.filter((r) => r.status === 'I').length;
        const countA = memberRecords.filter((r) => r.status === 'A').length;
        const totalRecords = memberRecords.length;

        const cells = dates
          .map((date) => {
            const day = new Date(date).getDay();
            const isWeekend = day === 0 || day === 6;
            if (isWeekend) {
              return '<td class="px-2 py-2 text-center text-[11px] font-semibold text-rose-600 bg-rose-50">Libur</td>';
            }
            const record = records.find((r) => r.siswa_id === memberId && r.tanggal === date);
            const status = record?.status || '-';
            const textClass = status === 'H' ? 'text-blue-700' :
              status === 'S' ? 'text-orange-700' :
              status === 'I' ? 'text-cyan-700' :
              status === 'A' ? 'text-red-700' :
              'text-slate-400';
            return `<td class="px-2 py-2 text-center text-xs font-semibold ${textClass}">${status}</td>`;
          })
          .join('');

        return `
          <tr class="border-b border-slate-100 text-xs transition hover:bg-sky-50/60">
            <td class="sticky left-0 z-10 bg-white px-2 py-3 font-medium text-slate-700">${index + 1}</td>
            <td class="sticky left-12 z-10 max-w-44 truncate bg-white px-2 py-3 font-medium text-slate-900 w-44">${member.siswa_nama || member.nama || '-'}</td>
            ${cells}
            <td class="px-2 py-3 text-center font-bold text-blue-600 bg-blue-50">${countH}</td>
            <td class="px-2 py-3 text-center font-bold text-orange-600 bg-orange-50">${countS}</td>
            <td class="px-2 py-3 text-center font-bold text-cyan-600 bg-cyan-50">${countI}</td>
            <td class="px-2 py-3 text-center font-bold text-red-600 bg-red-50">${countA}</td>
            <td class="px-2 py-3 text-center font-bold text-slate-900">${totalRecords}</td>
          </tr>
        `;
      })
      .join('');
  }

  function validateDate(dateValue) {
    if (!isWeekday(dateValue)) {
      const nextDay = new Date(dateValue);
      nextDay.setDate(nextDay.getDate() + ((8 - nextDay.getDay()) % 7 || 1));
      attendanceDateInput.value = nextDay.toISOString().slice(0, 10);
      selectedDate = attendanceDateInput.value;
      alert('Tanggal harus hari kerja Senin-Jumat. Tanggal otomatis disesuaikan ke hari kerja berikutnya.');
    }
  }

  async function refreshCurrentData() {
    const assignment = getCurrentAssignment();
    selectedAssignmentId = assignment?.id || '';
    const nextMembers = assignment ? await getClassMembers(context, assignment.kelas_id) : [];
    const nextAttendance = assignment ? await getAttendanceRecords(context, assignment.id) : [];
    currentMembers = nextMembers;
    currentAttendance = nextAttendance;
    await refreshSpecialNotes();
    renderSpecialNoteStudentOptions();
    renderSpecialNoteHistoryStudentOptions();
    renderSpecialNoteHistory();
    renderMemberRows();
    renderRecap();
  }

  async function saveSpecialNote() {
    const assignment = getCurrentAssignment();
    if (!assignment) {
      setSpecialNoteMessage('Relasi mengajar belum dipilih.', true);
      return;
    }

    const jenis = specialNoteType.value;
    const jam = specialNoteTime.value || '-';
    const catatan = specialNoteText.value.trim();

    const target = {
      siswaId: specialNoteStudent.value,
      siswaName: specialNoteStudent.options[specialNoteStudent.selectedIndex]?.text || '-',
    };

    if (!target.siswaId) {
      setSpecialNoteMessage('Pilih siswa terlebih dahulu.', true);
      return;
    }

    if (!catatan) {
      setSpecialNoteMessage('Catatan tidak boleh kosong.', true);
      return;
    }

    try {
      const now = Date.now();
      const docId = `${assignment.id}_${target.siswaId}_${selectedDate}_${now}`;
      await saveDocument('catatan_khusus', {
        tahun_ajaran_id: context.tahun_ajaran_aktif,
        semester_id: context.semester_aktif,
        pengajaran_id: assignment.id,
        kelas_id: assignment.kelas_id,
        kelas_nama: assignment.kelas_nama,
        mapel_id: assignment.mapel_id,
        mapel_nama: assignment.mapel_nama,
        guru_id: assignment.guru_id,
        guru_nama: assignment.guru_nama,
        siswa_id: target.siswaId,
        siswa_nama: target.siswaName,
        tanggal: selectedDate,
        jam,
        jenis,
        catatan,
        created_at: new Date().toISOString(),
      }, docId);

      specialNoteText.value = '';
      setSpecialNoteMessage('Catatan khusus berhasil disimpan.');
      await refreshSpecialNotes();
      renderSpecialNoteHistory();
    } catch (error) {
      console.error('Gagal menyimpan catatan khusus:', error);
      setSpecialNoteMessage('Gagal menyimpan catatan khusus.', true);
    }
  }

  async function saveAttendance() {
    const assignment = getCurrentAssignment();
    if (!assignment) {
      alert('Tidak ada relasi mengajar yang dipilih.');
      return;
    }

    if (!selectedDate || !isWeekday(selectedDate)) {
      alert('Pilih tanggal hari kerja Senin-Jumat.');
      return;
    }

    const rows = Array.from(memberListEl.querySelectorAll('li'));
    const payloads = rows.map((row) => {
      const studentId = row.querySelector('.status-btn')?.getAttribute('data-student-id');
      const selectedButton = row.querySelector('.status-btn[data-active="true"]') || row.querySelector('.status-btn');
      const status = selectedButton?.getAttribute('data-status') || 'H';
      const studentName = row.querySelector('.student-name')?.textContent.replace(/^\d+\.\s*/, '') || '';
      const recordId = `${assignment.id}_${studentId}_${selectedDate}`;
      return {
        id: recordId,
        tahun_ajaran_id: context.tahun_ajaran_aktif,
        semester_id: context.semester_aktif,
        pengajaran_id: assignment.id,
        guru_id: assignment.guru_id,
        guru_nama: assignment.guru_nama,
        mapel_id: assignment.mapel_id,
        mapel_nama: assignment.mapel_nama,
        kelas_id: assignment.kelas_id,
        kelas_nama: assignment.kelas_nama,
        siswa_id: studentId,
        siswa_nama: studentName,
        tanggal: selectedDate,
        hari: getDayName(selectedDate),
        status,
        updated_at: new Date().toISOString(),
      };
    });

    await Promise.all(
      payloads.map((item) => saveDocument('absensi', item, item.id))
    );

    alert(`Absensi tanggal ${formatAttendanceDate(selectedDate)} berhasil disimpan.`);
    await refreshCurrentData();
  }

  function downloadRekap(format) {
    const assignment = getCurrentAssignment();
    if (!assignment) {
      alert('Pilih relasi mengajar terlebih dahulu.');
      return;
    }

    const period = getRecapPeriod();
    const records = currentAttendance.filter((item) => item.tanggal >= period.start && item.tanggal <= period.end);
    if (!records.length) {
      alert('Tidak ada data untuk diekspor.');
      return;
    }

    const filterType = rekapFilterType?.value || 'month';
    const filePrefix = `Absensi_${assignment.kelas_nama || assignment.kelas_id}_${assignment.mapel_nama || assignment.mapel_id}_${filterType}`;

    if (format === 'excel') {
      const blob = buildExcel(records, assignment.kelas_nama);
      if (!blob) {
        alert('Librari Excel belum tersedia.');
        return;
      }
      downloadFile(blob, `${filePrefix}.xlsx`);
      return;
    }

    if (format === 'pdf') {
      const blob = buildPdf(records, assignment.kelas_nama);
      if (!blob) {
        alert('Librari PDF belum tersedia.');
        return;
      }
      downloadFile(blob, `${filePrefix}.pdf`);
    }
  }

  function renderPencapaian() {
    const period = getRecapPeriod();
    const records = currentAttendance.filter((item) => item.tanggal >= period.start && item.tanggal <= period.end);
    const siswaStats = currentMembers.map((member) => {
      const id = member.siswa_id || member.id;
      const name = member.siswa_nama || member.nama || '-';
      const studentRecords = records.filter((item) => item.siswa_id === id);
      const hadir = studentRecords.filter((item) => item.status === 'H').length;
      const tidakHadir = studentRecords.filter((item) => item.status === 'A').length;
      return { id, name, hadir, tidakHadir };
    });

    const topPresent = [...siswaStats].sort((a, b) => b.hadir - a.hadir || a.name.localeCompare(b.name)).slice(0, 5);
    const topAbsent = [...siswaStats].sort((a, b) => b.tidakHadir - a.tidakHadir || a.name.localeCompare(b.name)).slice(0, 5);

    topPresentList.innerHTML = topPresent.length
      ? topPresent
          .map(
            (student, index) => `
              <li class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div class="text-sm font-semibold text-slate-900">${index + 1}. ${student.name}</div>
                <div class="mt-1 text-xs text-slate-500">Hadir: ${student.hadir} kali</div>
              </li>
            `
          )
          .join('')
      : '<li class="text-sm text-slate-500">Tidak ada data siswa untuk periode ini.</li>';

    topAbsentList.innerHTML = topAbsent.length
      ? topAbsent
          .map(
            (student, index) => `
              <li class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div class="text-sm font-semibold text-slate-900">${index + 1}. ${student.name}</div>
                <div class="mt-1 text-xs text-slate-500">Tidak hadir: ${student.tidakHadir} kali</div>
              </li>
            `
          )
          .join('')
      : '<li class="text-sm text-slate-500">Tidak ada data siswa untuk periode ini.</li>';

    const totalStudents = siswaStats.length;
    const totalPresent = siswaStats.reduce((sum, student) => sum + student.hadir, 0);
    motivationText.textContent = totalStudents
      ? `Anak-anak hebat sedang berlatih disiplin! Rata-rata setiap siswa hadir ${(totalPresent / totalStudents).toFixed(1)} kali dalam periode ini. Ajak mereka terus semangat karena kehadiran adalah langkah kecil menuju prestasi besar.`
      : 'Belum ada data absensi untuk menampilkan motivasi. Yuk, mulai catat absensi hari ini agar kita bisa melihat perkembangan kehadiran siswa dengan jelas!';
  }

  container.addEventListener('click', (event) => {
    const tabButton = event.target.closest('.tab-btn');
    if (tabButton) {
      tabButtons.forEach((btn) => {
        const isActive = btn === tabButton;
        btn.className = `tab-btn inline-flex w-full items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-semibold transition sm:w-auto ${isActive ? attendanceTabActiveClass : attendanceTabIdleClass}`;
      });
      const target = tabButton.getAttribute('data-tab');
      tabInput.classList.toggle('hidden', target !== 'input');
      tabRekap.classList.toggle('hidden', target !== 'rekap');
      tabPencapaian.classList.toggle('hidden', target !== 'pencapaian');
      if (target === 'input') {
        setAbsensiSubtab(activeAbsensiSubtab);
      }
      if (target === 'rekap') {
        renderRecap();
      }
      if (target === 'pencapaian') {
        renderPencapaian();
      }
    }

    const button = event.target.closest('.status-btn');
    if (button) {
      const newStatus = button.getAttribute('data-status');
      const listItem = button.closest('li');
      if (!listItem) {
        return;
      }

      setRowStatus(listItem, newStatus);
      renderTodaySummary();
      return;
    }
  });

  absensiSubtabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextTab = button.getAttribute('data-absensi-subtab') || 'absensi';
      setAbsensiSubtab(nextTab);
      if (nextTab === 'keluar-kelas') {
        renderSpecialNoteHistory();
      }
    });
  });

  checkAllBtn?.addEventListener('click', () => {
    memberListEl.querySelectorAll('li').forEach((row) => {
      const buttons = row.querySelectorAll('.status-btn');
      buttons.forEach((btn) => {
        const status = btn.getAttribute('data-status');
        const isActive = status === 'H';
        btn.dataset.active = isActive ? 'true' : 'false';
        btn.className = `status-btn rounded-full border px-3 py-2 text-xs font-semibold transition hover:-translate-y-0.5 ${isActive ? statusClasses.H : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`;
      });
    });
    renderTodaySummary();
  });

  resetStatusBtn?.addEventListener('click', () => {
    renderMemberRows();
  });

  assignmentSelect?.addEventListener('change', async (event) => {
    selectedAssignmentId = event.target.value;
    await refreshCurrentData();
  });

  attendanceDateInput?.addEventListener('change', (event) => {
    selectedDate = event.target.value;
    if (!isWeekday(selectedDate)) {
      validateDate(selectedDate);
    }
    renderMemberRows();
  });

  rekapFilterType?.addEventListener('change', (event) => {
    const filterType = event.target.value;
    rekapCustomRange.classList.toggle('hidden', filterType !== 'custom');
    renderRecap();
    renderPencapaian();
  });

  rekapMonth?.addEventListener('change', () => {
    renderRecap();
    renderPencapaian();
  });

  rekapYear?.addEventListener('change', () => {
    renderRecap();
    renderPencapaian();
  });

  rekapStartDate?.addEventListener('change', () => {
    renderRecap();
    renderPencapaian();
  });

  rekapEndDate?.addEventListener('change', () => {
    renderRecap();
    renderPencapaian();
  });
  saveAbsenBtn?.addEventListener('click', saveAttendance);
  saveSpecialNoteBtn?.addEventListener('click', saveSpecialNote);
  [specialNoteHistoryStudent, specialNoteHistoryType, specialNoteHistoryStart, specialNoteHistoryEnd].forEach((el) => {
    el?.addEventListener('change', renderSpecialNoteHistory);
  });

  await refreshSpecialNotes();
  renderSpecialNoteStudentOptions();
  renderSpecialNoteHistoryStudentOptions();
  renderSpecialNoteHistory();
  renderMemberRows();
  renderRecap();
  renderPencapaian();
  setAbsensiSubtab('absensi');
}
