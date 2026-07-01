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
const activityIndicators = [
  { key: 'bertanya', label: 'Bertanya' },
  { key: 'menjawab', label: 'Menjawab' },
  { key: 'diskusi', label: 'Diskusi' },
  { key: 'presentasi', label: 'Presentasi' },
  { key: 'tugas_kelas', label: 'Tugas Kelas' },
];

function scoreToGrade(score) {
  const value = Number(score || 0);
  if (value >= 3.5) return 'A';
  if (value >= 2.5) return 'B';
  return 'C';
}

function gradeBadgeClass(grade) {
  if (grade === 'A') return 'bg-emerald-100 text-emerald-700';
  if (grade === 'B') return 'bg-amber-100 text-amber-700';
  return 'bg-rose-100 text-rose-700';
}

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
    <div class="space-y-6">
      <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="mb-3">
          <div>
            <h2 class="text-xl font-semibold text-slate-900">Input Absensi Harian</h2>
            <p class="mt-2 text-sm text-slate-500">Pilih relasi mengajar dan tanggal kerja, kemudian rekam kehadiran siswa.</p>
          </div>
        </div>
        <div class="overflow-x-auto md:sticky md:top-4 md:z-20 md:rounded-2xl md:bg-white/90 md:p-1 md:shadow-sm md:backdrop-blur">
          <div class="inline-flex min-w-full gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1 sm:min-w-0">
            <button data-tab="input" type="button" class="tab-btn inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-[#007AFF] px-4 py-2 text-sm font-semibold text-white shadow-sm">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" stroke-width="1.8"/>
                <path d="M8 3.5v3M16 3.5v3M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
              Absensi
            </button>
            <button data-tab="keaktifan" type="button" class="tab-btn inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 18.5V9.5M12 18.5V5.5M19 18.5V12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <circle cx="5" cy="19" r="1.2" fill="currentColor"/>
                <circle cx="12" cy="6" r="1.2" fill="currentColor"/>
                <circle cx="19" cy="13" r="1.2" fill="currentColor"/>
              </svg>
              Keaktifan
            </button>
            <button data-tab="rekap" type="button" class="tab-btn inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 6h16M8 11h8M8 16h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
              Rekap
            </button>
            <button data-tab="pencapaian" type="button" class="tab-btn inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 4l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7L12 4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
              </svg>
              Pencapaian
            </button>
          </div>
        </div>
      </div>

      <section id="tab-input" class="space-y-6">
        <div class="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="text-sm font-medium text-slate-700">Relasi & Tanggal</p>
                <p class="mt-1 text-sm text-slate-500">Tentukan kelas dan tanggal absensi yang akan dicatat.</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button id="check-all-btn" type="button" class="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">Hadir Semua</button>
                <button id="reset-status-btn" type="button" class="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Reset Status</button>
              </div>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="text-sm font-medium text-slate-700">Relasi Mengajar</label>
                <select id="assignment-select" class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none">
                  ${assignmentOptions || '<option value="">Tidak ada relasi aktif</option>'}
                </select>
              </div>
              <div>
                <label class="text-sm font-medium text-slate-700">Tanggal Absensi</label>
                <input id="attendance-date" type="date" value="${attendanceDate}" class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none" />
                <p id="date-hint" class="mt-2 text-xs text-slate-500">Hanya hari kerja Senin–Jumat bisa dipilih.</p>
              </div>
            </div>

            <div class="mt-6 rounded-3xl border border-slate-100 bg-slate-50 p-4">
              <div class="mb-3 flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium text-slate-700">Daftar Siswa</p>
                  <p id="attendance-summary" class="mt-1 text-xs text-slate-500">Pilih kelas dan tanggal untuk melihat status.</p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <button id="mark-selected-absent-btn" type="button" class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700">Tandai baris terpilih sebagai Alpa</button>
                  <button id="save-absen-btn" class="rounded-2xl bg-[#007AFF] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0063CC]">Simpan Absensi</button>
                </div>
              </div>
              <div class="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                <label class="inline-flex items-center gap-2 font-medium text-slate-700">
                  <input id="member-select-all" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-[#007AFF]" />
                  Pilih semua siswa di daftar
                </label>
                <span id="selected-student-count" class="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700">0 siswa dipilih</span>
              </div>
              <ul id="member-list" class="space-y-3 text-sm text-slate-600"></ul>
            </div>
          </div>

          <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div class="mb-4">
              <h2 class="text-xl font-semibold text-slate-900">Ringkasan Hari Ini</h2>
              <p class="mt-2 text-sm text-slate-500">Sekilas status absensi untuk tanggal yang dipilih.</p>
            </div>
            <div class="space-y-4">
              <div class="grid gap-3 sm:grid-cols-2">
                <div class="rounded-2xl bg-slate-50 p-4 text-center">
                  <p class="text-xs uppercase tracking-[0.12em] text-slate-500">Hadir</p>
                  <p id="today-summary-present" class="mt-3 text-3xl font-semibold text-slate-900">0</p>
                </div>
                <div class="rounded-2xl bg-slate-50 p-4 text-center">
                  <p class="text-xs uppercase tracking-[0.12em] text-slate-500">Sakit / Izin</p>
                  <p id="today-summary-excused" class="mt-3 text-3xl font-semibold text-slate-900">0</p>
                </div>
              </div>
              <div class="rounded-2xl bg-slate-50 p-4 text-center">
                <p class="text-xs uppercase tracking-[0.12em] text-slate-500">Alpa</p>
                <p id="today-summary-absent" class="mt-3 text-3xl font-semibold text-slate-900">0</p>
              </div>
            </div>

            <div class="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <h3 class="text-sm font-semibold text-slate-800">Catatan Khusus</h3>
              <p class="mt-1 text-xs text-slate-500">Catat kejadian khusus siswa (mis. tidak masuk kelas, membolos ke kantin) untuk tindak lanjut wali kelas/BK.</p>
              <div class="mt-3 grid gap-3">
                <div>
                  <label class="text-xs font-medium text-slate-700">Siswa</label>
                  <select id="special-note-student" class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"></select>
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label class="text-xs font-medium text-slate-700">Jenis Catatan</label>
                    <select id="special-note-type" class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
                      <option value="Tidak Masuk Kelas">Tidak Masuk Kelas</option>
                      <option value="Membolos ke Kantin">Membolos ke Kantin</option>
                      <option value="Keluar Kelas Tanpa Izin">Keluar Kelas Tanpa Izin</option>
                      <option value="Lainnya">Lainnya</option>
                    </select>
                  </div>
                  <div>
                    <label class="text-xs font-medium text-slate-700">Jam Kejadian</label>
                    <input id="special-note-time" type="time" class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
                  </div>
                </div>
                <div>
                  <label class="text-xs font-medium text-slate-700">Catatan</label>
                  <textarea id="special-note-text" rows="3" class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none" placeholder="Tuliskan kronologi singkat..."></textarea>
                </div>
                <div class="flex items-center gap-2">
                  <button id="save-special-note-btn" type="button" class="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">Simpan Catatan</button>
                  <p id="special-note-message" class="text-xs text-slate-500"></p>
                </div>
                <label class="inline-flex items-center gap-2 text-xs text-slate-600">
                  <input id="special-note-use-selected" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-[#007AFF]" />
                  Gunakan siswa terpilih (batch)
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="tab-keaktifan" class="hidden space-y-6">
        <div class="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 class="text-xl font-semibold text-slate-900">Catatan Keaktifan Siswa</h2>
                <p class="mt-2 text-sm text-slate-500">Input cepat berbasis dropdown siswa aktif saat pembelajaran berlangsung.</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button id="save-activity-btn" type="button" class="rounded-2xl bg-[#007AFF] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0063CC]">Simpan Entri</button>
                <button id="reset-activity-form-btn" type="button" class="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">Reset Form</button>
              </div>
            </div>

            <div class="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 md:grid-cols-3">
              <div class="rounded-xl border border-slate-200 bg-white p-3">
                <p class="font-semibold text-slate-700">Skor 1-4</p>
                <p class="mt-1">1 = Pasif, 2 = Mulai terlibat, 3 = Aktif, 4 = Sangat aktif.</p>
              </div>
              <div class="rounded-xl border border-slate-200 bg-white p-3">
                <p class="font-semibold text-slate-700">Predikat Otomatis</p>
                <p class="mt-1">A (>=3.5), B (>=2.5), C (&lt;2.5).</p>
              </div>
              <div class="rounded-xl border border-slate-200 bg-white p-3">
                <p class="font-semibold text-slate-700">Poin Indikator</p>
                <p class="mt-1">Setiap checklist bernilai +1 (maksimal 5 poin).</p>
              </div>
            </div>

            <div class="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div class="grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
                <div>
                  <label class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Pilih Siswa</label>
                  <select id="activity-student-select" class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"></select>
                </div>
                <div>
                  <label class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Skor</label>
                  <select id="activity-score-select" class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3" selected>3</option>
                    <option value="4">4</option>
                  </select>
                </div>
                <div class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                  <p>Poin indikator: <span id="activity-point-preview" class="font-semibold text-blue-700">0/5</span></p>
                  <p class="mt-1">Predikat: <span id="activity-grade-preview" class="font-semibold text-slate-900">B</span></p>
                </div>
              </div>

              <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                ${activityIndicators.map((item) => `
                  <label class="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
                    <input type="checkbox" class="activity-form-indicator h-4 w-4 rounded border-slate-300 text-[#007AFF]" data-indicator="${item.key}" />
                    ${item.label}
                  </label>
                `).join('')}
              </div>

              <div>
                <label class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Catatan Singkat (opsional)</label>
                <input id="activity-note-input" type="text" class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none" placeholder="Contoh: aktif bertanya dan menolong diskusi kelompok" />
              </div>
            </div>

            <div class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Entri Keaktifan Hari Ini</p>
              <div id="activity-today-list" class="mt-2 space-y-2"></div>
            </div>
          </div>

          <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div class="mb-4">
              <h2 class="text-xl font-semibold text-slate-900">Siswa Teraktif (Global)</h2>
              <p class="mt-2 text-sm text-slate-500">Peringkat berdasarkan akumulasi poin indikator pada relasi mengajar ini.</p>
            </div>

            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div class="flex items-center justify-between gap-3">
                <label for="activity-top-limit" class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Jumlah Siswa Ditampilkan</label>
                <input id="activity-top-limit" type="number" min="3" max="50" value="10" class="w-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none" />
              </div>
              <div id="activity-top-list" class="mt-3 space-y-2"></div>
            </div>

            <div class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div class="flex items-center justify-between gap-2">
                <p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Siswa Perlu Dorongan</p>
                <span id="activity-needs-count" class="rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">0</span>
              </div>
              <div id="activity-needs-list" class="mt-2 space-y-2"></div>
            </div>
          </div>
        </div>
      </section>

      <section id="tab-rekap" class="hidden space-y-6">
        <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-xl font-semibold text-slate-900">Rekap Kehadiran Profesional</h2>
              <p class="mt-2 text-sm text-slate-500">Tampilan lengkap status absensi siswa berdasarkan filter periode.</p>
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

          <div class="mt-6 overflow-x-auto rounded-2xl border border-slate-100 bg-white p-3">
            <table class="min-w-full text-xs text-slate-700">
              <thead id="rekap-table-head">
                <tr class="border-b border-slate-300 bg-slate-50">
                  <th class="sticky left-0 z-10 w-28 bg-slate-50 px-2 py-2 text-left font-semibold uppercase tracking-[0.1em] text-slate-600 text-xs">Nama</th>
                </tr>
              </thead>
              <tbody id="rekap-table-body"></tbody>
            </table>
          </div>

          <div class="mt-6 grid gap-3 sm:grid-cols-6">
            <div class="rounded-xl bg-blue-50 p-3 text-center">
              <p class="text-xs font-medium text-slate-600">H</p>
              <p id="rekap-summary-present" class="mt-2 text-lg font-bold text-blue-600">0</p>
            </div>
            <div class="rounded-xl bg-orange-50 p-3 text-center">
              <p class="text-xs font-medium text-slate-600">S</p>
              <p id="rekap-summary-sick" class="mt-2 text-lg font-bold text-orange-600">0</p>
            </div>
            <div class="rounded-xl bg-cyan-50 p-3 text-center">
              <p class="text-xs font-medium text-slate-600">I</p>
              <p id="rekap-summary-permission" class="mt-2 text-lg font-bold text-cyan-600">0</p>
            </div>
            <div class="rounded-xl bg-red-50 p-3 text-center">
              <p class="text-xs font-medium text-slate-600">A</p>
              <p id="rekap-summary-absent" class="mt-2 text-lg font-bold text-red-600">0</p>
            </div>
            <div class="rounded-xl bg-slate-100 p-3 text-center">
              <p class="text-xs font-medium text-slate-600">Total Data</p>
              <p id="summary-total-records" class="mt-2 text-lg font-bold text-slate-900">0</p>
            </div>
            <div class="rounded-xl bg-slate-100 p-3 text-center">
              <p class="text-xs font-medium text-slate-600">Siswa</p>
              <p id="summary-total-students" class="mt-2 text-lg font-bold text-slate-900">0</p>
            </div>
          </div>
        </div>
      </section>

      <section id="tab-pencapaian" class="hidden space-y-6">
        <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="mb-4">
            <h2 class="text-xl font-semibold text-slate-900">Pencapaian Kehadiran</h2>
            <p class="mt-2 text-sm text-slate-500">Lihat siswa yang paling disiplin dan yang membutuhkan dorongan motivasi.</p>
          </div>
          <div class="grid gap-4 lg:grid-cols-2">
            <div class="rounded-3xl bg-slate-50 p-5">
              <p class="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Sering Hadir</p>
              <ol id="top-present-list" class="mt-4 space-y-3 text-sm text-slate-700"></ol>
            </div>
            <div class="rounded-3xl bg-slate-50 p-5">
              <p class="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Sering Tidak Hadir</p>
              <ol id="top-absent-list" class="mt-4 space-y-3 text-sm text-slate-700"></ol>
            </div>
          </div>
        </div>
        <div class="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
          <p class="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Motivasi</p>
          <p id="motivation-text" class="mt-4 text-base leading-7 text-slate-700"></p>
        </div>

        <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p class="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Riwayat Catatan Siswa</p>
          <p class="mt-2 text-sm text-slate-500">Menampilkan catatan khusus siswa untuk relasi mengajar aktif.</p>
          <div class="mt-4 grid gap-3 md:grid-cols-4">
            <div>
              <label class="text-xs font-medium text-slate-700">Filter Siswa</label>
              <select id="special-note-history-student" class="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none">
                <option value="all">Semua siswa</option>
              </select>
            </div>
            <div>
              <label class="text-xs font-medium text-slate-700">Filter Jenis</label>
              <select id="special-note-history-type" class="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none">
                <option value="all">Semua jenis</option>
                <option value="Tidak Masuk Kelas">Tidak Masuk Kelas</option>
                <option value="Membolos ke Kantin">Membolos ke Kantin</option>
                <option value="Keluar Kelas Tanpa Izin">Keluar Kelas Tanpa Izin</option>
                <option value="Lainnya">Lainnya</option>
              </select>
            </div>
            <div>
              <label class="text-xs font-medium text-slate-700">Tanggal Mulai</label>
              <input id="special-note-history-start" type="date" class="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none" />
            </div>
            <div>
              <label class="text-xs font-medium text-slate-700">Tanggal Akhir</label>
              <input id="special-note-history-end" type="date" class="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none" />
            </div>
          </div>
          <div id="special-note-history" class="mt-4 space-y-2"></div>
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
  const markSelectedAbsentBtn = container.querySelector('#mark-selected-absent-btn');
  const attendanceSummary = container.querySelector('#attendance-summary');
  const memberListEl = container.querySelector('#member-list');
  const memberSelectAll = container.querySelector('#member-select-all');
  const selectedStudentCount = container.querySelector('#selected-student-count');
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
  const tabInput = container.querySelector('#tab-input');
  const tabKeaktifan = container.querySelector('#tab-keaktifan');
  const tabRekap = container.querySelector('#tab-rekap');
  const tabPencapaian = container.querySelector('#tab-pencapaian');
  const saveActivityBtn = container.querySelector('#save-activity-btn');
  const resetActivityFormBtn = container.querySelector('#reset-activity-form-btn');
  const activityStudentSelect = container.querySelector('#activity-student-select');
  const activityScoreSelect = container.querySelector('#activity-score-select');
  const activityNoteInput = container.querySelector('#activity-note-input');
  const activityPointPreview = container.querySelector('#activity-point-preview');
  const activityGradePreview = container.querySelector('#activity-grade-preview');
  const activityTodayList = container.querySelector('#activity-today-list');
  const activityTopLimitInput = container.querySelector('#activity-top-limit');
  const activityTopList = container.querySelector('#activity-top-list');
  const activityNeedsCount = container.querySelector('#activity-needs-count');
  const activityNeedsList = container.querySelector('#activity-needs-list');
  const topPresentList = container.querySelector('#top-present-list');
  const topAbsentList = container.querySelector('#top-absent-list');
  const motivationText = container.querySelector('#motivation-text');
  const specialNoteStudent = container.querySelector('#special-note-student');
  const specialNoteType = container.querySelector('#special-note-type');
  const specialNoteTime = container.querySelector('#special-note-time');
  const specialNoteText = container.querySelector('#special-note-text');
  const saveSpecialNoteBtn = container.querySelector('#save-special-note-btn');
  const specialNoteMessage = container.querySelector('#special-note-message');
  const specialNoteUseSelected = container.querySelector('#special-note-use-selected');
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
  let currentActivityRecords = [];

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

  async function refreshActivityRecords() {
    const assignment = getCurrentAssignment();
    if (!assignment) {
      currentActivityRecords = [];
      return;
    }

    try {
      const docs = await getDocumentsWhere('keaktifan_siswa', [
        { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
        { field: 'semester_id', operator: '==', value: context.semester_aktif },
        { field: 'pengajaran_id', operator: '==', value: assignment.id },
      ]);
      currentActivityRecords = [...docs].sort((a, b) => String(b.tanggal || '').localeCompare(String(a.tanggal || '')));
    } catch (error) {
      console.error('Gagal memuat data keaktifan:', error);
      currentActivityRecords = [];
    }
  }

  function getActivityForDate(date) {
    return currentActivityRecords.filter((record) => record.tanggal === date);
  }

  function getActivityRecord(studentId, date) {
    return getActivityForDate(date).find((item) => String(item.siswa_id) === String(studentId));
  }

  function getSortedMembers() {
    return [...currentMembers].sort((a, b) => {
      const nameA = (a.siswa_nama || a.nama || '').toLowerCase();
      const nameB = (b.siswa_nama || b.nama || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }

  function getActivityFormIndicators() {
    const indicators = {};
    container.querySelectorAll('.activity-form-indicator').forEach((input) => {
      const key = input.getAttribute('data-indicator');
      if (key) {
        indicators[key] = input.checked;
      }
    });
    return indicators;
  }

  function getActivityPointCount(indicators = {}) {
    return activityIndicators.filter((item) => indicators[item.key]).length;
  }

  function updateActivityFormPreview() {
    const indicators = getActivityFormIndicators();
    const points = getActivityPointCount(indicators);
    const score = Number(activityScoreSelect?.value || 3);
    const grade = scoreToGrade(score);

    if (activityPointPreview) {
      activityPointPreview.textContent = `${points}/5`;
    }

    if (activityGradePreview) {
      activityGradePreview.textContent = grade;
      activityGradePreview.className = `font-semibold ${grade === 'A' ? 'text-emerald-700' : grade === 'B' ? 'text-amber-700' : 'text-rose-700'}`;
    }
  }

  function fillActivityForm(record) {
    const indicators = record?.indikator || {};
    container.querySelectorAll('.activity-form-indicator').forEach((input) => {
      const key = input.getAttribute('data-indicator');
      input.checked = Boolean(indicators[key]);
    });
    if (activityScoreSelect) {
      activityScoreSelect.value = String(Number(record?.skor || 3));
    }
    if (activityNoteInput) {
      activityNoteInput.value = record?.catatan || '';
    }
    updateActivityFormPreview();
  }

  function resetActivityForm() {
    container.querySelectorAll('.activity-form-indicator').forEach((input) => {
      input.checked = false;
    });
    if (activityScoreSelect) {
      activityScoreSelect.value = '3';
    }
    if (activityNoteInput) {
      activityNoteInput.value = '';
    }
    updateActivityFormPreview();
  }

  function renderActivityStudentOptions() {
    if (!activityStudentSelect) {
      return;
    }

    const sortedMembers = getSortedMembers();
    if (!sortedMembers.length) {
      activityStudentSelect.innerHTML = '<option value="">Belum ada siswa</option>';
      resetActivityForm();
      return;
    }

    const currentSelected = activityStudentSelect.value;
    activityStudentSelect.innerHTML = sortedMembers
      .map((member) => {
        const id = member.siswa_id || member.id;
        const name = member.siswa_nama || member.nama || '-';
        return `<option value="${id}">${name}</option>`;
      })
      .join('');

    const selectedId = sortedMembers.some((member) => String(member.siswa_id || member.id) === String(currentSelected))
      ? currentSelected
      : String(sortedMembers[0].siswa_id || sortedMembers[0].id);

    activityStudentSelect.value = selectedId;
    const record = getActivityRecord(selectedId, selectedDate);
    fillActivityForm(record);
  }

  function renderActivityTodayList() {
    if (!activityTodayList) {
      return;
    }

    const todayRecords = getActivityForDate(selectedDate)
      .sort((a, b) => String(a.siswa_nama || '').localeCompare(String(b.siswa_nama || ''), 'id'));

    activityTodayList.innerHTML = todayRecords.length
      ? todayRecords.map((item, index) => {
          const points = Number.isFinite(Number(item.poin_indikator))
            ? Number(item.poin_indikator)
            : getActivityPointCount(item.indikator || {});
          const grade = item.predikat || scoreToGrade(item.skor);
          return `
            <div class="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div class="flex items-center justify-between gap-2">
                <p class="text-sm font-semibold text-slate-800">${index + 1}. ${item.siswa_nama || '-'}</p>
                <span class="rounded-full px-2 py-1 text-xs font-semibold ${gradeBadgeClass(grade)}">${grade}</span>
              </div>
              <p class="mt-1 text-xs text-slate-500">Poin ${points}/5 • Skor ${Number(item.skor || 0).toFixed(1)}${item.catatan ? ` • ${item.catatan}` : ''}</p>
            </div>
          `;
        }).join('')
      : '<p class="text-sm text-slate-500">Belum ada entri keaktifan untuk tanggal ini.</p>';
  }

  function renderActivityRecap() {
    if (!activityTopList || !activityNeedsCount || !activityNeedsList || !activityTopLimitInput) {
      return;
    }

    if (!currentMembers.length) {
      activityTopList.innerHTML = '<p class="text-sm text-slate-500">Belum ada data siswa.</p>';
      activityNeedsCount.textContent = '0';
      activityNeedsList.innerHTML = '<p class="text-sm text-slate-500">Belum ada data siswa.</p>';
      return;
    }

    const memberMap = new Map(currentMembers.map((m) => [String(m.siswa_id || m.id), m.siswa_nama || m.nama || '-']));

    const groupedByStudent = {};
    currentActivityRecords.forEach((item) => {
      const key = String(item.siswa_id || '');
      if (!groupedByStudent[key]) {
        groupedByStudent[key] = [];
      }
      groupedByStudent[key].push(item);
    });

    const totals = Object.entries(groupedByStudent)
      .map(([studentId, items]) => {
        const totalPoints = items.reduce((sum, it) => {
          if (Number.isFinite(Number(it.poin_indikator))) {
            return sum + Number(it.poin_indikator);
          }
          return sum + getActivityPointCount(it.indikator || {});
        }, 0);
        const avgScore = items.length ? items.reduce((sum, it) => sum + Number(it.skor || 0), 0) / items.length : 0;
        return {
          studentId,
          studentName: memberMap.get(studentId) || '-',
          totalPoints,
          avgScore,
          totalMeetings: items.length,
        };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints || b.avgScore - a.avgScore || a.studentName.localeCompare(b.studentName));

    const displayLimit = Math.max(3, Math.min(50, Number(activityTopLimitInput.value || 10)));
    activityTopLimitInput.value = String(displayLimit);
    const medalStyles = [
      {
        bgClass: 'bg-gradient-to-r from-amber-100 to-yellow-100 border-amber-300',
        iconClass: 'text-amber-500',
      },
      {
        bgClass: 'bg-gradient-to-r from-slate-100 to-gray-100 border-slate-300',
        iconClass: 'text-slate-500',
      },
      {
        bgClass: 'bg-gradient-to-r from-orange-100 to-amber-100 border-orange-300',
        iconClass: 'text-orange-500',
      },
    ];

    activityTopList.innerHTML = totals.length
      ? totals
          .slice(0, displayLimit)
          .map((item, index) => {
            const medal = medalStyles[index] || { bgClass: 'bg-white border-slate-200', iconClass: 'text-slate-300' };
            return `
              <div class="rounded-xl border px-3 py-2 ${medal.bgClass}">
                <div class="flex items-center justify-between gap-2">
                  <p class="text-sm font-semibold text-slate-800">${index + 1}. ${item.studentName}</p>
                  <span class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/80 ${medal.iconClass}">
                    <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <path d="M4 18h16l-1-9-4 3-3-5-3 5-4-3-1 9z"/>
                    </svg>
                  </span>
                </div>
                <p class="mt-1 text-xs text-slate-600">Total poin ${item.totalPoints} • ${item.totalMeetings} pertemuan • Rata skor ${item.avgScore.toFixed(2)}</p>
              </div>
            `;
          })
          .join('')
      : '<p class="text-sm text-slate-500">Belum ada data keaktifan tersimpan.</p>';

    const needsFollowUp = Object.entries(groupedByStudent)
      .map(([studentId, items]) => {
        const avg = items.length ? items.reduce((sum, it) => sum + Number(it.skor || 0), 0) / items.length : 0;
        const indicatorAvg = items.length
          ? items.reduce((sum, it) => sum + getActivityPointCount(it.indikator || {}), 0) / items.length
          : 0;
        return {
          studentId,
          studentName: memberMap.get(studentId) || '-',
          avg,
          indicatorAvg,
        };
      })
      .filter((item) => item.avg < 2 || item.indicatorAvg < 2)
      .sort((a, b) => a.avg - b.avg || a.studentName.localeCompare(b.studentName));

    activityNeedsCount.textContent = String(needsFollowUp.length);
    activityNeedsList.innerHTML = needsFollowUp.length
      ? needsFollowUp
          .slice(0, 10)
          .map((item) => `
            <div class="rounded-xl border border-rose-200 bg-white px-3 py-2">
              <p class="text-sm font-semibold text-slate-800">${item.studentName}</p>
              <p class="mt-1 text-xs text-slate-500">Rata skor ${item.avg.toFixed(2)} • Rata indikator ${item.indicatorAvg.toFixed(2)}/5</p>
            </div>
          `)
          .join('')
      : '<p class="text-sm text-slate-500">Belum ada siswa yang perlu tindak lanjut.</p>';
  }

  async function saveActivityRecords() {
    const assignment = getCurrentAssignment();
    if (!assignment) {
      alert('Tidak ada relasi mengajar yang dipilih.');
      return;
    }

    if (!selectedDate || !isWeekday(selectedDate)) {
      alert('Pilih tanggal hari kerja Senin-Jumat.');
      return;
    }

    const studentId = activityStudentSelect?.value || '';
    if (!studentId) {
      alert('Pilih siswa terlebih dahulu.');
      return;
    }

    const studentName = activityStudentSelect.options[activityStudentSelect.selectedIndex]?.text || '-';
    const indikator = getActivityFormIndicators();
    const points = getActivityPointCount(indikator);
    const score = Number(activityScoreSelect?.value || 3);
    const grade = scoreToGrade(score);
    const note = String(activityNoteInput?.value || '').trim();
    const docId = `${assignment.id}_${studentId}_${selectedDate}`;

    const payload = {
      id: docId,
      tahun_ajaran_id: context.tahun_ajaran_aktif,
      semester_id: context.semester_aktif,
      pengajaran_id: assignment.id,
      guru_id: assignment.guru_id,
      guru_nama: assignment.guru_nama,
      kelas_id: assignment.kelas_id,
      kelas_nama: assignment.kelas_nama,
      mapel_id: assignment.mapel_id,
      mapel_nama: assignment.mapel_nama,
      siswa_id: studentId,
      siswa_nama: studentName,
      tanggal: selectedDate,
      hari: getDayName(selectedDate),
      indikator,
      poin_indikator: points,
      skor: score,
      predikat: grade,
      catatan: note,
      updated_at: new Date().toISOString(),
    };

    await saveDocument('keaktifan_siswa', payload, payload.id);
    await refreshActivityRecords();
    renderActivityTodayList();
    renderActivityRecap();
    alert(`Keaktifan ${studentName} tanggal ${formatAttendanceDate(selectedDate)} berhasil disimpan.`);
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

  function getSelectedStudentRows() {
    return Array.from(memberListEl.querySelectorAll('.member-select-checkbox:checked'));
  }

  function updateSelectedStudentCount() {
    const count = getSelectedStudentRows().length;
    selectedStudentCount.textContent = `${count} siswa dipilih`;
  }

  function setRowStatus(row, targetStatus) {
    const buttons = row.querySelectorAll('.status-btn');
    buttons.forEach((btn) => {
      const status = btn.getAttribute('data-status');
      const isActive = status === targetStatus;
      btn.dataset.active = isActive ? 'true' : 'false';
      btn.className = `status-btn rounded-xl border px-3 py-2 text-xs font-semibold ${isActive ? statusClasses[status] : 'border-slate-200 bg-white text-slate-600'}`;
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
          <li class="grid gap-3 rounded-3xl border border-slate-100 bg-slate-50 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <label class="inline-flex items-center justify-center">
              <input type="checkbox" class="member-select-checkbox h-4 w-4 rounded border-slate-300 text-[#007AFF]" data-student-id="${studentId}" data-student-name="${member.siswa_nama || member.nama || '-'}" />
            </label>
            <div>
              <div class="student-name text-sm font-medium text-slate-900">${index + 1}. ${member.siswa_nama || member.nama || '-'}</div>
              <div class="mt-1 text-xs text-slate-500">Nomor absen: ${member.nomor_absen || '-'}</div>
            </div>
            <div class="flex flex-wrap gap-2">
              ${statusLabels
                .map((value) => `
                  <button type="button" class="status-btn rounded-xl border px-3 py-2 text-xs font-semibold ${value === status ? statusClasses[value] : 'border-slate-200 bg-white text-slate-600'}" data-student-id="${studentId}" data-status="${value}" data-active="${value === status}">${value}</button>
                `)
                .join('')}
            </div>
          </li>
        `;
      })
      .join('');

    const recordsForDay = getAttendanceForDate(selectedDate);
    attendanceSummary.textContent = `${recordsForDay.length} catatan ditemukan untuk tanggal ${formatAttendanceDate(selectedDate)} (${getDayName(selectedDate)}).`;
    if (memberSelectAll) {
      memberSelectAll.checked = false;
    }
    updateSelectedStudentCount();
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
        const weekendClass = isWeekend ? 'bg-rose-100 text-rose-700' : 'text-slate-600';
        return `<th class="px-1 py-2 text-center font-semibold text-xs ${weekendClass}">${dateLabel}<br/><span class="text-[10px]">${dayLabel}</span></th>`;
      })
      .join('');
    
    tableHead.innerHTML = `
      <tr class="border-b border-slate-300 bg-slate-50">
        <th class="sticky left-0 z-10 w-12 bg-slate-50 px-2 py-2 text-left font-semibold uppercase tracking-[0.1em] text-slate-600 text-xs">No</th>
        <th class="sticky left-12 z-10 w-44 bg-slate-50 px-2 py-2 text-left font-semibold uppercase tracking-[0.1em] text-slate-600 text-xs">Nama</th>
        ${dateHeaderCells}
        <th class="px-2 py-2 text-center font-semibold uppercase tracking-[0.1em] text-slate-600 text-xs bg-blue-50">H</th>
        <th class="px-2 py-2 text-center font-semibold uppercase tracking-[0.1em] text-slate-600 text-xs bg-orange-50">S</th>
        <th class="px-2 py-2 text-center font-semibold uppercase tracking-[0.1em] text-slate-600 text-xs bg-cyan-50">I</th>
        <th class="px-2 py-2 text-center font-semibold uppercase tracking-[0.1em] text-slate-600 text-xs bg-red-50">A</th>
        <th class="px-2 py-2 text-center font-semibold uppercase tracking-[0.1em] text-slate-600 text-xs">Total</th>
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
              return '<td class="px-1 py-2 text-center text-[11px] font-semibold text-rose-600 bg-rose-50">Libur</td>';
            }
            const record = records.find((r) => r.siswa_id === memberId && r.tanggal === date);
            const status = record?.status || '-';
            const textClass = status === 'H' ? 'text-blue-700' :
              status === 'S' ? 'text-orange-700' :
              status === 'I' ? 'text-cyan-700' :
              status === 'A' ? 'text-red-700' :
              'text-slate-400';
            return `<td class="px-1 py-2 text-center text-xs font-semibold ${textClass}">${status}</td>`;
          })
          .join('');

        return `
          <tr class="border-b border-slate-200 hover:bg-slate-50 text-xs">
            <td class="sticky left-0 z-10 bg-white px-2 py-2 font-medium text-slate-700">${index + 1}</td>
            <td class="sticky left-12 z-10 bg-white px-2 py-2 font-medium text-slate-900 w-44 truncate">${member.siswa_nama || member.nama || '-'}</td>
            ${cells}
            <td class="px-2 py-2 text-center font-bold text-blue-600 bg-blue-50">${countH}</td>
            <td class="px-2 py-2 text-center font-bold text-orange-600 bg-orange-50">${countS}</td>
            <td class="px-2 py-2 text-center font-bold text-cyan-600 bg-cyan-50">${countI}</td>
            <td class="px-2 py-2 text-center font-bold text-red-600 bg-red-50">${countA}</td>
            <td class="px-2 py-2 text-center font-bold text-slate-900">${totalRecords}</td>
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
    await refreshActivityRecords();
    renderSpecialNoteStudentOptions();
    renderSpecialNoteHistoryStudentOptions();
    renderSpecialNoteHistory();
    renderMemberRows();
    renderActivityStudentOptions();
    renderActivityTodayList();
    renderActivityRecap();
    renderRecap();
  }

  async function saveSpecialNote() {
    const assignment = getCurrentAssignment();
    if (!assignment) {
      setSpecialNoteMessage('Relasi mengajar belum dipilih.', true);
      return;
    }

    const useSelected = Boolean(specialNoteUseSelected?.checked);
    const selectedRows = useSelected ? getSelectedStudentRows() : [];
    const jenis = specialNoteType.value;
    const jam = specialNoteTime.value || '-';
    const catatan = specialNoteText.value.trim();

    const targets = useSelected
      ? selectedRows.map((input) => ({
          siswaId: input.getAttribute('data-student-id') || '',
          siswaName: input.getAttribute('data-student-name') || '-',
        }))
      : [{
          siswaId: specialNoteStudent.value,
          siswaName: specialNoteStudent.options[specialNoteStudent.selectedIndex]?.text || '-',
        }];

    if (!targets.length || !targets[0].siswaId) {
      setSpecialNoteMessage(useSelected ? 'Pilih minimal 1 siswa pada daftar absensi.' : 'Pilih siswa terlebih dahulu.', true);
      return;
    }

    if (!catatan) {
      setSpecialNoteMessage('Catatan tidak boleh kosong.', true);
      return;
    }

    try {
      const now = Date.now();
      await Promise.all(targets.map((target, index) => {
        const docId = `${assignment.id}_${target.siswaId}_${selectedDate}_${now + index}`;
        return saveDocument('catatan_khusus', {
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
      }));

      specialNoteText.value = '';
      setSpecialNoteMessage(`Catatan khusus berhasil disimpan untuk ${targets.length} siswa.`);
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
        btn.className = `tab-btn inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold ${isActive ? 'bg-[#007AFF] text-white shadow-sm' : 'bg-slate-100 text-slate-700'}`;
      });
      const target = tabButton.getAttribute('data-tab');
      tabInput.classList.toggle('hidden', target !== 'input');
      tabKeaktifan.classList.toggle('hidden', target !== 'keaktifan');
      tabRekap.classList.toggle('hidden', target !== 'rekap');
      tabPencapaian.classList.toggle('hidden', target !== 'pencapaian');
      if (target === 'keaktifan') {
        renderActivityStudentOptions();
        renderActivityTodayList();
        renderActivityRecap();
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

    const selectCheckbox = event.target.closest('.member-select-checkbox');
    if (selectCheckbox) {
      const allCheckboxes = Array.from(memberListEl.querySelectorAll('.member-select-checkbox'));
      if (memberSelectAll) {
        memberSelectAll.checked = allCheckboxes.length > 0 && allCheckboxes.every((item) => item.checked);
      }
      updateSelectedStudentCount();
    }

    const activityIndicator = event.target.closest('.activity-form-indicator');
    if (activityIndicator) {
      updateActivityFormPreview();
    }
  });

  container.addEventListener('change', (event) => {
    const scoreInput = event.target.closest('#activity-score-select');
    if (scoreInput) {
      updateActivityFormPreview();
    }

    const studentSelect = event.target.closest('#activity-student-select');
    if (studentSelect) {
      const record = getActivityRecord(studentSelect.value, selectedDate);
      fillActivityForm(record);
    }
  });

  checkAllBtn?.addEventListener('click', () => {
    memberListEl.querySelectorAll('li').forEach((row) => {
      const buttons = row.querySelectorAll('.status-btn');
      buttons.forEach((btn) => {
        const status = btn.getAttribute('data-status');
        const isActive = status === 'H';
        btn.dataset.active = isActive ? 'true' : 'false';
        btn.className = `status-btn rounded-xl border px-3 py-2 text-xs font-semibold ${isActive ? statusClasses.H : 'border-slate-200 bg-white text-slate-600'}`;
      });
    });
    renderTodaySummary();
  });

  resetStatusBtn?.addEventListener('click', () => {
    renderMemberRows();
  });

  memberSelectAll?.addEventListener('change', (event) => {
    const checked = Boolean(event.target.checked);
    memberListEl.querySelectorAll('.member-select-checkbox').forEach((checkbox) => {
      checkbox.checked = checked;
    });
    updateSelectedStudentCount();
  });

  markSelectedAbsentBtn?.addEventListener('click', () => {
    const selectedRows = getSelectedStudentRows();
    if (!selectedRows.length) {
      alert('Pilih minimal satu siswa terlebih dahulu.');
      return;
    }

    selectedRows.forEach((checkbox) => {
      const row = checkbox.closest('li');
      if (row) {
        setRowStatus(row, 'A');
      }
    });

    renderTodaySummary();
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
    renderActivityStudentOptions();
    renderActivityTodayList();
    renderActivityRecap();
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

  activityTopLimitInput?.addEventListener('change', () => {
    renderActivityRecap();
  });

  resetActivityFormBtn?.addEventListener('click', () => {
    resetActivityForm();
  });

  saveAbsenBtn?.addEventListener('click', saveAttendance);
  saveActivityBtn?.addEventListener('click', saveActivityRecords);
  saveSpecialNoteBtn?.addEventListener('click', saveSpecialNote);
  [specialNoteHistoryStudent, specialNoteHistoryType, specialNoteHistoryStart, specialNoteHistoryEnd].forEach((el) => {
    el?.addEventListener('change', renderSpecialNoteHistory);
  });

  await refreshSpecialNotes();
  await refreshActivityRecords();
  renderSpecialNoteStudentOptions();
  renderSpecialNoteHistoryStudentOptions();
  renderSpecialNoteHistory();
  renderMemberRows();
  renderActivityStudentOptions();
  renderActivityTodayList();
  renderActivityRecap();
  renderRecap();
  renderPencapaian();
}
