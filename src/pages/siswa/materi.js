import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext, getSessionUserKeys, normalizeUserKey } from '../../utils/helpers.js';
import { getPublishedMaterials, recordMaterialRead, getActiveTeachingAssignments } from '../../firebase/data-service.js';

const MATERIAL_READS_KEY = 'simguru_material_reads';

function normalizeClassToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getCurrentStudent(session, context) {
  try {
    const sessionKeys = new Set(getSessionUserKeys(session, context));
    const localUsers = JSON.parse(localStorage.getItem('simguru_users') || '[]');
    return localUsers.find((item) => {
      const candidateKeys = [normalizeUserKey(item.username), normalizeUserKey(item.id)].filter(Boolean);
      return candidateKeys.some((key) => sessionKeys.has(key));
    }) || null;
  } catch {
    return null;
  }
}

function isStudentIncludedInAssignment(assignment, student) {
  const members = Array.isArray(assignment?.siswa) ? assignment.siswa : [];
  if (!members.length) {
    return true;
  }

  const studentKeys = new Set([
    normalizeClassToken(student?.username),
    normalizeClassToken(student?.id),
    normalizeClassToken(student?.siswa_id),
  ].filter(Boolean));

  return members.some((member) => {
    const memberKeys = [
      normalizeClassToken(member?.siswa_id),
      normalizeClassToken(member?.id),
      normalizeClassToken(member?.username),
    ].filter(Boolean);
    return memberKeys.some((key) => studentKeys.has(key));
  });
}

async function getStudentMaterials(session, context) {
  const student = getCurrentStudent(session, context);
  if (!student) {
    return [];
  }

  const studentClassId = student?.kelas_id || '';
  const studentClassName = student?.kelas_nama || '';
  if (!studentClassId && !studentClassName) {
    return [];
  }

  const [publishedMaterials, activeAssignments] = await Promise.all([
    getPublishedMaterials(),
    getActiveTeachingAssignments(context),
  ]);

  const studentClassTokens = new Set([
    normalizeClassToken(studentClassId),
    normalizeClassToken(studentClassName),
  ].filter(Boolean));

  const allowedAssignments = activeAssignments.filter((assignment) => {
    const assignmentClassTokens = [
      normalizeClassToken(assignment?.kelas_id),
      normalizeClassToken(assignment?.kelas_nama),
    ].filter(Boolean);
    const classMatched = assignmentClassTokens.some((token) => studentClassTokens.has(token));
    return classMatched && isStudentIncludedInAssignment(assignment, student);
  });

  const allowedAssignmentIds = new Set(
    allowedAssignments
      .map((assignment) => String(assignment?.id || '').trim())
      .filter(Boolean)
  );

  const filteredByPeriod = publishedMaterials
    .filter((item) => item.visible_to_students === true)
    .filter((item) => !context.tahun_ajaran_aktif || item.tahun_ajaran_id === context.tahun_ajaran_aktif)
    .filter((item) => !context.semester_aktif || item.semester_id === context.semester_aktif)
    .filter((item) => {
      const itemClassMatched = [
        normalizeClassToken(item.kelas_id),
        normalizeClassToken(item.kelas_nama),
        normalizeClassToken(item.kelas_token),
      ].some((token) => token && studentClassTokens.has(token));

      if (!itemClassMatched) {
        return false;
      }

      const assignmentId = String(item.pengajaran_id || '').trim();
      if (!assignmentId) {
        return false;
      }

      if (!allowedAssignmentIds.size) {
        return false;
      }

      return allowedAssignmentIds.has(assignmentId);
    })
    .sort((a, b) => String(b.published_at || b.updated_at || '').localeCompare(String(a.published_at || a.updated_at || '')));

  return filteredByPeriod;
}

function getMapelOptions(materials) {
  return Array.from(new Set(materials.map((item) => String(item.mapel_nama || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'id'));
}

function getMapelCounts(materials) {
  const countMap = new Map();
  materials.forEach((item) => {
    const mapel = String(item.mapel_nama || 'Tanpa Mapel').trim() || 'Tanpa Mapel';
    countMap.set(mapel, (countMap.get(mapel) || 0) + 1);
  });
  return Array.from(countMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'id'))
    .map(([mapel, total]) => ({ mapel, total }));
}

function getMaterialSeed(material) {
  const source = `${material?.id || ''}__${material?.title || ''}__${material?.mapel_nama || ''}`;
  return source.split('').reduce((total, char) => total + char.charCodeAt(0), 0);
}

function getMaterialCardTheme(material, index = 0) {
  const palette = [
    { cover: 'from-sky-500 via-cyan-500 to-blue-600', chip: 'border-sky-200 bg-sky-50 text-sky-700', glow: 'bg-sky-200/50' },
    { cover: 'from-fuchsia-500 via-pink-500 to-rose-500', chip: 'border-pink-200 bg-pink-50 text-pink-700', glow: 'bg-pink-200/50' },
    { cover: 'from-emerald-500 via-teal-500 to-cyan-500', chip: 'border-emerald-200 bg-emerald-50 text-emerald-700', glow: 'bg-emerald-200/50' },
    { cover: 'from-amber-400 via-orange-400 to-rose-500', chip: 'border-amber-200 bg-amber-50 text-amber-700', glow: 'bg-amber-200/50' },
    { cover: 'from-violet-500 via-indigo-500 to-blue-600', chip: 'border-violet-200 bg-violet-50 text-violet-700', glow: 'bg-violet-200/50' },
    { cover: 'from-slate-700 via-slate-800 to-slate-900', chip: 'border-slate-300 bg-slate-100 text-slate-700', glow: 'bg-slate-300/40' },
  ];

  const seed = getMaterialSeed(material) + index;
  return palette[seed % palette.length];
}

function getSubjectCoverMeta(material) {
  const mapel = String(material?.mapel_nama || '').toLowerCase();

  if (mapel.includes('matematika')) {
    return { icon: '∑', motif: 'Rumus & Logika' };
  }
  if (mapel.includes('bahasa indonesia')) {
    return { icon: 'Aa', motif: 'Literasi & Teks' };
  }
  if (mapel.includes('bahasa inggris')) {
    return { icon: 'En', motif: 'Words & Talk' };
  }
  if (mapel.includes('biologi')) {
    return { icon: 'DNA', motif: 'Makhluk Hidup' };
  }
  if (mapel.includes('kimia')) {
    return { icon: 'H2O', motif: 'Zat & Reaksi' };
  }
  if (mapel.includes('fisika')) {
    return { icon: 'Fx', motif: 'Gerak & Energi' };
  }
  if (mapel.includes('sejarah')) {
    return { icon: '⌛', motif: 'Kronologi' };
  }
  if (mapel.includes('geografi')) {
    return { icon: '◔', motif: 'Ruang & Peta' };
  }
  if (mapel.includes('informatika')) {
    return { icon: '</>', motif: 'Logika Digital' };
  }

  return { icon: getMaterialMonogram(material), motif: 'Materi Pilihan' };
}

function getStudentThematicBookCover(material) {
  const mapel = String(material?.mapel_nama || '').toLowerCase();

  if (mapel.includes('matematika')) {
    return { gradient: 'from-sky-600 via-cyan-600 to-blue-700', chip: 'border-sky-200 bg-sky-50 text-sky-700' };
  }
  if (mapel.includes('bahasa indonesia')) {
    return { gradient: 'from-rose-500 via-orange-500 to-amber-500', chip: 'border-orange-200 bg-orange-50 text-orange-700' };
  }
  if (mapel.includes('bahasa inggris')) {
    return { gradient: 'from-indigo-600 via-violet-600 to-fuchsia-600', chip: 'border-violet-200 bg-violet-50 text-violet-700' };
  }
  if (mapel.includes('fisika')) {
    return { gradient: 'from-slate-700 via-slate-800 to-slate-900', chip: 'border-slate-300 bg-slate-100 text-slate-700' };
  }
  if (mapel.includes('kimia')) {
    return { gradient: 'from-emerald-600 via-teal-600 to-cyan-600', chip: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
  }
  if (mapel.includes('biologi')) {
    return { gradient: 'from-lime-500 via-emerald-500 to-teal-600', chip: 'border-lime-200 bg-lime-50 text-lime-700' };
  }
  if (mapel.includes('sejarah')) {
    return { gradient: 'from-amber-600 via-orange-600 to-rose-700', chip: 'border-amber-200 bg-amber-50 text-amber-700' };
  }

  return { gradient: 'from-blue-600 via-indigo-600 to-violet-700', chip: 'border-indigo-200 bg-indigo-50 text-indigo-700' };
}

function readLocalMaterialReads() {
  try {
    return JSON.parse(localStorage.getItem(MATERIAL_READS_KEY) || '[]');
  } catch {
    return [];
  }
}

function getMaterialVisualStatus(material, studentId, readMap) {
  const read = readMap.get(`${String(material?.id || '').trim()}__${String(studentId || '').trim()}`);

  if (read?.completed_at || read?.completion_status === 'completed') {
    return {
      label: 'Sudah Dibaca',
      badgeClass: 'border-emerald-200/40 bg-emerald-500/25 text-emerald-50',
    };
  }

  if (Number(read?.read_count || 0) > 0 || read?.last_read_at) {
    return {
      label: 'Sudah Dibaca',
      badgeClass: 'border-emerald-200/40 bg-emerald-500/25 text-emerald-50',
    };
  }

  return {
    label: 'Belum Dibaca',
    badgeClass: 'border-amber-200/40 bg-amber-500/20 text-amber-50',
  };
}

function getMaterialMonogram(material) {
  const source = String(material?.mapel_nama || material?.title || 'MT').trim();
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'MT';
}

function buildBookIcon() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-6 w-6 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 4.5h10a2 2 0 0 1 2 2v12.5H8a2 2 0 0 0-2 2V4.5z" />
      <path d="M8 19h10" />
      <path d="M8.5 8h6" />
      <path d="M8.5 11h4.5" />
    </svg>
  `;
}

function getReaderOverlayMarkup() {
  return `
    <section id="student-material-reader-overlay" class="fixed inset-0 z-[120] hidden bg-slate-950/75 backdrop-blur-sm">
      <div class="flex h-[100dvh] w-full flex-col bg-white">
        <div class="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6" style="padding-top: calc(0.75rem + env(safe-area-inset-top));">
          <div class="min-w-0">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Mode Fokus Penuh</p>
            <p id="student-material-reader-title" class="mt-1 truncate text-base font-semibold text-slate-900">Materi</p>
          </div>
          <div class="flex items-center gap-2">
            <button id="student-material-complete-btn" type="button" class="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-4 w-4 stroke-current" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span>Tandai Selesai</span>
            </button>
            <button id="student-material-back-btn" type="button" class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-4 w-4 stroke-current" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              <span>Kembali</span>
            </button>
          </div>
        </div>
        <iframe id="student-material-reader-frame" title="Materi siswa layar penuh" sandbox="allow-scripts allow-modals" class="min-h-0 flex-1 w-full bg-white" style="padding-bottom: env(safe-area-inset-bottom);"></iframe>
      </div>
    </section>
  `;
}

export async function renderSiswaMateriPage(container) {
  const context = getStoredContext();
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const userName = session?.user?.nama || 'Siswa';
  const student = getCurrentStudent(session, context);
  const materials = await getStudentMaterials(session, context);
  const mapelOptions = getMapelOptions(materials);
  const mapelCounts = getMapelCounts(materials);
  const classLabel = student?.kelas_nama || student?.kelas_id || '-';
  const hour = new Date().getHours();
  const libraryHeroTheme = hour < 12
    ? {
        panel: 'from-sky-500 via-cyan-500 to-emerald-400',
        eyebrow: 'text-cyan-100/90',
        chip: 'border-white/18 bg-white/12 text-white/90',
        glowA: 'bg-white/18',
        glowB: 'bg-cyan-200/20',
        badge: 'Pagi Cerah',
        icon: '☀',
        art: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3"/>'
      }
    : hour < 15
      ? {
          panel: 'from-amber-400 via-orange-400 to-rose-400',
          eyebrow: 'text-amber-100/90',
          chip: 'border-white/18 bg-white/12 text-white/90',
          glowA: 'bg-white/16',
          glowB: 'bg-amber-200/20',
          badge: 'Siang Aktif',
          icon: '✦',
          art: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/>'
        }
      : hour < 18
        ? {
            panel: 'from-violet-500 via-fuchsia-500 to-orange-400',
            eyebrow: 'text-orange-100/90',
            chip: 'border-white/18 bg-white/12 text-white/90',
            glowA: 'bg-white/14',
            glowB: 'bg-orange-200/20',
            badge: 'Sore Hangat',
            icon: '◔',
            art: '<path d="M4 15c2.5-4.8 5.8-7.2 10-7.2 2.4 0 4.3.6 6 1.8-1.4 5-5.2 8.4-10 8.4-2.1 0-4.1-1-6-3z"/><path d="M13 5.5c1.3.5 2.3 1.6 2.7 3"/>'
          }
        : {
            panel: 'from-slate-900 via-indigo-900 to-blue-950',
            eyebrow: 'text-indigo-100/90',
            chip: 'border-white/14 bg-white/10 text-white/88',
            glowA: 'bg-white/10',
            glowB: 'bg-indigo-300/16',
            badge: 'Malam Tenang',
            icon: '☾',
            art: '<path d="M18.5 14.5A6.5 6.5 0 0 1 9.5 5.5 7.5 7.5 0 1 0 18.5 14.5Z"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="4.5" r="0.8" fill="currentColor" stroke="none"/>'
          };

  const html = renderLayout('Materi Siswa', `
    <div class="space-y-5">
      <section class="relative overflow-hidden rounded-[28px] border border-white/20 bg-gradient-to-br ${libraryHeroTheme.panel} p-4 text-white shadow-[0_24px_70px_-42px_rgba(37,99,235,0.32)] sm:p-5">
        <div class="absolute -right-6 -top-6 h-20 w-20 rounded-full ${libraryHeroTheme.glowA} blur-2xl"></div>
        <div class="absolute bottom-0 left-1/3 h-16 w-16 rounded-full ${libraryHeroTheme.glowB} blur-2xl"></div>
        <div class="absolute right-4 top-4 hidden h-20 w-20 items-center justify-center rounded-[22px] border border-white/18 bg-white/10 backdrop-blur-sm sm:flex">
          <svg viewBox="0 0 24 24" class="h-10 w-10 stroke-current text-white/90" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${libraryHeroTheme.art}</svg>
        </div>
        <div class="relative">
          <div class="min-w-0 sm:pr-28">
            <p class="text-[11px] font-semibold uppercase tracking-[0.24em] ${libraryHeroTheme.eyebrow}">Perpustakaan Digital</p>
            <h1 class="mt-1 text-xl font-semibold leading-tight text-white sm:text-2xl">Perpustakaan ${userName}</h1>
            <div class="mt-3 flex flex-wrap gap-2">
              <span class="rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] backdrop-blur-sm ${libraryHeroTheme.chip}">${classLabel}</span>
              <span class="rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] backdrop-blur-sm ${libraryHeroTheme.chip}">${materials.length} materi</span>
              <span class="rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] backdrop-blur-sm ${libraryHeroTheme.chip}">${libraryHeroTheme.icon} ${libraryHeroTheme.badge}</span>
            </div>
          </div>
        </div>
      </section>

      <section class="rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.18)] sm:p-5">
        <div class="mb-4 space-y-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Koleksi</p>
              <h2 class="mt-1 text-lg font-semibold text-slate-900">Daftar Materi</h2>
            </div>
            <span class="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">Ringkas</span>
          </div>

          <div id="student-material-mapel-badges" class="flex flex-wrap gap-2">
            ${mapelCounts.length
    ? mapelCounts.map((item) => `
                  <span class="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">
                    <span>${item.mapel}</span>
                    <span class="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-700">${item.total}</span>
                  </span>
                `).join('')
    : '<span class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500">Belum ada materi per mapel</span>'}
          </div>

          <div class="grid gap-3 sm:grid-cols-[0.85fr_1.15fr]">
            <div>
              <label class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Filter Mapel</label>
              <select id="student-material-mapel-filter" class="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100">
                <option value="">Semua mapel</option>
                ${mapelOptions.map((mapel) => `<option value="${mapel}">${mapel}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Cari Judul</label>
              <input id="student-material-title-filter" class="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100" placeholder="Ketik judul materi..." />
            </div>
          </div>
        </div>

        <style>
          @keyframes studentShelfItemIn {
            from { opacity: 0; transform: translateY(10px) scale(0.985); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
        </style>
        <div class="relative mx-auto w-full max-w-[1280px] overflow-hidden rounded-[22px] border border-slate-200/80 bg-gradient-to-b from-slate-50 via-white to-slate-100 px-2 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:px-3 sm:py-4">
          <div class="pointer-events-none absolute inset-x-0 top-0 h-full opacity-60">
            <div class="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(120,53,15,0.04)_0px,rgba(120,53,15,0.04)_1px,transparent_1px,transparent_12px)]"></div>
            <div class="absolute inset-0 bg-[radial-gradient(circle_at_12%_22%,rgba(146,64,14,0.08),transparent_28%),radial-gradient(circle_at_84%_68%,rgba(120,53,15,0.08),transparent_28%)]"></div>
            <div class="absolute left-0 right-0 top-[28%] h-[10px] bg-gradient-to-r from-amber-800/15 via-amber-700/25 to-amber-800/15"></div>
            <div class="absolute left-0 right-0 top-[58%] h-[10px] bg-gradient-to-r from-amber-800/15 via-amber-700/25 to-amber-800/15"></div>
            <div class="absolute left-0 right-0 bottom-[10%] h-[10px] bg-gradient-to-r from-amber-800/15 via-amber-700/25 to-amber-800/15"></div>
          </div>
          <div id="student-material-list" class="relative z-[1] mx-auto grid w-full grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-2.5 xl:grid-cols-6"></div>
        </div>
      </section>

    </div>
  `);

  container.innerHTML = html;

  const existingOverlay = document.getElementById('student-material-reader-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }
  document.body.insertAdjacentHTML('beforeend', getReaderOverlayMarkup());

  const listEl = container.querySelector('#student-material-list');
  const overlayEl = document.getElementById('student-material-reader-overlay');
  const readerFrameEl = document.getElementById('student-material-reader-frame');
  const readerTitleEl = document.getElementById('student-material-reader-title');
  const backBtn = document.getElementById('student-material-back-btn');
  const completeBtn = document.getElementById('student-material-complete-btn');
  const mapelFilterEl = container.querySelector('#student-material-mapel-filter');
  const titleFilterEl = container.querySelector('#student-material-title-filter');
  const badgeEl = container.querySelector('#student-material-mapel-badges');

  let filteredMaterials = [...materials];
  let activeReadSession = null;
  let readMap = new Map();

  function getCurrentStudentId() {
    return student?.username || student?.id || session?.user?.username || session?.user?.id || '';
  }

  function refreshReadMap() {
    const currentStudentId = String(getCurrentStudentId() || '').trim();
    const normalizedStudentId = normalizeClassToken(currentStudentId);
    readMap = new Map(
      readLocalMaterialReads()
        .filter((item) => normalizeClassToken(item?.siswa_id) === normalizedStudentId)
        .map((item) => [`${String(item.material_id || '').trim()}__${String(item.siswa_id || '').trim()}`, item])
    );
  }

  function buildReadPayload(material) {
    return {
      material_id: material.id,
      material_title: material.title || 'Tanpa judul',
      siswa_id: getCurrentStudentId(),
      siswa_nama: student?.nama || student?.siswa_nama || session?.user?.nama || 'Siswa',
      kelas_id: student?.kelas_id || material.kelas_id || '',
      kelas_nama: student?.kelas_nama || material.kelas_nama || '',
      guru_id: material.guru_id || '',
      guru_nama: material.guru_nama || '',
      mapel_nama: material.mapel_nama || '',
      tahun_ajaran_id: material.tahun_ajaran_id || context.tahun_ajaran_aktif || '',
      semester_id: material.semester_id || context.semester_aktif || '',
    };
  }

  function getSessionDurationSeconds() {
    if (!activeReadSession?.openedAt) {
      return 0;
    }
    return Math.max(0, Math.round((Date.now() - activeReadSession.openedAt) / 1000));
  }

  async function finalizeReadSession(markCompleted = false) {
    if (!activeReadSession?.material || activeReadSession.isClosing) {
      return null;
    }

    const payload = {
      ...buildReadPayload(activeReadSession.material),
      event_type: markCompleted ? 'complete' : 'close',
      duration_seconds: getSessionDurationSeconds(),
      completed: markCompleted,
      increment_read_count: false,
    };

    activeReadSession.isClosing = true;
    return recordMaterialRead(payload).then((result) => {
      refreshReadMap();
      renderMaterialList();
      return result;
    }).catch((error) => {
      console.warn('Gagal menyimpan progress baca materi siswa:', error);
      return null;
    });
  }

  function closeReaderOverlay() {
    finalizeReadSession(false);
    overlayEl.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    activeReadSession = null;
  }

  function openMaterial(material) {
    readerFrameEl.srcdoc = material.html_source || '';
    readerTitleEl.textContent = material.title || 'Tanpa judul';
    overlayEl.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');

    const studentId = getCurrentStudentId();
    if (studentId) {
      activeReadSession = {
        material,
        openedAt: Date.now(),
        isClosing: false,
      };

      recordMaterialRead({
        ...buildReadPayload(material),
        event_type: 'open',
        duration_seconds: 0,
        completed: false,
        increment_read_count: true,
      }).then(() => {
        refreshReadMap();
        renderMaterialList();
      }).catch((error) => {
        console.warn('Gagal mencatat baca materi siswa:', error);
      });
    }
  }

  function renderMapelBadges(activeMaterials) {
    const activeCounts = getMapelCounts(activeMaterials);
    badgeEl.innerHTML = activeCounts.length
      ? activeCounts.map((item) => `
          <span class="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">
            <span>${item.mapel}</span>
            <span class="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-700">${item.total}</span>
          </span>
        `).join('')
      : '<span class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500">Tidak ada materi pada filter aktif</span>';
  }

  function getFilteredMaterials() {
    const selectedMapel = String(mapelFilterEl?.value || '').trim().toLowerCase();
    const titleKeyword = String(titleFilterEl?.value || '').trim().toLowerCase();

    return materials.filter((material) => {
      const matchesMapel = !selectedMapel || String(material.mapel_nama || '').trim().toLowerCase() === selectedMapel;
      const matchesTitle = !titleKeyword || String(material.title || '').toLowerCase().includes(titleKeyword);
      return matchesMapel && matchesTitle;
    });
  }

  function renderMaterialList() {
    refreshReadMap();
    filteredMaterials = getFilteredMaterials();
    renderMapelBadges(filteredMaterials);

    if (!filteredMaterials.length) {
      listEl.innerHTML = '<div class="col-span-full rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Tidak ada materi yang cocok dengan filter mapel dan judul saat ini.</div>';
      closeReaderOverlay();
      return;
    }

    listEl.innerHTML = filteredMaterials
      .map((material, index) => {
        const coverTheme = getStudentThematicBookCover(material);
        const status = getMaterialVisualStatus(material, getCurrentStudentId(), readMap);
        const chapterTitle = String(material.chapter || material.title || 'Bab Materi').trim();
        const mapelTitle = String(material.mapel_nama || 'Mata Pelajaran').trim();
        const publishDate = new Date(material.published_at || material.updated_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        const staggerDelay = Math.min(index, 11) * 42;
        return `
          <button type="button" data-material-id="${material.id}" class="student-material-item group block h-full w-full text-left transition hover:-translate-y-0.5" style="animation: studentShelfItemIn 420ms cubic-bezier(.2,.7,.2,1) both; animation-delay: ${staggerDelay}ms;">
            <article class="relative flex min-h-[214px] flex-col overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br ${coverTheme.gradient} text-white shadow-[0_18px_32px_-20px_rgba(15,23,42,0.6)] transition duration-300 group-hover:shadow-[0_26px_42px_-20px_rgba(15,23,42,0.62)]" style="aspect-ratio: 3/5.1;">
              <div class="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_14%_10%,rgba(255,255,255,0.28),transparent_42%)]"></div>
              <span class="absolute right-2 top-2 z-[2] inline-flex items-center rounded-full border px-2.5 py-1 text-[8px] font-bold uppercase tracking-wider backdrop-blur-[2px] ${status.badgeClass}">${status.label}</span>
              <div class="relative flex flex-1 flex-col p-3">
                <div class="relative flex h-full flex-col overflow-hidden rounded-xl border border-white/18 bg-black/18 px-3 pb-2.5 pt-9 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
                  <div class="absolute left-0 top-0 h-full w-2 bg-black/26"></div>
                  <div class="absolute left-1.5 top-0 h-full w-[1px] bg-white/20"></div>
                  <div class="absolute -right-4 -top-4 h-12 w-12 rounded-full bg-white/15 blur-xl"></div>
                  <div class="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.14)_0%,transparent_38%,transparent_62%,rgba(255,255,255,0.08)_100%)]"></div>
                  <div class="relative z-[1] text-center">
                    <p class="line-clamp-2 whitespace-normal break-words text-[10px] font-extrabold uppercase leading-tight tracking-[0.12em] text-white/95">${mapelTitle}</p>
                  </div>
                  <div class="relative z-[1] mt-2 flex flex-1 items-center justify-center px-1">
                    <h3 class="line-clamp-5 max-h-[7.4rem] overflow-hidden whitespace-normal break-words text-center text-[14px] font-black leading-[1.2] text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]">${chapterTitle}</h3>
                  </div>
                </div>
                <div class="pointer-events-none absolute bottom-3 left-3 right-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.14em] text-white/96">
                  <span class="inline-flex items-center gap-1">Buka <svg class="h-3 w-3 transition-transform duration-300 group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>
                  <span class="flex flex-col items-end gap-1">
                    <span class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/35 bg-black/20 text-[10px] font-black">${getMaterialMonogram(material)}</span>
                    <span class="text-[9px] font-medium normal-case tracking-normal text-right text-white/80">${publishDate}</span>
                  </span>
                </div>
              </div>
            </article>
          </button>
        `;
      })
      .join('');

    listEl.querySelectorAll('.student-material-item').forEach((button) => {
      button.addEventListener('click', () => {
        const material = filteredMaterials.find((item) => item.id === button.getAttribute('data-material-id'));
        if (material) {
          openMaterial(material);
        }
      });
    });
  }

  if (!materials.length) {
    listEl.innerHTML = '<div class="col-span-full rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Belum ada materi yang dipublikasikan untuk kelas Anda.</div>';
    closeReaderOverlay();
    return;
  }

  mapelFilterEl?.addEventListener('change', () => {
    renderMaterialList();
  });

  titleFilterEl?.addEventListener('input', () => {
    renderMaterialList();
  });

  backBtn?.addEventListener('click', closeReaderOverlay);
  completeBtn?.addEventListener('click', () => {
    finalizeReadSession(true);
    overlayEl.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    activeReadSession = null;
  });

  renderMaterialList();
}
