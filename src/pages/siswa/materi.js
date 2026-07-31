import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getCoverDesign, renderCoverHtml, coverStyles } from '../../utils/materi-cover.js';
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
  const user = session?.user || {};
  return {
    ...user,
    username: user.username || getSessionUserKeys(session, context)[0] || '',
  };
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

async function getStudentMaterials(session, context, options = {}) {
  const student = getCurrentStudent(session, context);
  if (!student) {
    return [];
  }

  const studentClassId = student?.kelas_id || '';
  const studentClassName = student?.kelas_nama || '';
  if (!studentClassId && !studentClassName) {
    return [];
  }

  const forceRefresh = Boolean(options.forceRefresh);
  const [publishedMaterials, activeAssignments] = await Promise.all([
    getPublishedMaterials({
      kelasId: studentClassId,
      kelasNama: studentClassName,
      tahunAjaranId: context?.tahun_ajaran_aktif,
      semesterId: context?.semester_aktif,
      forceRefresh,
    }),
    getActiveTeachingAssignments(context, { forceRefresh }),
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
      // Struktur baru: kelas_ids berisi token semua kelas tujuan.
      // Struktur lama: satu dokumen per kelas (kelas_id/kelas_nama/kelas_token).
      const itemClassTokens = Array.isArray(item.kelas_ids) && item.kelas_ids.length
        ? item.kelas_ids.map((value) => normalizeClassToken(value))
        : [
          normalizeClassToken(item.kelas_id),
          normalizeClassToken(item.kelas_nama),
          normalizeClassToken(item.kelas_token),
        ];
      if (!itemClassTokens.some((token) => token && studentClassTokens.has(token))) {
        return false;
      }

      // Relasi mengajar wajib aktif untuk kelas siswa ini.
      const assignmentIds = Array.isArray(item.pengajaran_ids) && item.pengajaran_ids.length
        ? item.pengajaran_ids.map((value) => String(value).trim()).filter(Boolean)
        : [String(item.pengajaran_id || '').trim()].filter(Boolean);
      if (!assignmentIds.length || !allowedAssignmentIds.size) {
        return false;
      }

      return assignmentIds.some((assignmentId) => allowedAssignmentIds.has(assignmentId));
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



function escapeAttr(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function siswaLibraryStyles() {
  return `
    ${coverStyles()}
    .sml { --ios-blue:#0a84ff; --ios-label:#1c1c1e; --ios-secondary:#6e6e73; padding:2px 0 20px; color:var(--ios-label); }
    .sml * { box-sizing:border-box; }
    .sml [hidden] { display:none !important; }
    .sml-hero { position:relative; overflow:hidden; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:20px; min-height:150px; padding:24px; border-radius:26px; color:#fff; background:linear-gradient(125deg,#1c1c1e 0%,#2c2c2e 42%,#0a84ff 120%); box-shadow:0 25px 60px -36px rgba(15,23,42,.7); }
    .sml-hero::before,.sml-hero::after { content:''; position:absolute; border-radius:999px; filter:blur(2px); pointer-events:none; }
    .sml-hero::before { width:240px; height:240px; right:-60px; top:-95px; background:rgba(94,92,230,.42); }
    .sml-hero::after { width:180px; height:180px; right:110px; bottom:-120px; background:rgba(48,176,199,.28); }
    .sml-hero-copy,.sml-hero-art { position:relative; z-index:1; }
    .sml-kicker { display:flex; align-items:center; gap:8px; margin:0 0 10px; color:rgba(255,255,255,.68); font-size:10px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; }
    .sml-kicker span { width:26px; height:26px; display:inline-flex; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,.2); border-radius:8px; background:rgba(255,255,255,.1); font-size:13px; }
    .sml-hero h1 { max-width:520px; margin:0; font-size:clamp(1.3rem,3vw,1.9rem); line-height:1.06; letter-spacing:-.04em; }
    .sml-hero-stats { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
    .sml-stat { display:inline-flex; align-items:center; gap:6px; padding:6px 11px; border:1px solid rgba(255,255,255,.14); border-radius:999px; background:rgba(255,255,255,.1); color:rgba(255,255,255,.9); font-size:10px; font-weight:750; backdrop-filter:blur(12px); }
    .sml-hero-art { display:flex; align-items:center; justify-content:center; width:140px; }
    .sml-stack { position:relative; width:98px; height:132px; transform:rotate(5deg); }
    .sml-stack span { position:absolute; inset:0; border-radius:9px 15px 15px 9px; border:1px solid rgba(255,255,255,.28); box-shadow:0 22px 34px -18px rgba(0,0,0,.7); }
    .sml-stack span:nth-child(1) { transform:translate(-28px,13px) rotate(-13deg); background:linear-gradient(145deg,#ff375f,#ff9f0a); }
    .sml-stack span:nth-child(2) { transform:translate(-12px,5px) rotate(-5deg); background:linear-gradient(145deg,#30b0c7,#34c759); }
    .sml-stack span:nth-child(3) { display:flex; align-items:center; justify-content:center; background:linear-gradient(145deg,#0a84ff,#5e5ce6); font-size:32px; font-weight:800; color:#fff; }
    .sml-library { margin-top:16px; padding:18px; border:1px solid rgba(209,209,214,.72); border-radius:26px; background:rgba(255,255,255,.86); box-shadow:0 22px 50px -38px rgba(0,0,0,.32); backdrop-filter:blur(22px) saturate(1.25); }
    .sml-library-head { display:flex; align-items:flex-end; justify-content:space-between; gap:14px; margin-bottom:14px; flex-wrap:wrap; }
    .sml-eyebrow { margin:0; color:var(--ios-blue); font-size:10px; font-weight:850; letter-spacing:.14em; text-transform:uppercase; }
    .sml-library-head h2 { margin:3px 0 0; color:var(--ios-label); font-size:20px; letter-spacing:-.03em; }
    .sml-library-head p.sml-sub { margin:3px 0 0; color:var(--ios-secondary); font-size:11px; }
    .sml-tools { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .sml-search { position:relative; min-width:180px; }
    .sml-search svg { position:absolute; left:11px; top:50%; width:14px; height:14px; color:#8e8e93; transform:translateY(-50%); }
    .sml-search input { width:100%; min-height:38px; padding:9px 12px 9px 32px; border:0; border-radius:11px; background:#e9e9eb; color:#1c1c1e; font-size:12px; outline:none; }
    .sml-search input:focus { box-shadow:0 0 0 3px rgba(10,132,255,.2); }
    .sml-select { min-height:38px; padding:9px 12px; border:0; border-radius:11px; background:#e9e9eb; color:#1c1c1e; font-size:12px; font-weight:600; outline:none; cursor:pointer; }
    .sml-select:focus { box-shadow:0 0 0 3px rgba(10,132,255,.2); }
    .sml-badges { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px; }
    .sml-badge { display:inline-flex; align-items:center; gap:6px; padding:5px 10px; border:1px solid rgba(10,132,255,.18); border-radius:999px; background:rgba(10,132,255,.06); color:#0a6cd6; font-size:11px; font-weight:700; }
    .sml-badge b { background:#fff; border-radius:999px; padding:1px 7px; font-size:10px; color:#1c1c1e; }
    .sml-books { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:22px 16px; }
    @media (max-width:520px) { .sml-books { grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px 12px; } .sml-hero-art { display:none; } .sml-hero { grid-template-columns:1fr; padding:20px; } }
    .sml-book { min-width:0; animation:smlBookIn .42s cubic-bezier(.2,.75,.2,1) both; }
    @keyframes smlBookIn { from { opacity:0; transform:translateY(12px) scale(.97); } to { opacity:1; transform:none; } }
    .sml-book-button { display:block; width:100%; padding:0; border:0; background:transparent; color:inherit; text-align:left; cursor:pointer; }
    .sml-book-button:hover .mc-cover { transform:translateY(-8px) rotate(-1.2deg); box-shadow:-4px 4px 0 rgba(0,0,0,.17), 0 26px 38px -18px rgba(15,23,42,.8); }
    .sml-book-button:focus-visible { outline:3px solid rgba(10,132,255,.35); outline-offset:4px; border-radius:12px; }
    .sml-book-info { padding:10px 3px 0; }
    .sml-book-info strong { display:block; overflow:hidden; color:#1c1c1e; font-size:12px; line-height:1.35; text-overflow:ellipsis; white-space:nowrap; }
    .sml-book-info span { display:block; overflow:hidden; margin-top:3px; color:#8e8e93; font-size:10px; text-overflow:ellipsis; white-space:nowrap; }
    .sml-empty { grid-column:1/-1; padding:46px 20px; border:1px dashed #c7c7cc; border-radius:18px; background:rgba(242,242,247,.72); text-align:center; }
    .sml-empty-icon { display:inline-flex; width:56px; height:56px; align-items:center; justify-content:center; border-radius:16px; background:#fff; color:#0a84ff; font-size:25px; box-shadow:0 10px 24px -16px rgba(0,0,0,.3); }
    .sml-empty h3 { margin:12px 0 4px; font-size:15px; } .sml-empty p { margin:0; color:#8e8e93; font-size:11px; }
  `;
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

export async function renderSiswaMateriPage(container, options = {}) {
  const context = getStoredContext();
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const userName = session?.user?.nama || 'Siswa';
  const student = getCurrentStudent(session, context);
  const materials = await getStudentMaterials(session, context, { forceRefresh: Boolean(options.forceRefresh) });
  const mapelOptions = getMapelOptions(materials);
  const mapelCounts = getMapelCounts(materials);
  const classLabel = student?.kelas_nama || student?.kelas_id || '-';
  const firstName = String(userName || 'Siswa').split(/\s+/)[0];

  const html = renderLayout('Materi Siswa', `
    <style>${siswaLibraryStyles()}</style>
    <div class="sml">
      <section class="sml-hero">
        <div class="sml-hero-copy">
          <p class="sml-kicker"><span>▤</span> Perpustakaan Digital</p>
          <h1>Halo, ${escapeAttr(firstName)}.</h1>
          <div class="sml-hero-stats">
            <span class="sml-stat">${escapeAttr(classLabel)}</span>
            <span class="sml-stat">${materials.length} materi</span>
            <span class="sml-stat" id="sml-read-stat">0 dibaca</span>
          </div>
        </div>
        <div class="sml-hero-art" aria-hidden="true"><div class="sml-stack"><span></span><span></span><span>▤</span></div></div>
      </section>

      <section class="sml-library">
        <div class="sml-library-head">
          <div>
            <p class="sml-eyebrow">Koleksi Saya</p>
            <h2>Semua Materi</h2>
            <p class="sml-sub" id="sml-count">${materials.length} materi tersedia.</p>
          </div>
          <div class="sml-tools">
            <label class="sml-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
              <input id="student-material-title-filter" type="search" placeholder="Cari judul materi" aria-label="Cari materi" />
            </label>
            <select id="student-material-mapel-filter" class="sml-select" aria-label="Filter mapel">
              <option value="">Semua mapel</option>
              ${mapelOptions.map((mapel) => `<option value="${escapeAttr(mapel)}">${escapeAttr(mapel)}</option>`).join('')}
            </select>
            <button id="student-material-refresh" type="button" class="sml-select" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;" aria-label="Muat ulang materi terbaru" title="Muat ulang materi terbaru">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path></svg>
              <span>Muat ulang</span>
            </button>
          </div>
        </div>

        <div id="student-material-mapel-badges" class="sml-badges">
          ${mapelCounts.length
    ? mapelCounts.map((item) => `<span class="sml-badge"><span>${escapeAttr(item.mapel)}</span><b>${item.total}</b></span>`).join('')
    : '<span class="sml-badge" style="border-color:#e2e8f0;background:#f8fafc;color:#94a3b8">Belum ada materi per mapel</span>'}
        </div>

        <div id="student-material-list" class="sml-books"></div>
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
  const refreshBtn = container.querySelector('#student-material-refresh');

  // Muat ulang paksa: ambil materi terbaru dari server (lewati cache) lalu render
  // ulang halaman. Ini cara siswa melihat materi yang baru diunggah secara instan.
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      if (refreshBtn.dataset.loading === 'true') return;
      refreshBtn.dataset.loading = 'true';
      refreshBtn.disabled = true;
      const label = refreshBtn.querySelector('span');
      const originalText = label ? label.textContent : '';
      if (label) label.textContent = 'Memuat...';
      try {
        await renderSiswaMateriPage(container, { forceRefresh: true });
      } catch (error) {
        console.warn('Gagal memuat ulang materi:', error);
        refreshBtn.dataset.loading = 'false';
        refreshBtn.disabled = false;
        if (label) label.textContent = originalText || 'Muat ulang';
      }
    });
  }

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
      ? activeCounts.map((item) => `<span class="sml-badge"><span>${item.mapel}</span><b>${item.total}</b></span>`).join('')
      : '<span class="sml-badge" style="border-color:#e2e8f0;background:#f8fafc;color:#94a3b8">Tidak ada materi pada filter aktif</span>';
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
    updateReadStat();

    const countEl = container.querySelector('#sml-count');
    if (countEl) countEl.textContent = `${filteredMaterials.length} dari ${materials.length} materi.`;

    if (!filteredMaterials.length) {
      listEl.innerHTML = '<div class="sml-empty"><span class="sml-empty-icon">⌕</span><h3>Materi tidak ditemukan</h3><p>Coba kata kunci judul atau mapel lain.</p></div>';
      closeReaderOverlay();
      return;
    }

    listEl.innerHTML = filteredMaterials
      .map((material, index) => {
        const design = getCoverDesign(material, index);
        const status = getMaterialVisualStatus(material, getCurrentStudentId(), readMap);
        const isRead = status.label === 'Sudah Dibaca';
        const materialTitle = String(material.title || 'Materi Pembelajaran').trim();
        const mapelTitle = String(material.mapel_nama || 'Mata Pelajaran').trim();
        const guruNama = String(material.guru_nama || '').trim();
        const publishDate = new Date(material.published_at || material.updated_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        const staggerDelay = Math.min(index, 16) * 32;
        const cover = renderCoverHtml({
          design,
          title: materialTitle,
          subject: mapelTitle,
          footer: guruNama || publishDate,
          badgeHtml: `<span class="mc-badge ${isRead ? 'read' : 'unread'}">${isRead ? 'Dibaca' : 'Baru'}</span>`,
        });
        return `
          <article class="sml-book" style="animation-delay:${staggerDelay}ms">
            <button type="button" data-material-id="${escapeAttr(material.id)}" class="student-material-item sml-book-button" aria-label="Buka ${escapeAttr(materialTitle)}">
              ${cover}
              <div class="sml-book-info">
                <strong>${escapeAttr(materialTitle)}</strong>
                <span>${escapeAttr(mapelTitle)}</span>
                <span>${escapeAttr(publishDate)}</span>
              </div>
            </button>
          </article>
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

  function updateReadStat() {
    const statEl = container.querySelector('#sml-read-stat');
    if (!statEl) return;
    const readCount = materials.filter((material) => getMaterialVisualStatus(material, getCurrentStudentId(), readMap).label === 'Sudah Dibaca').length;
    statEl.textContent = `${readCount} dibaca`;
  }

  if (!materials.length) {
    listEl.innerHTML = '<div class="sml-empty"><span class="sml-empty-icon">▤</span><h3>Belum ada materi</h3><p>Materi yang dipublikasikan untuk kelas Anda akan tampil di rak ini.</p></div>';
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
