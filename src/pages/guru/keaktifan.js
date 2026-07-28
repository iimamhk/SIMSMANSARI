import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import {
  getTeachingAssignmentsForUser,
  getActiveTeachingAssignments,
  getClassMembers,
  getDocumentsWhere,
  saveDocument,
  deleteDocument,
} from '../../firebase/data-service.js';

const ACTIVITY_INDICATORS = [
  { key: 'bertanya', label: 'Bertanya' },
  { key: 'menjawab', label: 'Menjawab' },
  { key: 'diskusi', label: 'Diskusi' },
  { key: 'presentasi', label: 'Presentasi' },
  { key: 'tugas_kelas', legacyKey: 'membantu', label: 'Tugas Kelas' },
];

const TAB_META = {
  input: { label: 'Input Hari Ini', panel: 'activity-panel-input' },
  history: { label: 'Riwayat', panel: 'activity-panel-history' },
  recap: { label: 'Rekap', panel: 'activity-panel-recap' },
  followup: { label: 'Tindak Lanjut', panel: 'activity-panel-followup' },
};

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('simguru_session') || '{}');
  } catch {
    return {};
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function defaultSchoolDate() {
  const date = new Date();
  const day = date.getDay();
  if (day === 0) date.setDate(date.getDate() + 1);
  if (day === 6) date.setDate(date.getDate() + 2);
  return localDateValue(date);
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSchoolWeekday(value) {
  const day = parseLocalDate(value)?.getDay();
  return day >= 1 && day <= 5;
}

function getSchoolDayName(value) {
  const date = parseLocalDate(value);
  return date ? date.toLocaleDateString('id-ID', { weekday: 'long' }) : '-';
}

function formatDate(value) {
  if (!value) return '-';
  const date = parseLocalDate(value);
  if (!date) return '-';
  return date.toLocaleDateString('id-ID', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
}

function scoreGrade(score) {
  const value = Number(score || 0);
  if (value >= 3.5) return 'A';
  if (value >= 2.5) return 'B';
  return 'C';
}

function clampScore(value) {
  return Math.max(1, Math.min(4, Number(value) || 1));
}

function isIndicatorActive(indicators = {}, item) {
  if (Object.prototype.hasOwnProperty.call(indicators, item.key)) {
    return Boolean(indicators[item.key]);
  }
  return Boolean(item.legacyKey && indicators[item.legacyKey]);
}

function indicatorCount(indicators = {}) {
  return ACTIVITY_INDICATORS.filter((item) => isIndicatorActive(indicators, item)).length;
}

function getStudentId(member) {
  return String(member?.siswa_id || member?.id || '');
}

function getStudentName(member) {
  return member?.siswa_nama || member?.nama || '-';
}

function activityDocId(assignmentId, studentId, date) {
  return `${assignmentId}_${studentId}_${date}`;
}

function activityTransactionId(assignmentId, studentId, date) {
  const random = Math.random().toString(36).slice(2, 8);
  return `${assignmentId}_${studentId}_${date}_${Date.now()}_${random}`;
}

function getRecordForDate(records, studentId, date) {
  return records.find((record) => String(record.siswa_id || '') === String(studentId) && record.tanggal === date) || null;
}

function aggregateStudents(members, records, classMeetingCount = 0) {
  return members.map((member) => {
    const studentId = getStudentId(member);
    const studentRecords = records.filter((record) => String(record.siswa_id || '') === studentId);
    const totalPoints = studentRecords.reduce((sum, record) => sum + indicatorPointValue(record), 0);
    const totalIndicators = studentRecords.reduce((sum, record) => sum + indicatorCount(record.indikator), 0);
    const averagePoints = studentRecords.length ? totalPoints / studentRecords.length : 0;
    const indicatorRate = studentRecords.length
      ? (totalIndicators / (studentRecords.length * ACTIVITY_INDICATORS.length)) * 100
      : 0;
    const activeMeetingCount = new Set(studentRecords.map((record) => record.tanggal).filter(Boolean)).size;
    const activityTypes = ACTIVITY_INDICATORS.filter((indicator) => studentRecords.some((record) => isIndicatorActive(record.indikator, indicator)));
    return {
      studentId,
      studentName: getStudentName(member),
      activityCount: studentRecords.length,
      totalPoints,
      averagePoints,
      activeMeetingCount,
      activityTypeCount: activityTypes.length,
      activityTypeLabels: activityTypes.map((item) => item.label),
      pointsPerClassMeeting: classMeetingCount ? totalPoints / classMeetingCount : 0,
      indicatorRate,
      grade: studentRecords.length ? scoreGrade(averagePoints) : '-',
    };
  });
}

function indicatorPointValue(record) {
  const stored = Number(record?.poin_indikator);
  return Number.isFinite(stored) ? stored : indicatorCount(record?.indikator);
}

function createDraft(record) {
  return {
    points: Math.max(1, Math.min(4, Number(record?.poin_indikator ?? record?.skor ?? 1) || 1)),
    indicators: Object.fromEntries(ACTIVITY_INDICATORS.map((item) => [item.key, isIndicatorActive(record?.indikator, item)])),
    note: record?.catatan || '',
  };
}

export async function renderGuruKeaktifanPage(container) {
  const context = getStoredContext();
  const session = getSession();

  if (!context.tahun_ajaran_aktif || !context.semester_aktif) {
    container.innerHTML = renderLayout('Keaktifan Siswa', `
      <div class="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
        <h2 class="font-semibold text-amber-900">Periode akademik belum dipilih</h2>
        <p class="mt-2 text-sm text-amber-700">Pilih tahun ajaran dan semester aktif dari Dashboard.</p>
      </div>
    `);
    return;
  }

  const userId = session?.user?.username || context?.user_logged_in || '';
  const assignments = userId
    ? await getTeachingAssignmentsForUser(context, userId)
    : await getActiveTeachingAssignments(context);

  if (!assignments.length) {
    container.innerHTML = renderLayout('Keaktifan Siswa', `
      <div class="rounded-2xl border border-orange-200 bg-orange-50 p-5 text-center">
        <h2 class="font-semibold text-orange-900">Belum ada relasi mengajar aktif</h2>
        <p class="mt-2 text-sm text-orange-700">Hubungi administrator atau periksa relasi mengajar Anda.</p>
      </div>
    `);
    return;
  }

  let activeAssignment = assignments[0];
  let activeDate = defaultSchoolDate();
  let activeTab = 'input';
  let selectedStudentId = '';
  let editingTransactionId = '';
  let members = [];
  let records = [];
  const draftByStudent = new Map();
  let loadGeneration = 0;
  let disposed = false;

  const assignmentOptions = assignments.map((assignment) => `
    <option value="${escapeHtml(assignment.id)}">${escapeHtml(assignment.kelas_nama)} • ${escapeHtml(assignment.mapel_nama)}</option>
  `).join('');

  const html = renderLayout('Keaktifan Siswa', `
    <div data-activity-workspace class="space-y-3 sm:space-y-4">
      <section class="overflow-hidden rounded-[24px] border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/70 to-cyan-50/70 p-3 shadow-sm sm:rounded-[28px] sm:p-5">
        <div class="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div class="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
              <span class="h-2 w-2 rounded-full bg-emerald-500"></span> Observasi proses belajar
            </div>
            <h1 class="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Keaktifan Siswa</h1>
            <p class="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">Catat partisipasi siswa dengan cepat selama pembelajaran berlangsung.</p>
          </div>
          <div class="grid gap-2 sm:grid-cols-2 xl:min-w-[500px] xl:grid-cols-[1.4fr_0.8fr]">
            <div>
              <label for="activity-assignment" class="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Kelas & mata pelajaran</label>
              <select id="activity-assignment" class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100">${assignmentOptions}</select>
            </div>
            <div>
              <label for="activity-date" class="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Tanggal</label>
              <input id="activity-date" type="date" value="${activeDate}" class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" />
            </div>
          </div>
        </div>
      </section>

      <div class="rounded-[22px] border border-slate-200 bg-white p-1 shadow-sm">
        <div class="grid grid-cols-2 gap-1 sm:grid-cols-4" role="tablist" aria-label="Menu Keaktifan Siswa">
          ${Object.entries(TAB_META).map(([key, meta]) => `
            <button id="activity-tab-${key}" type="button" role="tab" aria-controls="${meta.panel}" aria-selected="${key === 'input'}" tabindex="${key === 'input' ? '0' : '-1'}" data-activity-tab="${key}" class="activity-tab rounded-xl px-2 py-2.5 text-xs font-semibold transition ${key === 'input' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}">${meta.label}</button>
          `).join('')}
        </div>
      </div>

      <section id="activity-panel-input" role="tabpanel" aria-labelledby="activity-tab-input" class="space-y-3">
        <div class="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="text-sm font-bold text-slate-900">Input Hari Ini</h2>
            <p id="activity-date-label" class="mt-1 text-xs text-slate-500">${formatDate(activeDate)}</p>
          </div>
          <div class="w-full sm:w-80">
            <label for="activity-student-select" class="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Pilih siswa</label>
            <select id="activity-student-select" class="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100">
              <option value="">Memuat siswa…</option>
            </select>
          </div>
        </div>
        <div id="activity-student-list"></div>
        <div class="rounded-2xl border border-slate-200 bg-white p-4">
          <div class="flex items-center justify-between gap-2"><div><h3 class="text-sm font-bold text-slate-900">Riwayat Hari Ini</h3><p class="mt-1 text-xs text-slate-500">Entri yang sudah disimpan untuk tanggal terpilih.</p></div><span id="activity-today-count" class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">0 entri</span></div>
          <div id="activity-today-list" class="mt-3 space-y-2"></div>
        </div>
      </section>

      <section id="activity-panel-history" role="tabpanel" aria-labelledby="activity-tab-history" class="hidden space-y-3">
        <div class="rounded-2xl border border-slate-200 bg-white p-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 class="font-bold text-slate-900">Riwayat Observasi</h2><p class="mt-1 text-xs text-slate-500">Catatan terbaru untuk kelas aktif.</p></div>
            <input id="activity-history-search" type="search" placeholder="Cari siswa atau catatan…" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none sm:w-72" />
          </div>
          <div id="activity-history-list" class="mt-4 space-y-2"></div>
        </div>
      </section>

      <section id="activity-panel-recap" role="tabpanel" aria-labelledby="activity-tab-recap" class="hidden space-y-3">
        <div id="activity-recap-summary" class="grid grid-cols-2 gap-2 lg:grid-cols-4"></div>
        <div class="rounded-2xl border border-slate-200 bg-white p-4"><div class="flex flex-wrap items-center justify-between gap-2"><div><h2 class="font-bold text-slate-900">Statistik Jenis Aktivitas</h2><p class="mt-1 text-xs text-slate-500">Jumlah transaksi yang memuat setiap jenis keaktifan.</p></div><p id="activity-rarest-type" class="text-xs font-semibold text-amber-700"></p></div><div id="activity-type-stats" class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"></div></div>
        <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div class="border-b border-slate-100 p-4"><h2 class="font-bold text-slate-900">Rekap per Siswa</h2><p class="mt-1 text-xs text-slate-500">Perbandingan memakai rata-rata agar adil untuk jumlah observasi berbeda.</p></div>
          <div class="overflow-x-auto"><table class="min-w-[850px] w-full text-xs"><thead class="bg-slate-50 text-slate-600"><tr><th class="px-3 py-3 text-left">No</th><th class="px-3 py-3 text-left">Siswa</th><th class="px-3 py-3 text-center">Aktivitas</th><th class="px-3 py-3 text-center">Total Poin</th><th class="px-3 py-3 text-center">Rata Poin</th><th class="px-3 py-3 text-center">Pertemuan Aktif</th><th class="px-3 py-3 text-center">Variasi</th><th class="px-3 py-3 text-center">Poin/Pertemuan</th></tr></thead><tbody id="activity-recap-body"></tbody></table></div>
        </div>
      </section>

      <section id="activity-panel-followup" role="tabpanel" aria-labelledby="activity-tab-followup" class="hidden grid gap-3 lg:grid-cols-2">
        <div class="rounded-2xl border border-rose-100 bg-white p-4"><h2 class="font-bold text-slate-900">Perlu Dorongan</h2><p class="mt-1 text-xs text-slate-500">Rata-rata skor di bawah 2,5 atau keterlibatan indikator rendah.</p><div id="activity-needs-list" class="mt-4 space-y-2"></div></div>
        <div class="rounded-2xl border border-amber-100 bg-white p-4"><h2 class="font-bold text-slate-900">Belum Terobservasi</h2><p class="mt-1 text-xs text-slate-500">Siswa yang belum memiliki observasi pada kelas aktif.</p><div id="activity-unobserved-list" class="mt-4 space-y-2"></div></div>
      </section>
    </div>
  `);

  container.innerHTML = html;

  const assignmentSelect = container.querySelector('#activity-assignment');
  const dateInput = container.querySelector('#activity-date');
  const studentList = container.querySelector('#activity-student-list');
  const studentSelect = container.querySelector('#activity-student-select');
  const historySearch = container.querySelector('#activity-history-search');
  const todayList = container.querySelector('#activity-today-list');
  const todayCount = container.querySelector('#activity-today-count');

  const setRowStatus = (card, state, message) => {
    const status = card?.querySelector?.('[data-row-status]');
    if (!status) return;
    status.textContent = message;
    status.className = `mt-2 text-[11px] ${state === 'error' ? 'text-rose-600' : state === 'saved' ? 'text-emerald-600' : 'text-slate-400'}`;
  };

  const loadWorkspaceData = async () => {
    const generation = ++loadGeneration;
    const assignment = activeAssignment;
    try {
      const [nextMembers, nextRecords] = await Promise.all([
        getClassMembers(context, assignment.kelas_id),
        getDocumentsWhere('keaktifan_siswa', [
          { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
          { field: 'semester_id', operator: '==', value: context.semester_aktif },
          { field: 'pengajaran_id', operator: '==', value: assignment.id },
        ], { cacheMs: 30000, throwOnError: true }),
      ]);
      if (disposed || generation !== loadGeneration || assignment.id !== activeAssignment.id) return;
      members = [...nextMembers].sort((a, b) => getStudentName(a).localeCompare(getStudentName(b), 'id'));
      records = nextRecords;
      draftByStudent.clear();
      renderAll();
    } catch (error) {
      if (disposed || generation !== loadGeneration) return;
      console.error('Gagal memuat modul keaktifan:', error);
      members = [];
      records = [];
      renderAll();
    }
  };

  const getDraft = (member) => {
    const studentId = getStudentId(member);
    if (draftByStudent.has(studentId)) return draftByStudent.get(studentId);
    const record = editingTransactionId
      ? records.find((item) => item.id === editingTransactionId && String(item.siswa_id || '') === studentId)
      : null;
    const draft = createDraft(record);
    draftByStudent.set(studentId, draft);
    return draft;
  };

  const studentCard = (member, index) => {
    const studentId = getStudentId(member);
    const studentName = getStudentName(member);
    const draft = getDraft(member);
    const isEditing = Boolean(editingTransactionId);
    return `
      <article data-activity-student="${escapeHtml(studentId)}" class="mx-auto max-w-3xl rounded-[22px] border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div><h3 class="truncate text-sm font-bold text-slate-900">${index + 1}. ${escapeHtml(studentName)}</h3><p data-observation-state class="mt-1 text-[11px] text-slate-500">${isEditing ? 'Mengedit transaksi terpilih' : 'Buat transaksi keaktifan baru'}</p></div>
        <p class="mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Poin yang diberikan</p>
        <div class="mt-1.5 grid grid-cols-4 gap-1.5" role="group" aria-label="Poin keaktifan ${escapeHtml(studentName)}">
          ${[1, 2, 3, 4].map((points) => `<button type="button" data-score-value="${points}" aria-pressed="${points === draft.points}" class="min-h-10 rounded-xl border text-xs font-bold transition ${points === draft.points ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-emerald-50'}">${points} poin</button>`).join('')}
        </div>
        <p class="mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Jenis keaktifan</p>
        <div class="mt-3 flex flex-wrap gap-1.5">
          ${ACTIVITY_INDICATORS.map((item) => `<button type="button" data-indicator="${item.key}" aria-pressed="${draft.indicators[item.key]}" class="rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition ${draft.indicators[item.key] ? 'border-cyan-500 bg-cyan-500 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-cyan-300'}">${item.label}</button>`).join('')}
        </div>
        <label class="mt-3 block text-[11px] font-semibold text-slate-500">Catatan singkat <span class="font-normal">(opsional)</span>
          <input data-activity-note type="text" maxlength="180" value="${escapeHtml(draft.note)}" placeholder="Contoh: aktif membantu diskusi kelompok" class="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" />
        </label>
        <div class="mt-3 flex flex-wrap items-center justify-between gap-3"><p data-row-status class="text-[11px] text-slate-400">${isEditing ? 'Perubahan belum disimpan' : 'Pilih poin dan jenis keaktifan'}</p><div class="flex gap-2">${isEditing ? '<button type="button" data-cancel-edit class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Batal</button>' : ''}<button type="button" data-save-observation class="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">${isEditing ? 'Simpan Perubahan' : 'Simpan Transaksi'}</button></div></div>
      </article>
    `;
  };

  const renderStudentList = () => {
    if (!members.length) {
      selectedStudentId = '';
      studentSelect.disabled = true;
      studentSelect.innerHTML = '<option value="">Belum ada siswa</option>';
      studentList.innerHTML = '<div class="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Belum ada siswa pada kelas ini.</div>';
      return;
    }
    if (!members.some((member) => getStudentId(member) === selectedStudentId)) {
      selectedStudentId = getStudentId(members[0]);
    }
    studentSelect.disabled = false;
    studentSelect.innerHTML = members.map((member, index) => {
      const studentId = getStudentId(member);
      const todayActivityCount = records.filter((record) => String(record.siswa_id || '') === studentId && record.tanggal === activeDate).length;
      return `<option value="${escapeHtml(studentId)}">${index + 1}. ${escapeHtml(getStudentName(member))}${todayActivityCount ? ` · ${todayActivityCount} aktivitas` : ''}</option>`;
    }).join('');
    studentSelect.value = selectedStudentId;
    const selectedMember = members.find((member) => getStudentId(member) === selectedStudentId);
    const selectedIndex = members.findIndex((member) => getStudentId(member) === selectedStudentId);
    studentList.innerHTML = selectedMember ? studentCard(selectedMember, selectedIndex) : '';
  };

  const renderHistory = () => {
    const target = container.querySelector('#activity-history-list');
    const query = String(historySearch?.value || '').trim().toLowerCase();
    const filtered = [...records]
      .filter((record) => !query || `${record.siswa_nama || ''} ${record.catatan || ''}`.toLowerCase().includes(query))
      .sort((a, b) => String(b.tanggal || '').localeCompare(String(a.tanggal || '')) || String(a.siswa_nama || '').localeCompare(String(b.siswa_nama || ''), 'id'));
    target.innerHTML = filtered.length ? filtered.slice(0, 100).map((record) => {
    const points = indicatorPointValue(record);
      const activeIndicators = ACTIVITY_INDICATORS.filter((item) => isIndicatorActive(record.indikator, item)).map((item) => item.label);
      return `<article class="rounded-xl border border-slate-200 bg-slate-50 p-3"><div class="flex flex-wrap items-start justify-between gap-2"><div><h3 class="text-sm font-bold text-slate-900">${escapeHtml(record.siswa_nama || '-')}</h3><p class="mt-1 text-xs text-slate-500">${escapeHtml(formatDate(record.tanggal))}</p></div><span class="rounded-full bg-cyan-100 px-2 py-1 text-[11px] font-bold text-cyan-700">+${points} poin</span></div><p class="mt-2 text-xs text-slate-600">${activeIndicators.length ? escapeHtml(activeIndicators.join(' · ')) : 'Tanpa indikator'}${record.catatan ? ` — ${escapeHtml(record.catatan)}` : ''}</p></article>`;
    }).join('') : '<div class="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Belum ada riwayat yang sesuai.</div>';
  };

  const renderRecap = () => {
    const classMeetingCount = new Set(records.map((record) => record.tanggal).filter(Boolean)).size;
    const aggregates = aggregateStudents(members, records, classMeetingCount)
      .sort((a, b) => b.pointsPerClassMeeting - a.pointsPerClassMeeting || b.totalPoints - a.totalPoints);
    const observed = aggregates.filter((item) => item.activityCount > 0);
    const average = observed.length ? observed.reduce((sum, item) => sum + item.averagePoints, 0) / observed.length : 0;
    const totalActivities = records.length;
    const totalPoints = aggregates.reduce((sum, item) => sum + item.totalPoints, 0);
    container.querySelector('#activity-recap-summary').innerHTML = [
      ['Siswa Terobservasi', `${observed.length}/${members.length}`, 'emerald'],
      ['Total Aktivitas', totalActivities, 'blue'],
      ['Akumulasi Poin', totalPoints, 'cyan'],
      ['Rata-rata Poin', average.toFixed(2), 'cyan'],
    ].map(([label, value, color]) => `<div class="rounded-2xl border border-${color}-100 bg-${color}-50 p-3"><p class="text-[11px] font-semibold uppercase tracking-[0.1em] text-${color}-700">${label}</p><p class="mt-2 text-2xl font-bold text-slate-900">${value}</p></div>`).join('');
    const typeStats = ACTIVITY_INDICATORS.map((indicator) => ({
      ...indicator,
      count: records.filter((record) => isIndicatorActive(record.indikator, indicator)).length,
    }));
    const minimumCount = typeStats.length ? Math.min(...typeStats.map((item) => item.count)) : 0;
    const rarestTypes = typeStats.filter((item) => item.count === minimumCount).map((item) => item.label);
    container.querySelector('#activity-type-stats').innerHTML = typeStats.map((item) => `<div class="rounded-xl border border-slate-200 bg-slate-50 p-3"><p class="text-[11px] font-semibold text-slate-500">${escapeHtml(item.label)}</p><p class="mt-1 text-xl font-bold text-slate-900">${item.count}</p></div>`).join('');
    container.querySelector('#activity-rarest-type').textContent = records.length ? `Paling jarang: ${rarestTypes.join(', ')} (${minimumCount})` : 'Belum ada transaksi';
    container.querySelector('#activity-recap-body').innerHTML = aggregates.map((item, index) => `<tr class="border-t border-slate-100"><td class="px-3 py-3">${index + 1}</td><td class="px-3 py-3 font-semibold text-slate-900">${escapeHtml(item.studentName)}</td><td class="px-3 py-3 text-center">${item.activityCount}</td><td class="px-3 py-3 text-center font-bold text-cyan-700">${item.totalPoints}</td><td class="px-3 py-3 text-center font-bold text-emerald-700">${item.activityCount ? item.averagePoints.toFixed(2) : '-'}</td><td class="px-3 py-3 text-center">${item.activeMeetingCount}/${classMeetingCount || 0}</td><td class="px-3 py-3 text-center" title="${escapeHtml(item.activityTypeLabels.join(', ') || 'Belum ada')}">${item.activityTypeCount}/${ACTIVITY_INDICATORS.length}</td><td class="px-3 py-3 text-center font-bold text-indigo-700">${classMeetingCount ? item.pointsPerClassMeeting.toFixed(2) : '-'}</td></tr>`).join('');
  };

  const renderTodayHistory = () => {
    const todayRecords = records.filter((record) => record.tanggal === activeDate)
      .sort((a, b) => String(b.recorded_at || b.created_at || b.updated_at || '').localeCompare(String(a.recorded_at || a.created_at || a.updated_at || '')));
    todayCount.textContent = `${todayRecords.length} entri`;
    todayList.innerHTML = todayRecords.length ? todayRecords.map((record) => {
      const timestamp = record.recorded_at || record.created_at || record.updated_at;
      const time = timestamp ? new Date(timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
      return `<div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><div><div class="flex flex-wrap items-center gap-2"><p class="text-sm font-bold text-slate-900">${escapeHtml(record.siswa_nama || '-')}</p><span class="text-[11px] text-slate-400">${escapeHtml(time)}</span><span class="rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-bold text-cyan-700">+${indicatorPointValue(record)} poin</span></div><p class="mt-1 text-xs text-slate-500">${escapeHtml(ACTIVITY_INDICATORS.filter((item) => isIndicatorActive(record.indikator, item)).map((item) => item.label).join(' · ') || 'Tanpa indikator')}${record.catatan ? ` — ${escapeHtml(record.catatan)}` : ''}</p></div><div class="flex gap-1.5"><button type="button" data-edit-history-id="${escapeHtml(record.id)}" class="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100">Edit</button><button type="button" data-delete-history-id="${escapeHtml(record.id)}" data-delete-history-student="${escapeHtml(record.siswa_id)}" class="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100">Hapus</button></div></div>`;
    }).join('') : '<p class="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">Belum ada entri hari ini.</p>';
  };

  const renderFollowUp = () => {
    const classMeetingCount = new Set(records.map((record) => record.tanggal).filter(Boolean)).size;
    const aggregates = aggregateStudents(members, records, classMeetingCount);
    const needs = aggregates.filter((item) => item.activityCount > 0 && (item.averagePoints < 2.5 || item.indicatorRate < 40)).sort((a, b) => a.averagePoints - b.averagePoints);
    const unobserved = aggregates.filter((item) => item.activityCount === 0);
    container.querySelector('#activity-needs-list').innerHTML = needs.length ? needs.map((item) => `<div class="rounded-xl border border-rose-100 bg-rose-50/60 p-3"><div class="flex items-center justify-between gap-2"><p class="text-sm font-bold text-slate-900">${escapeHtml(item.studentName)}</p><span class="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-rose-700">${item.averagePoints.toFixed(2)}</span></div><p class="mt-1 text-xs text-slate-500">${item.activityCount} aktivitas · ${item.activeMeetingCount} pertemuan aktif · ${item.activityTypeCount} variasi</p></div>`).join('') : '<p class="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">Tidak ada siswa yang membutuhkan tindak lanjut saat ini.</p>';
    container.querySelector('#activity-unobserved-list').innerHTML = unobserved.length ? unobserved.map((item) => `<div class="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5 text-sm font-semibold text-slate-800">${escapeHtml(item.studentName)}</div>`).join('') : '<p class="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">Semua siswa sudah pernah terobservasi.</p>';
  };

  function renderAll() {
    renderStudentList();
    renderTodayHistory();
    renderHistory();
    renderRecap();
    renderFollowUp();
    container.querySelector('#activity-date-label').textContent = formatDate(activeDate);
  }

  const updateCardControls = (card, draft) => {
    card.querySelectorAll('[data-score-value]').forEach((button) => {
      const active = Number(button.dataset.scoreValue) === draft.points;
      button.setAttribute('aria-pressed', String(active));
      button.className = `min-h-10 rounded-xl border text-xs font-bold transition ${active ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-emerald-50'}`;
    });
    card.querySelectorAll('[data-indicator]').forEach((button) => {
      const active = Boolean(draft.indicators[button.dataset.indicator]);
      button.setAttribute('aria-pressed', String(active));
      button.className = `rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition ${active ? 'border-cyan-500 bg-cyan-500 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-cyan-300'}`;
    });
    const saveButton = card.querySelector('[data-save-observation]');
    if (saveButton) saveButton.disabled = false;
  };

  const refreshDerivedViews = () => {
    if (disposed || !container.querySelector('[data-activity-workspace]')) return;
    renderTodayHistory();
    renderHistory();
    renderRecap();
    renderFollowUp();
  };

  const saveObservation = async (studentId, card) => {
    const member = members.find((item) => getStudentId(item) === studentId);
    const draft = draftByStudent.get(studentId);
    if (!member || !draft || !isSchoolWeekday(activeDate)) return;
    if (indicatorCount(draft.indicators) === 0) {
      setRowStatus(card, 'error', 'Pilih minimal satu jenis keaktifan');
      return;
    }
    const assignment = activeAssignment;
    const date = activeDate;
    const existingTransaction = editingTransactionId ? records.find((record) => record.id === editingTransactionId) : null;
    const docId = existingTransaction?.id || activityTransactionId(assignment.id, studentId, date);
    const updatedAt = new Date().toISOString();
    const payload = {
      id: docId,
      tahun_ajaran_id: context.tahun_ajaran_aktif,
      semester_id: context.semester_aktif,
      pengajaran_id: assignment.id,
      guru_id: assignment.guru_id || context.user_logged_in || userId,
      guru_nama: assignment.guru_nama || session?.user?.nama || '',
      kelas_id: assignment.kelas_id,
      kelas_nama: assignment.kelas_nama,
      mapel_id: assignment.mapel_id,
      mapel_nama: assignment.mapel_nama,
      siswa_id: studentId,
      siswa_nama: getStudentName(member),
      tanggal: date,
      hari: getSchoolDayName(date),
      indikator: { ...draft.indicators },
      poin_indikator: draft.points,
      skor: draft.points,
      predikat: scoreGrade(draft.points),
      catatan: String(draft.note || '').trim(),
      source: 'manual',
      recorded_at: existingTransaction?.recorded_at || existingTransaction?.created_at || updatedAt,
      created_at: existingTransaction?.created_at || updatedAt,
      updated_at: updatedAt,
    };
    const saveButton = card.querySelector('[data-save-observation]');
    if (saveButton) saveButton.disabled = true;
    setRowStatus(card, 'pending', 'Menyimpan…');
    try {
      await saveDocument('keaktifan_siswa', payload, docId);
      const recordIndex = records.findIndex((record) => record.id === docId);
      if (recordIndex >= 0) records[recordIndex] = { ...records[recordIndex], ...payload, id: docId };
      else records.push({ ...payload, id: docId });
      editingTransactionId = '';
      draftByStudent.delete(studentId);
      refreshDerivedViews();
      renderStudentList();
    } catch (error) {
      console.error('Gagal menyimpan keaktifan:', error);
      if (saveButton) saveButton.disabled = false;
      setRowStatus(card, 'error', 'Gagal menyimpan · tekan Simpan lagi');
    }
  };

  studentList.addEventListener('click', async (event) => {
    const card = event.target.closest('[data-activity-student]');
    if (!card) return;
    const studentId = card.dataset.activityStudent;
    const member = members.find((item) => getStudentId(item) === studentId);
    if (!member) return;
    const saveButton = event.target.closest('[data-save-observation]');
    if (saveButton) {
      await saveObservation(studentId, card);
      return;
    }
    if (event.target.closest('[data-cancel-edit]')) {
      editingTransactionId = '';
      draftByStudent.clear();
      renderStudentList();
      return;
    }
    const draft = getDraft(member);
    const scoreButton = event.target.closest('[data-score-value]');
    const indicatorButton = event.target.closest('[data-indicator]');
    if (scoreButton) draft.points = clampScore(scoreButton.dataset.scoreValue);
    else if (indicatorButton) draft.indicators[indicatorButton.dataset.indicator] = !draft.indicators[indicatorButton.dataset.indicator];
    else return;
    updateCardControls(card, draft);
    setRowStatus(card, 'pending', 'Perubahan belum disimpan');
  });

  studentList.addEventListener('input', (event) => {
    const noteInput = event.target.closest('[data-activity-note]');
    if (!noteInput) return;
    const card = noteInput.closest('[data-activity-student]');
    const studentId = card.dataset.activityStudent;
    const member = members.find((item) => getStudentId(item) === studentId);
    if (!member) return;
    getDraft(member).note = noteInput.value;
    setRowStatus(card, 'pending', 'Perubahan belum disimpan');
  });

  todayList.addEventListener('click', async (event) => {
    const editButton = event.target.closest('[data-edit-history-id]');
    if (editButton) {
      const record = records.find((item) => item.id === editButton.dataset.editHistoryId);
      if (!record) return;
      editingTransactionId = record.id;
      selectedStudentId = String(record.siswa_id || '');
      draftByStudent.clear();
      renderStudentList();
      studentList.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const deleteButton = event.target.closest('[data-delete-history-id]');
    if (!deleteButton) return;
    const docId = deleteButton.dataset.deleteHistoryId;
    const studentId = deleteButton.dataset.deleteHistoryStudent;
    const record = records.find((item) => item.id === docId)
      || getRecordForDate(records, studentId, activeDate);
    if (!record) return;
    if (!window.confirm(`Hapus poin ${record.siswa_nama || 'siswa ini'} dari riwayat ${formatDate(activeDate)}?`)) return;
    deleteButton.disabled = true;
    deleteButton.textContent = 'Menghapus…';
    try {
      await deleteDocument('keaktifan_siswa', docId);
      records = records.filter((item) => item.id !== docId);
      if (editingTransactionId === docId) editingTransactionId = '';
      draftByStudent.delete(String(studentId));
      renderStudentList();
      refreshDerivedViews();
    } catch (error) {
      console.error('Gagal menghapus poin dari riwayat:', error);
      deleteButton.disabled = false;
      deleteButton.textContent = 'Hapus';
      window.alert('Gagal menghapus poin. Silakan coba lagi.');
    }
  });

  const activateTab = (nextTab) => {
    activeTab = TAB_META[nextTab] ? nextTab : 'input';
    container.querySelectorAll('[data-activity-tab]').forEach((button) => {
      const active = button.dataset.activityTab === activeTab;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      button.className = `activity-tab rounded-xl px-2 py-2.5 text-xs font-semibold transition ${active ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`;
    });
    Object.entries(TAB_META).forEach(([key, meta]) => container.querySelector(`#${meta.panel}`)?.classList.toggle('hidden', key !== activeTab));
  };

  container.querySelectorAll('[data-activity-tab]').forEach((button) => {
    button.addEventListener('click', () => activateTab(button.dataset.activityTab));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const tabs = Object.keys(TAB_META);
      const index = tabs.indexOf(button.dataset.activityTab);
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      const nextButton = container.querySelector(`[data-activity-tab="${tabs[nextIndex]}"]`);
      nextButton?.focus();
      nextButton?.click();
    });
  });

  studentSelect.addEventListener('change', () => {
    editingTransactionId = '';
    draftByStudent.clear();
    selectedStudentId = studentSelect.value;
    renderStudentList();
  });

  assignmentSelect.addEventListener('change', async () => {
    const nextAssignment = assignments.find((assignment) => assignment.id === assignmentSelect.value) || assignments[0];
    assignmentSelect.disabled = true;
    dateInput.disabled = true;
    try {
      editingTransactionId = '';
      draftByStudent.clear();
      activeAssignment = nextAssignment;
      await loadWorkspaceData();
    } finally {
      assignmentSelect.disabled = false;
      dateInput.disabled = false;
    }
  });
  dateInput.addEventListener('change', async () => {
    const nextDate = dateInput.value || defaultSchoolDate();
    if (!isSchoolWeekday(nextDate)) {
      dateInput.value = activeDate;
      window.alert('Pilih tanggal hari kerja Senin–Jumat.');
      return;
    }
    assignmentSelect.disabled = true;
    dateInput.disabled = true;
    try {
      editingTransactionId = '';
      activeDate = nextDate;
      draftByStudent.clear();
      renderAll();
    } finally {
      assignmentSelect.disabled = false;
      dateInput.disabled = false;
    }
  });
  historySearch.addEventListener('input', renderHistory);

  container.routeCleanup = () => {
    disposed = true;
    loadGeneration += 1;
  };

  await loadWorkspaceData();
}