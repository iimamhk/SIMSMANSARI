import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext, getSessionUserKeys, normalizeUserKey } from '../../utils/helpers.js';
import { getPublishedMaterials, recordMaterialRead } from '../../firebase/data-service.js';

function normalizeClassToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isSameClass(leftValue, rightValue) {
  return normalizeClassToken(leftValue) && normalizeClassToken(leftValue) === normalizeClassToken(rightValue);
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

async function getStudentMaterials(session, context) {
  const student = getCurrentStudent(session, context);
  const studentClassId = student?.kelas_id || '';
  const studentClassName = student?.kelas_nama || '';

  const publishedMaterials = await getPublishedMaterials();

  const filteredByPeriod = publishedMaterials
    .filter((item) => item.visible_to_students !== false)
    .filter((item) => !context.tahun_ajaran_aktif || item.tahun_ajaran_id === context.tahun_ajaran_aktif)
    .filter((item) => !context.semester_aktif || item.semester_id === context.semester_aktif)
    .sort((a, b) => String(b.published_at || b.updated_at || '').localeCompare(String(a.published_at || a.updated_at || '')));

  if (!studentClassId && !studentClassName) {
    return filteredByPeriod;
  }

  const classMatchedMaterials = filteredByPeriod.filter((item) => (
    isSameClass(item.kelas_id, studentClassId)
    || isSameClass(item.kelas_nama, studentClassId)
    || isSameClass(item.kelas_token, studentClassId)
    || isSameClass(item.kelas_id, studentClassName)
    || isSameClass(item.kelas_nama, studentClassName)
    || isSameClass(item.kelas_token, studentClassName)
  ));

  return classMatchedMaterials.length ? classMatchedMaterials : filteredByPeriod;
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

  const html = renderLayout('Materi Siswa', `
    <div class="space-y-5">
      <section class="rounded-[30px] border border-sky-100 bg-gradient-to-br from-white via-sky-50 to-cyan-50 p-5 shadow-[0_24px_70px_-42px_rgba(37,99,235,0.2)]">
        <p class="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">Akses Materi</p>
        <h1 class="mt-2 text-2xl font-semibold text-slate-900">Materi untuk ${userName}</h1>
        <p class="mt-2 text-sm leading-6 text-slate-600">Halaman ini menampilkan materi yang dipublikasikan guru untuk kelas ${student?.kelas_nama || student?.kelas_id || '-'} pada periode aktif ${context.tahun_ajaran_aktif_nama || '-'} / ${context.semester_aktif_nama || '-'}.</p>
      </section>

      <section class="rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.18)] sm:p-5">
        <div class="mb-4 space-y-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="text-lg font-semibold text-slate-900">Daftar Materi</h2>
              <p class="mt-1 text-sm text-slate-500">Klik salah satu materi untuk membukanya dalam mode baca penuh.</p>
            </div>
            <span class="rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">Untuk Siswa</span>
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

        <div id="student-material-list" class="space-y-3"></div>
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

  function getCurrentStudentId() {
    return student?.username || student?.id || session?.user?.username || session?.user?.id || '';
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

  function finalizeReadSession(markCompleted = false) {
    if (!activeReadSession?.material || activeReadSession.isClosing) {
      return;
    }

    const payload = {
      ...buildReadPayload(activeReadSession.material),
      event_type: markCompleted ? 'complete' : 'close',
      duration_seconds: getSessionDurationSeconds(),
      completed: markCompleted,
      increment_read_count: false,
    };

    activeReadSession.isClosing = true;
    recordMaterialRead(payload).catch((error) => {
      console.warn('Gagal menyimpan progress baca materi siswa:', error);
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
    filteredMaterials = getFilteredMaterials();
    renderMapelBadges(filteredMaterials);

    if (!filteredMaterials.length) {
      listEl.innerHTML = '<div class="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Tidak ada materi yang cocok dengan filter mapel dan judul saat ini.</div>';
      closeReaderOverlay();
      return;
    }

    listEl.innerHTML = filteredMaterials
      .map((material) => `
        <button type="button" data-material-id="${material.id}" class="student-material-item block w-full rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-white">
          <div class="flex items-start gap-3">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
              ${buildBookIcon()}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">${material.mapel_nama || '-'}</span>
                <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">${material.kelas_nama || '-'}</span>
              </div>
              <p class="mt-3 truncate text-base font-semibold text-slate-900">${material.title || 'Tanpa judul'}</p>
              <p class="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">${material.note || 'Materi siap dibaca siswa.'}</p>
              <p class="mt-3 text-xs text-slate-400">Dipublikasikan ${new Date(material.published_at || material.updated_at).toLocaleString('id-ID')}</p>
            </div>
          </div>
        </button>
      `)
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
    listEl.innerHTML = '<div class="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Belum ada materi yang dipublikasikan untuk kelas Anda.</div>';
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
