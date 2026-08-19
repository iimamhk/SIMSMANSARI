import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import { getTeachingAssignmentsForUser, getActiveTeachingAssignments, getDocumentsWhere, saveDocument } from '../../firebase/data-service.js';
import { getOperationCatalog, quizTypes, normalizeGameSettings, generateMathQuestions } from '../../utils/math-game.js';
import { getVocabularyThemeCatalog, getVocabularyThemeLabel, getVocabularyThemeOptions, vocabularyQuizTypes, normalizeVocabularySettings, getVocabularyWordList, generateVocabularyQuestions } from '../../utils/vocab-game.js';

const LOCAL_CONFIG_KEY = 'simguru_game_configs_local';
const LOCAL_SESSION_KEY = 'simguru_game_sessions_local';
const VOCAB_TEMPLATE_FILE_NAME = 'template-english-vocabulary.xlsx';
const BATTLE_ROOM_LOCAL_KEY = 'simguru_battle_rooms_local';

function getBattleRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function readLocalList(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function saveLocalList(key, list) {
  localStorage.setItem(key, JSON.stringify(list));
}

function upsertLocalById(key, payload) {
  const list = readLocalList(key);
  const index = list.findIndex((item) => item.id === payload.id);
  if (index >= 0) {
    list[index] = payload;
  } else {
    list.push(payload);
  }
  saveLocalList(key, list);
}

function getQuizTypeLabel(type) {
  return quizTypes[type] || type;
}

function getOperationLabel(operation) {
  return getOperationCatalog()[operation]?.label || operation;
}

function getVocabularyQuizTypeLabel(type) {
  return vocabularyQuizTypes[type] || type;
}

function slugifyText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getSessionTimestamp(session) {
  const source = session.finished_at || session.updated_at || session.started_at || '';
  const timestamp = new Date(source).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getWeekStart(date = new Date()) {
  const result = new Date(date);
  const day = result.getDay() || 7;
  if (day !== 1) {
    result.setHours(-24 * (day - 1));
  }
  result.setHours(0, 0, 0, 0);
  return result;
}

export async function renderGuruGamePage(container) {
  const context = getStoredContext();
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const userId = session?.user?.username || '';

  const assignments = userId
    ? await getTeachingAssignmentsForUser(context, userId)
    : await getActiveTeachingAssignments(context);
  const selectedAssignment = assignments[0] || null;
  const classOptions = assignments.reduce((result, item) => {
    if (!item?.kelas_id) {
      return result;
    }
    if (!result.some((entry) => entry.id === item.kelas_id)) {
      result.push({ id: item.kelas_id, name: item.kelas_nama || item.kelas_id });
    }
    return result;
  }, []);
  const classFilterOptions = [
    '<option value="all">Semua Kelas</option>',
    ...classOptions.map((item) => `<option value="${item.id}">${item.name}</option>`),
  ].join('');
  const availableGameCount = 3;
  const gameCatalog = [
    {
      key: 'math',
      title: 'Matematika Cepat',
      description: 'Atur operasi, token kelas, dan pantau hasil siswa.',
      cardHint: 'Hitung cepat, token, monitoring.',
      status: 'Aktif',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      cardBadgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      accentClass: 'from-emerald-500 to-cyan-500',
      tileClass: 'from-emerald-500 via-teal-500 to-cyan-500',
      iconGlyph: '∑',
      accessTag: 'Token Guru',
      workspaceTitle: 'Workspace Game Matematika',
      workspaceCaption: 'Kelola konfigurasi, akses siswa, dan monitoring hasil tanpa meninggalkan satu halaman kerja.',
      available: true,
    },
    {
      key: 'english_vocab',
      title: 'English Vocabulary',
      description: 'Atur tema kosakata, publish, dan pantau hasil kelas.',
      cardHint: 'Kuis kosakata berdasarkan tema.',
      status: 'Aktif',
      badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
      cardBadgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
      accentClass: 'from-sky-500 to-blue-500',
      tileClass: 'from-fuchsia-500 via-violet-500 to-indigo-500',
      iconGlyph: 'Aa',
      accessTag: 'Tanpa Token',
      workspaceTitle: 'Workspace English Vocabulary',
      workspaceCaption: 'Atur tema kosakata, mode latihan, publish langsung ke siswa, dan pantau hasil kelas tanpa token.',
      available: true,
    },
    {
      key: 'matching',
      title: 'Matching Quiz',
      description: 'Pasangan istilah, definisi, gambar, atau rumus lintas mapel.',
      cardHint: 'Pasangkan konsep dengan cepat.',
      status: 'Roadmap',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
      cardBadgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
      accentClass: 'from-amber-500 to-orange-500',
      tileClass: 'from-amber-500 via-orange-500 to-rose-500',
      iconGlyph: '⟷',
      accessTag: 'Segera',
      workspaceTitle: 'Matching Quiz',
      workspaceCaption: 'Cocok untuk Bahasa Indonesia, Inggris, IPA, dan hafalan konsep.',
      available: false,
      bullets: ['Bank pasangan per mapel dan bab', 'Mode latihan dan turnamen kelas', 'Skor berdasarkan kecepatan dan akurasi'],
    },
    {
      key: 'battle',
      title: 'Quiz Battle Kelas',
      description: 'Battle kuis satu kelas dengan room, timer, dan leaderboard langsung.',
      cardHint: 'Kompetisi kelas real-time.',
      status: 'Aktif',
      badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
      cardBadgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
      accentClass: 'from-violet-500 to-fuchsia-500',
      tileClass: 'from-violet-500 via-fuchsia-500 to-pink-500',
      iconGlyph: '⚡',
      accessTag: 'Kode Room',
      workspaceTitle: 'Quiz Battle Kelas',
      workspaceCaption: 'Model kompetisi ringan yang kuat untuk memacu motivasi belajar siswa.',
      available: true,
      bullets: ['10 soal pilihan ganda', 'Timer per soal dan skor kecepatan', 'Leaderboard dan pembahasan akhir'],
    },
    {
      key: 'daily',
      title: 'Mission Harian',
      description: 'Tantangan singkat untuk kebiasaan belajar konsisten.',
      cardHint: 'Target harian dan streak.',
      status: 'Roadmap',
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
      cardBadgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
      accentClass: 'from-slate-500 to-slate-700',
      tileClass: 'from-slate-600 via-slate-700 to-slate-900',
      iconGlyph: '★',
      accessTag: 'Segera',
      workspaceTitle: 'Mission Harian',
      workspaceCaption: 'Ideal untuk target kecil yang berulang dan mudah dimonitor guru.',
      available: false,
      bullets: ['Target harian per mapel', 'Streak dan badge pencapaian', 'Monitoring kepatuhan siswa per kelas'],
    },
  ];

  const options = assignments
    .map((item) => `<option value="${item.id}">${item.kelas_nama || '-'} • ${item.mapel_nama || '-'}</option>`)
    .join('');

  const activeGames = gameCatalog.filter((game) => game.available);
  const roadmapGames = gameCatalog.filter((game) => !game.available);

  const html = renderLayout('Game Center Guru', `
    <div class="space-y-6">
      <section id="game-hero" class="overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-900 via-emerald-900 to-cyan-800 p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div class="grid gap-5 xl:grid-cols-[1.2fr_0.8fr] xl:items-start">
          <div class="space-y-4">
            <p class="text-xs font-semibold uppercase tracking-[0.26em] text-emerald-100">Game Center Guru</p>
            <div>
              <h2 class="text-3xl font-semibold tracking-tight">Pilih game dan mulai kelola</h2>
              <p class="mt-3 max-w-2xl text-sm leading-6 text-emerald-50/85">Semua game kelas aktif tersedia di satu tempat.</p>
            </div>
          </div>
          <div class="grid gap-3 sm:grid-cols-3 xl:grid-cols-2">
            <div class="rounded-[28px] border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
              <p class="text-xs uppercase tracking-[0.18em] text-emerald-100">Game Aktif</p>
              <p class="mt-3 text-xl font-semibold text-white" id="game-summary-available">${availableGameCount}</p>
            </div>
            <div class="rounded-[28px] border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
              <p class="text-xs uppercase tracking-[0.18em] text-emerald-100">Kelas</p>
              <p class="mt-3 text-xl font-semibold text-white" id="game-summary-assignments">${assignments.length}</p>
            </div>
            <div class="rounded-[28px] border border-white/10 bg-white/10 p-4 backdrop-blur-sm xl:col-span-2">
              <p class="text-xs uppercase tracking-[0.18em] text-emerald-100">Sesi Terpilih</p>
              <p class="mt-3 text-xl font-semibold text-white" id="game-summary-sessions">0</p>
            </div>
          </div>
        </div>
      </section>

      <section id="game-catalog-section" class="space-y-4">
        <div id="game-workspace-panel" class="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Kelola Game</p>
              <h3 class="mt-2 text-2xl font-semibold text-slate-900">Pilih game untuk dikonfigurasi</h3>
              <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Atur akses, publish, lalu pantau hasil kelas.</p>
            </div>
            <div class="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Siap dikelola</div>
          </div>
        </div>

        <div id="game-card-grid" class="grid grid-cols-2 gap-4">
          ${activeGames.map((game, index) => `
            <button
              type="button"
              data-game-card="${game.key}"
              class="game-card group relative overflow-hidden rounded-[30px] bg-gradient-to-br ${game.tileClass} p-4 text-left text-white shadow-[0_16px_32px_rgba(15,23,42,0.2)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(15,23,42,0.28)] ${index === 0 ? 'ring-2 ring-white/80' : ''}"
            >
              <div class="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/25 blur-2xl"></div>
              <div class="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-white/20 blur-2xl"></div>
              <div class="relative">
                <div class="mb-3 flex items-start justify-between gap-2">
                  <div class="flex h-16 w-16 items-center justify-center rounded-[20px] bg-white/20 text-3xl font-extrabold shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-sm">${game.iconGlyph}</div>
                  <span class="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/95">${game.accessTag}</span>
                </div>
                <p class="text-base font-semibold leading-tight">${game.title}</p>
                <p class="mt-1 text-xs leading-5 text-white/90">${game.cardHint}</p>
              </div>
            </button>
          `).join('')}
        </div>

        ${roadmapGames.length ? `
          <div class="grid grid-cols-3 gap-3">
            ${roadmapGames.map((game) => `
              <button
                type="button"
                data-game-card="${game.key}"
                class="game-card group relative overflow-hidden rounded-[24px] bg-gradient-to-br ${game.tileClass} p-3.5 text-left text-white opacity-90 shadow-[0_12px_28px_rgba(15,23,42,0.14)] transition hover:-translate-y-0.5 hover:opacity-100 hover:shadow-[0_18px_36px_rgba(15,23,42,0.22)]"
              >
                <div class="absolute -right-5 -top-5 h-16 w-16 rounded-full bg-white/20 blur-2xl"></div>
                <div class="relative">
                  <div class="mb-2.5 flex items-start justify-between gap-2">
                    <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 text-lg font-extrabold backdrop-blur-sm">${game.iconGlyph}</div>
                    <span class="rounded-full border border-white/30 bg-white/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/95">${game.status}</span>
                  </div>
                  <p class="text-sm font-semibold leading-tight">${game.title}</p>
                  <p class="mt-1 text-[11px] leading-4 text-white/85">${game.cardHint}</p>
                </div>
              </button>
            `).join('')}
          </div>
        ` : ''}
      </section>

      <section id="game-selection-hint" class="hidden" aria-hidden="true"></section>

      <section id="game-settings-section" class="hidden grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]" aria-hidden="true">
        <div class="space-y-4">
          <div class="rounded-[24px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p class="text-sm font-semibold uppercase tracking-[0.16em] text-slate-600">Mode Pengaturan Penuh</p>
              <button id="game-back-to-catalog-btn" type="button" class="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-4 w-4 stroke-current" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                <span>Pilih Game Lain</span>
              </button>
            </div>
          </div>

          <article id="game-workspace-math" data-game-workspace="math" class="game-workspace space-y-4">
            <div class="overflow-hidden rounded-[28px] border border-emerald-200/80 bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 p-5 text-white shadow-[0_18px_40px_rgba(15,23,42,0.16)]">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white/20 text-lg font-extrabold backdrop-blur-sm">∑</span>
                    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100">Matematika Cepat</p>
                  </div>
                  <h3 id="workspace-title" class="mt-3 text-2xl font-semibold tracking-tight">Workspace Game Matematika</h3>
                  <p id="workspace-caption" class="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/90">Ikuti urutan menu: lihat ringkasan → atur soal → buka akses → pantau hasil.</p>
                </div>
                <div class="flex flex-col items-end gap-2">
                  <div id="workspace-status-badge" class="rounded-full border border-white/25 bg-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white">Aktif</div>
                  <p id="workspace-mode-pill" class="text-xs font-medium text-emerald-50/90">Game Matematika</p>
                </div>
              </div>

              <div class="mt-5 grid gap-3 lg:grid-cols-2">
                <div>
                  <label class="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-100/90">1. Pilih kelas</label>
                  <select id="game-assignment" class="w-full rounded-2xl border border-white/20 bg-white/95 px-4 py-3 text-sm font-medium text-slate-800 shadow-sm">${options || '<option value="">Tidak ada relasi</option>'}</select>
                </div>
                <div>
                  <label class="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-100/90">2. Status game</label>
                  <select id="game-status" class="w-full rounded-2xl border border-white/20 bg-white/95 px-4 py-3 text-sm font-medium text-slate-800 shadow-sm">
                    <option value="draft">Draft — belum dibuka ke siswa</option>
                    <option value="published">Published — siap dimainkan siswa</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="rounded-[24px] border border-slate-200 bg-slate-100 p-2 shadow-sm">
              <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <button type="button" data-workspace-tab="overview" class="workspace-tab group flex items-start gap-3 rounded-2xl border border-sky-300 bg-sky-600 px-3.5 py-3 text-left text-white shadow-md transition">
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/20 text-xs font-bold">1</span>
                  <span class="min-w-0">
                    <span class="block text-sm font-semibold">Ringkasan</span>
                    <span class="mt-0.5 block text-[11px] leading-4 text-sky-50/90">Cek status game</span>
                  </span>
                </button>
                <button type="button" data-workspace-tab="config" class="workspace-tab group flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-100 px-3.5 py-3 text-left text-violet-800 transition hover:bg-violet-200/80">
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-200 text-xs font-bold text-violet-800">2</span>
                  <span class="min-w-0">
                    <span class="block text-sm font-semibold">Konfigurasi</span>
                    <span class="mt-0.5 block text-[11px] leading-4 text-violet-700/80">Atur soal, token & publish</span>
                  </span>
                </button>
                <button type="button" data-workspace-tab="rekap" class="workspace-tab group flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-100 px-3.5 py-3 text-left text-amber-900 transition hover:bg-amber-200/80">
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-200 text-xs font-bold text-amber-900">3</span>
                  <span class="min-w-0">
                    <span class="block text-sm font-semibold">Rekap</span>
                    <span class="mt-0.5 block text-[11px] leading-4 text-amber-800/80">Tabel per kelas</span>
                  </span>
                </button>
                <button type="button" data-workspace-tab="monitoring" class="workspace-tab group flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-100 px-3.5 py-3 text-left text-emerald-900 transition hover:bg-emerald-200/80">
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-200 text-xs font-bold text-emerald-900">4</span>
                  <span class="min-w-0">
                    <span class="block text-sm font-semibold">Monitoring</span>
                    <span class="mt-0.5 block text-[11px] leading-4 text-emerald-800/80">Lihat hasil siswa</span>
                  </span>
                </button>
              </div>
            </div>

            <div id="game-overview-panel" class="overflow-hidden rounded-[28px] border border-sky-200 bg-white shadow-sm">
              <div class="border-b border-sky-100 bg-sky-50 px-5 py-4">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">Langkah 1 · Ringkasan</p>
                    <h4 class="mt-1 text-xl font-semibold text-slate-900">Snapshot game kelas terpilih</h4>
                    <p class="mt-1 text-sm text-slate-600">Cek pengaturan saat ini sebelum mengubah atau mem-publish.</p>
                  </div>
                  <div id="overview-status" class="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Draft</div>
                </div>
              </div>
              <div class="space-y-4 p-5">
                <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div class="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">Operasi</p>
                    <p id="overview-operations" class="mt-2 text-sm font-semibold leading-6 text-slate-900">Penjumlahan, Pengurangan</p>
                  </div>
                  <div class="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700">Mode Kuis</p>
                    <p id="overview-quiz-modes" class="mt-2 text-sm font-semibold leading-6 text-slate-900">Isian Singkat</p>
                  </div>
                  <div class="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">Durasi & Soal</p>
                    <p id="overview-duration" class="mt-2 text-sm font-semibold leading-6 text-slate-900">10 soal • 180 detik</p>
                  </div>
                  <div class="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Token Aktif</p>
                    <p id="overview-token" class="mt-2 text-sm font-semibold leading-6 text-slate-900">Belum dibuat</p>
                  </div>
                </div>
                <div class="rounded-2xl border border-dashed border-sky-200 bg-sky-50/50 px-4 py-3 text-sm text-slate-600">
                  <span class="font-semibold text-sky-800">Petunjuk:</span> Lanjut ke tab <span class="font-semibold text-violet-700">Konfigurasi</span> untuk mengubah soal, lalu <span class="font-semibold text-amber-700">Akses & Publish</span> untuk membuka ke siswa.
                </div>
              </div>
            </div>

            <form id="game-config-form" class="hidden space-y-4">
              <div id="game-config-panel" class="overflow-hidden rounded-[28px] border border-violet-200 bg-white shadow-sm">
                <div class="border-b border-violet-100 bg-violet-50 px-5 py-4">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">Langkah 2 · Konfigurasi</p>
                  <h4 class="mt-1 text-xl font-semibold text-slate-900">Atur isi game</h4>
                  <p class="mt-1 text-sm text-slate-600">Pilih operasi, tipe kuis, rentang angka, jumlah soal, dan durasi.</p>
                </div>
                <div class="space-y-4 p-5">
                  <div class="grid gap-3 sm:grid-cols-2">
                    <div class="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700">1. Pilih operasi hitung</p>
                      <p class="mt-1 text-xs text-slate-500">Centang operasi yang akan muncul di soal siswa.</p>
                      <div class="mt-3 grid gap-2 sm:grid-cols-2">
                        ${Object.entries(getOperationCatalog()).map(([key, item]) => `
                          <label class="inline-flex items-center gap-2 rounded-xl border border-violet-100 bg-white px-3 py-2.5 text-sm text-slate-700">
                            <input type="checkbox" class="game-operation h-4 w-4 rounded border-slate-300 text-violet-600" value="${key}" ${['add', 'sub', 'mul', 'div'].includes(key) ? 'checked' : ''} />
                            ${item.label}
                          </label>
                        `).join('')}
                      </div>
                    </div>

                    <div class="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700">2. Pilih mode kuis</p>
                      <p class="mt-1 text-xs text-slate-500">Pilih satu atau lebih cara siswa menjawab.</p>
                      <div class="mt-3 grid gap-2 sm:grid-cols-2">
                        ${Object.entries(quizTypes).map(([key, label]) => `
                          <label class="inline-flex items-center gap-2 rounded-xl border border-violet-100 bg-white px-3 py-2.5 text-sm text-slate-700">
                            <input type="checkbox" class="game-quiz-mode h-4 w-4 rounded border-slate-300 text-violet-600" value="${key}" ${key === 'short_answer' ? 'checked' : ''} />
                            ${label}
                          </label>
                        `).join('')}
                      </div>
                    </div>
                  </div>

                  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div class="rounded-2xl border border-slate-200 bg-white p-3">
                      <label class="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Angka Terkecil</label>
                      <input id="game-number-min" type="number" value="1" min="0" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
                    </div>
                    <div class="rounded-2xl border border-slate-200 bg-white p-3">
                      <label class="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Angka Terbesar</label>
                      <input id="game-number-max" type="number" value="20" min="5" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
                    </div>
                    <div class="rounded-2xl border border-slate-200 bg-white p-3">
                      <label class="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Jumlah Soal</label>
                      <input id="game-question-count" type="number" value="10" min="5" max="50" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
                    </div>
                    <div class="rounded-2xl border border-slate-200 bg-white p-3">
                      <label class="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Waktu (detik)</label>
                      <input id="game-duration" type="number" value="180" min="30" max="1800" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
                    </div>
                  </div>

                  <div class="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700">3. Batasan soal</p>
                    <p class="mt-1 text-xs text-slate-500">Atur batas angka untuk perkalian, pembagian, dan pangkat.</p>
                    <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <label class="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Kali Min</label>
                        <input id="game-mul-min" type="number" value="1" min="0" class="w-full rounded-xl border border-violet-100 bg-white px-3 py-2.5 text-sm" />
                      </div>
                      <div>
                        <label class="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Kali Max</label>
                        <input id="game-mul-max" type="number" value="15" min="1" class="w-full rounded-xl border border-violet-100 bg-white px-3 py-2.5 text-sm" />
                      </div>
                      <div>
                        <label class="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Bagi Min</label>
                        <input id="game-div-min" type="number" value="1" min="1" class="w-full rounded-xl border border-violet-100 bg-white px-3 py-2.5 text-sm" />
                      </div>
                      <div>
                        <label class="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Bagi Max</label>
                        <input id="game-div-max" type="number" value="12" min="2" class="w-full rounded-xl border border-violet-100 bg-white px-3 py-2.5 text-sm" />
                      </div>
                    </div>
                    <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <label class="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Maks Pangkat</label>
                        <input id="game-max-exponent" type="number" value="3" min="2" max="6" class="w-full rounded-xl border border-violet-100 bg-white px-3 py-2.5 text-sm" />
                      </div>
                      <div class="flex items-end">
                        <label class="inline-flex w-full items-center gap-2 rounded-xl border border-violet-100 bg-white px-3 py-2.5 text-sm text-slate-700">
                          <input id="game-allow-negative" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-violet-600" />
                          Izinkan hasil negatif
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="space-y-3 rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p class="text-sm font-semibold text-slate-800">Token Akses Siswa</p>
                    <p class="mt-0.5 text-xs text-slate-500">Aktifkan untuk mewajibkan token. Generate menyimpan otomatis, tanpa Publish ulang.</p>
                  </div>
                  <label class="inline-flex cursor-pointer items-center gap-2">
                    <span id="token-enabled-label" class="text-xs font-semibold text-slate-500">Nonaktif</span>
                    <span class="relative inline-flex">
                      <input id="game-token-enabled" type="checkbox" class="peer sr-only" />
                      <span class="h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-500"></span>
                      <span class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"></span>
                    </span>
                  </label>
                </div>
                <div id="game-token-controls" class="flex flex-wrap items-center justify-between gap-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <input id="game-access-token" readonly class="w-full max-w-[180px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold tracking-[0.14em] text-slate-800" placeholder="Token kelas" />
                    <button id="generate-game-token-btn" type="button" class="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700">Generate Token</button>
                    <button id="copy-game-token-btn" type="button" class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Salin</button>
                  </div>
                  <p id="game-access-token-expiry" class="text-xs text-slate-500">Token belum dibuat.</p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <button type="submit" class="rounded-xl bg-[#007AFF] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0063CC]">Simpan</button>
                  <button id="publish-now-btn" type="button" class="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Publish</button>
                </div>
                <p id="config-message" class="text-sm text-slate-500"></p>
              </div>
            </form>

            <div id="game-rekap-panel" class="hidden overflow-hidden rounded-[28px] border border-amber-200 bg-white shadow-sm">
              <div class="border-b border-amber-100 bg-amber-50 px-5 py-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">Langkah 3 · Rekap</p>
                    <h4 class="mt-1 text-xl font-semibold text-slate-900">Rekap nilai per kelas</h4>
                    <p class="mt-1 text-sm text-slate-600">Lihat percobaan siswa dalam bentuk tabel per kelas.</p>
                  </div>
                  <div class="flex items-center gap-2">
                    <button type="button" data-rekap-subtab="asli" class="rekap-subtab rounded-xl border border-amber-300 bg-amber-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition">Nilai Asli</button>
                    <button type="button" data-rekap-subtab="rekap" class="rekap-subtab rounded-xl border border-amber-200 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-200/80">Nilai Rekap</button>
                  </div>
                </div>
              </div>
              <div class="space-y-4 p-5">
                <div class="grid gap-3 md:grid-cols-2">
                  <div>
                    <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">Filter Kelas</label>
                    <select id="math-rekap-class-filter" class="w-full rounded-2xl border border-amber-100 bg-white px-4 py-3 text-sm">${classFilterOptions}</select>
                  </div>
                  <div>
                    <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">Periode</label>
                    <select id="math-rekap-range-filter" class="w-full rounded-2xl border border-amber-100 bg-white px-4 py-3 text-sm">
                      <option value="week">Minggu Ini</option>
                      <option value="month">Bulan Ini</option>
                      <option value="semester" selected>Semester Aktif</option>
                    </select>
                  </div>
                </div>
                <div class="overflow-x-auto rounded-2xl border border-amber-100">
                  <table class="min-w-full text-sm">
                    <thead class="bg-amber-50 text-left text-xs uppercase tracking-[0.12em] text-amber-700">
                      <tr>
                        <th class="px-4 py-3">No</th>
                        <th class="px-4 py-3">Nama</th>
                        <th id="rekap-col-n1" class="px-4 py-3 text-center">N1</th>
                        <th id="rekap-col-n2" class="px-4 py-3 text-center">N2</th>
                        <th id="rekap-col-n3" class="px-4 py-3 text-center">N3</th>
                        <th id="rekap-col-n4" class="px-4 py-3 text-center">N4</th>
                        <th id="rekap-col-n5" class="px-4 py-3 text-center">N5</th>
                        <th id="rekap-col-avg" class="px-4 py-3 text-center">Rata-rata skor</th>
                      </tr>
                    </thead>
                    <tbody id="rekap-table-body" class="divide-y divide-amber-50"></tbody>
                  </table>
                </div>
                <p id="rekap-empty" class="hidden text-sm text-slate-500">Belum ada data percobaan untuk kelas ini.</p>
              </div>
            </div>

            <div id="game-monitoring-panel" class="hidden overflow-hidden rounded-[28px] border border-emerald-200 bg-white shadow-sm">
              <div class="border-b border-emerald-100 bg-emerald-50 px-5 py-4">
                <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-800">Langkah 4 · Monitoring</p>
                <h4 class="mt-1 text-xl font-semibold text-slate-900">Performa siswa</h4>
                <p class="mt-1 text-sm text-slate-600">Pantau sesi, skor, akurasi, dan peringkat siswa.</p>
              </div>
              <div class="space-y-4 p-5">
                <div class="grid gap-3 md:grid-cols-2">
                  <div>
                    <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Filter Kelas</label>
                    <select id="math-monitor-class-filter" class="w-full rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm">${classFilterOptions}</select>
                  </div>
                  <div>
                    <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Periode</label>
                    <select id="math-monitor-range-filter" class="w-full rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm">
                      <option value="week">Minggu Ini</option>
                      <option value="month">Bulan Ini</option>
                      <option value="semester" selected>Semester Aktif</option>
                    </select>
                  </div>
                </div>
                <div class="grid gap-3 sm:grid-cols-3">
                  <div class="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Minggu Ini</p>
                    <p id="math-recap-week" class="mt-2 text-2xl font-semibold text-slate-900">0 sesi</p>
                  </div>
                  <div class="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Bulan Ini</p>
                    <p id="math-recap-month" class="mt-2 text-2xl font-semibold text-slate-900">0 sesi</p>
                  </div>
                  <div class="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Semester</p>
                    <p id="math-recap-semester" class="mt-2 text-2xl font-semibold text-slate-900">0 sesi</p>
                  </div>
                </div>
                <div class="grid gap-3 sm:grid-cols-3">
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Sesi Tercatat</p>
                    <p id="monitor-total-sessions" class="mt-2 text-3xl font-semibold text-slate-900">0</p>
                  </div>
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Rata-rata Skor</p>
                    <p id="monitor-average-score" class="mt-2 text-3xl font-semibold text-slate-900">0</p>
                  </div>
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Akurasi Kelas</p>
                    <p id="monitor-average-accuracy" class="mt-2 text-3xl font-semibold text-slate-900">0%</p>
                  </div>
                </div>
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Top Siswa</p>
                  <div id="monitor-top-students" class="mt-2 space-y-2"></div>
                </div>
              </div>
            </div>
          </article>

          <article id="game-workspace-english_vocab" data-game-workspace="english_vocab" class="game-workspace hidden space-y-4">
            <div class="overflow-hidden rounded-[28px] border border-sky-200/80 bg-gradient-to-br from-sky-600 via-blue-600 to-indigo-700 p-5 text-white shadow-[0_18px_40px_rgba(15,23,42,0.16)]">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white/20 text-lg font-extrabold backdrop-blur-sm">Aa</span>
                    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">English Vocabulary</p>
                  </div>
                  <h3 class="mt-3 text-2xl font-semibold tracking-tight">Workspace English Vocabulary</h3>
                  <p class="mt-2 max-w-2xl text-sm leading-6 text-sky-50/90">Ikuti urutan menu: lihat ringkasan → atur tema → publish → pantau hasil.</p>
                </div>
                <div class="flex flex-col items-end gap-2">
                  <div class="rounded-full border border-white/25 bg-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white">Aktif</div>
                  <p class="text-xs font-medium text-sky-50/90">Tanpa Token</p>
                </div>
              </div>

              <div class="mt-5 grid gap-3 lg:grid-cols-2">
                <div>
                  <label class="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-100/90">1. Pilih kelas</label>
                  <select id="english-game-assignment" class="w-full rounded-2xl border border-white/20 bg-white/95 px-4 py-3 text-sm font-medium text-slate-800 shadow-sm">${options || '<option value="">Tidak ada relasi</option>'}</select>
                </div>
                <div>
                  <label class="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-100/90">2. Status game</label>
                  <select id="english-game-status" class="w-full rounded-2xl border border-white/20 bg-white/95 px-4 py-3 text-sm font-medium text-slate-800 shadow-sm">
                    <option value="draft">Draft — belum dibuka ke siswa</option>
                    <option value="published">Published — siap dimainkan siswa</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="rounded-[24px] border border-slate-200 bg-slate-100 p-2 shadow-sm">
              <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <button type="button" data-english-tab="overview" class="english-workspace-tab group flex items-start gap-3 rounded-2xl border border-sky-300 bg-sky-600 px-3.5 py-3 text-left text-white shadow-md transition">
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/20 text-xs font-bold">1</span>
                  <span class="min-w-0">
                    <span class="block text-sm font-semibold">Ringkasan</span>
                    <span class="mt-0.5 block text-[11px] leading-4 text-sky-50/90">Cek status game</span>
                  </span>
                </button>
                <button type="button" data-english-tab="config" class="english-workspace-tab group flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-100 px-3.5 py-3 text-left text-violet-800 transition hover:bg-violet-200/80">
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-200 text-xs font-bold text-violet-800">2</span>
                  <span class="min-w-0">
                    <span class="block text-sm font-semibold">Konfigurasi</span>
                    <span class="mt-0.5 block text-[11px] leading-4 text-violet-700/80">Atur tema & soal</span>
                  </span>
                </button>
                <button type="button" data-english-tab="publish" class="english-workspace-tab group flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-100 px-3.5 py-3 text-left text-amber-900 transition hover:bg-amber-200/80">
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-200 text-xs font-bold text-amber-900">3</span>
                  <span class="min-w-0">
                    <span class="block text-sm font-semibold">Publish</span>
                    <span class="mt-0.5 block text-[11px] leading-4 text-amber-800/80">Buka ke siswa</span>
                  </span>
                </button>
                <button type="button" data-english-tab="monitoring" class="english-workspace-tab group flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-100 px-3.5 py-3 text-left text-emerald-900 transition hover:bg-emerald-200/80">
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-200 text-xs font-bold text-emerald-900">4</span>
                  <span class="min-w-0">
                    <span class="block text-sm font-semibold">Monitoring</span>
                    <span class="mt-0.5 block text-[11px] leading-4 text-emerald-800/80">Lihat hasil siswa</span>
                  </span>
                </button>
              </div>
            </div>

            <div id="english-overview-panel" class="overflow-hidden rounded-[28px] border border-sky-200 bg-white shadow-sm">
              <div class="border-b border-sky-100 bg-sky-50 px-5 py-4">
                <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">Langkah 1 · Ringkasan</p>
                <h4 class="mt-1 text-xl font-semibold text-slate-900">Snapshot English Vocabulary</h4>
                <p class="mt-1 text-sm text-slate-600">Cek pengaturan saat ini sebelum mengubah atau mem-publish.</p>
              </div>
              <div class="space-y-4 p-5">
                <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div class="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">Tema Aktif</p>
                    <p id="english-overview-themes" class="mt-2 text-sm font-semibold leading-6 text-slate-900">School Objects</p>
                  </div>
                  <div class="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700">Mode Kuis</p>
                    <p id="english-overview-quiz-modes" class="mt-2 text-sm font-semibold leading-6 text-slate-900">English ke Indonesia</p>
                  </div>
                  <div class="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">Durasi & Soal</p>
                    <p id="english-overview-duration" class="mt-2 text-sm font-semibold leading-6 text-slate-900">10 soal • 180 detik</p>
                  </div>
                  <div class="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Akses</p>
                    <p id="english-overview-access" class="mt-2 text-sm font-semibold leading-6 text-slate-900">Tanpa token</p>
                  </div>
                </div>
                <div class="rounded-2xl border border-dashed border-sky-200 bg-sky-50/50 px-4 py-3 text-sm text-slate-600">
                  <span class="font-semibold text-sky-800">Petunjuk:</span> Lanjut ke tab <span class="font-semibold text-violet-700">Konfigurasi</span> untuk mengatur tema dan kata, lalu <span class="font-semibold text-emerald-700">Publish</span> untuk membuka ke siswa.
                </div>
              </div>
            </div>

            <form id="english-game-config-form" class="hidden space-y-4">
              <div id="english-game-config-panel" class="overflow-hidden rounded-[28px] border border-sky-200 bg-white shadow-sm">
                <div class="border-b border-sky-100 bg-sky-50 px-5 py-4">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">Langkah 2 · Konfigurasi</p>
                  <h4 class="mt-1 text-xl font-semibold text-slate-900">Atur isi game kosakata</h4>
                  <p class="mt-1 text-sm text-slate-600">Pilih tema, mode kuis, atur soal, dan kelola daftar kata.</p>
                </div>
                <div class="space-y-4 p-5">
                  <div class="grid gap-3 sm:grid-cols-2">
                    <div class="rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">1. Pilih tema kosakata</p>
                      <p class="mt-1 text-xs text-slate-500">Tema menentukan kata yang akan muncul di kuis.</p>
                      <div class="mt-3 grid gap-2 sm:grid-cols-2">
                        ${Object.entries(getVocabularyThemeCatalog()).map(([key, item], index) => `
                          <label class="inline-flex items-center gap-2 rounded-xl border border-sky-100 bg-white px-3 py-2.5 text-sm text-slate-700">
                            <input type="checkbox" class="english-theme h-4 w-4 rounded border-slate-300 text-sky-600" value="${key}" ${index === 0 ? 'checked' : ''} />
                            ${item.label}
                          </label>
                        `).join('')}
                      </div>
                      <div id="english-custom-theme-panel" class="mt-3 hidden rounded-2xl border border-dashed border-sky-200 bg-sky-50 px-4 py-3">
                        <p class="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">Tema Kustom Import</p>
                        <div id="english-custom-theme-list" class="mt-2 flex flex-wrap gap-2"></div>
                      </div>
                    </div>

                    <div class="rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">2. Pilih mode kuis</p>
                      <p class="mt-1 text-xs text-slate-500">Pilih satu atau lebih latihan kosakata.</p>
                      <div class="mt-3 grid gap-2 sm:grid-cols-2">
                        ${Object.entries(vocabularyQuizTypes).map(([key, label], index) => `
                          <label class="inline-flex items-center gap-2 rounded-xl border border-sky-100 bg-white px-3 py-2.5 text-sm text-slate-700">
                            <input type="checkbox" class="english-quiz-mode h-4 w-4 rounded border-slate-300 text-sky-600" value="${key}" ${index < 2 ? 'checked' : ''} />
                            ${label}
                          </label>
                        `).join('')}
                      </div>
                    </div>
                  </div>

                  <div class="rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">3. Kelola daftar kata</p>
                        <p class="mt-1 text-xs text-slate-500">Gunakan bank kata default atau import Excel untuk mengganti isi kuis.</p>
                      </div>
                      <span id="english-word-count" class="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold text-sky-700">0 kata</span>
                    </div>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <button id="english-download-template-btn" type="button" class="rounded-2xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-700 hover:bg-sky-50">Download Template Excel</button>
                      <label class="rounded-2xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 cursor-pointer">
                        Import Excel
                        <input id="english-import-file" type="file" accept=".xlsx,.xls,.csv" class="hidden" />
                      </label>
                      <button id="english-reset-word-bank-btn" type="button" class="rounded-2xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-700 hover:bg-sky-50">Kembali ke Bank Default</button>
                    </div>
                    <p id="english-import-message" class="mt-2 text-xs text-slate-500"></p>
                    <div class="mt-3 overflow-x-auto rounded-2xl border border-sky-100 bg-white">
                      <table class="min-w-full text-sm">
                        <thead class="bg-sky-50 text-left text-xs uppercase tracking-[0.12em] text-sky-700">
                          <tr>
                            <th class="px-4 py-3">Tema</th>
                            <th class="px-4 py-3">Word</th>
                            <th class="px-4 py-3">Arti</th>
                            <th class="px-4 py-3">Contoh Kalimat</th>
                          </tr>
                        </thead>
                        <tbody id="english-word-list" class="divide-y divide-sky-50"></tbody>
                      </table>
                    </div>
                  </div>

                  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div class="rounded-2xl border border-slate-200 bg-white p-3">
                      <label class="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Jumlah Soal</label>
                      <input id="english-question-count" type="number" value="10" min="5" max="30" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
                    </div>
                    <div class="rounded-2xl border border-slate-200 bg-white p-3">
                      <label class="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Waktu (detik)</label>
                      <input id="english-duration" type="number" value="180" min="30" max="1800" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
                    </div>
                    <div class="rounded-2xl border border-slate-200 bg-white p-3">
                      <label class="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Level</label>
                      <select id="english-difficulty" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                        <option value="basic">Basic</option>
                        <option value="intermediate">Intermediate</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div id="english-game-publish-panel" class="hidden overflow-hidden rounded-[28px] border border-emerald-200 bg-white shadow-sm">
                <div class="border-b border-emerald-100 bg-emerald-50 px-5 py-4">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-800">Langkah 3 · Publish</p>
                  <h4 class="mt-1 text-xl font-semibold text-slate-900">Buka game ke siswa</h4>
                  <p class="mt-1 text-sm text-slate-600">Ubah status menjadi published agar siswa bisa langsung main tanpa token.</p>
                </div>
                <div class="space-y-4 p-5">
                  <div class="grid gap-3 md:grid-cols-3">
                    <div class="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Akses</p>
                      <p class="mt-2 text-sm font-semibold text-slate-900">Langsung tersedia untuk siswa</p>
                    </div>
                    <div class="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Kontrol</p>
                      <p class="mt-2 text-sm font-semibold text-slate-900">Draft tetap aman sampai guru publish</p>
                    </div>
                    <div class="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Evaluasi</p>
                      <p class="mt-2 text-sm font-semibold text-slate-900">Hasil masuk ke monitoring seperti game lain</p>
                    </div>
                  </div>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-3 rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
                <button type="submit" class="rounded-2xl bg-[#007AFF] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#0063CC]">Simpan Konfigurasi</button>
                <button id="english-publish-now-btn" type="button" class="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">Publish Sekarang</button>
                <p id="english-config-message" class="text-sm text-slate-500"></p>
              </div>
            </form>

            <div id="english-game-monitoring-panel" class="hidden overflow-hidden rounded-[28px] border border-emerald-200 bg-white shadow-sm">
              <div class="border-b border-emerald-100 bg-emerald-50 px-5 py-4">
                <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-800">Langkah 4 · Monitoring</p>
                <h4 class="mt-1 text-xl font-semibold text-slate-900">Performa siswa</h4>
                <p class="mt-1 text-sm text-slate-600">Pantau sesi, skor, akurasi, dan peringkat siswa.</p>
              </div>
              <div class="space-y-4 p-5">
                <div class="grid gap-3 md:grid-cols-2">
                  <div>
                    <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Filter Kelas</label>
                    <select id="english-monitor-class-filter" class="w-full rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm">${classFilterOptions}</select>
                  </div>
                  <div>
                    <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Periode</label>
                    <select id="english-monitor-range-filter" class="w-full rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm">
                      <option value="week">Minggu Ini</option>
                      <option value="month">Bulan Ini</option>
                      <option value="semester" selected>Semester Aktif</option>
                    </select>
                  </div>
                </div>
                <div class="grid gap-3 sm:grid-cols-3">
                  <div class="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Minggu Ini</p>
                    <p id="english-recap-week" class="mt-2 text-2xl font-semibold text-slate-900">0 sesi</p>
                  </div>
                  <div class="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Bulan Ini</p>
                    <p id="english-recap-month" class="mt-2 text-2xl font-semibold text-slate-900">0 sesi</p>
                  </div>
                  <div class="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Semester</p>
                    <p id="english-recap-semester" class="mt-2 text-2xl font-semibold text-slate-900">0 sesi</p>
                  </div>
                </div>
                <div class="grid gap-3 sm:grid-cols-3">
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Sesi Tercatat</p>
                    <p id="english-monitor-total-sessions" class="mt-2 text-3xl font-semibold text-slate-900">0</p>
                  </div>
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Rata-rata Skor</p>
                    <p id="english-monitor-average-score" class="mt-2 text-3xl font-semibold text-slate-900">0</p>
                  </div>
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Akurasi Kelas</p>
                    <p id="english-monitor-average-accuracy" class="mt-2 text-3xl font-semibold text-slate-900">0%</p>
                  </div>
                </div>
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Top Siswa</p>
                  <div id="english-monitor-top-students" class="mt-2 space-y-2"></div>
                </div>
              </div>
            </div>
          </article>

          <article id="game-workspace-battle" data-game-workspace="battle" class="game-workspace hidden space-y-4 rounded-[28px] border border-violet-200 bg-white p-5 shadow-sm">
            <div class="overflow-hidden rounded-[28px] bg-gradient-to-br from-violet-950 via-indigo-900 to-fuchsia-800 p-5 text-white shadow-[0_20px_50px_rgba(76,29,149,0.24)]">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div class="flex items-center gap-2"><span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-xl">⚡</span><p class="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">Quiz Battle Kelas</p></div>
                  <h3 class="mt-3 text-2xl font-semibold tracking-tight">Buat arena battle satu kelas</h3>
                  <p class="mt-2 max-w-2xl text-sm leading-6 text-violet-100/85">Guru menjadi host. Siswa masuk dengan kode room yang sama, lalu menjawab 10 soal pilihan ganda dalam ronde cepat.</p>
                </div>
                <div class="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em]">MVP Aktif</div>
              </div>
            </div>
            <details class="group rounded-2xl border border-violet-100 bg-violet-50/70 p-4" open>
              <summary class="cursor-pointer list-none text-sm font-semibold text-violet-900">Panduan host <span class="float-right text-violet-500 transition group-open:rotate-180">⌄</span></summary>
              <div class="mt-3 grid gap-2 text-xs leading-5 text-violet-900/75 sm:grid-cols-3"><p>1. Pilih kelas dan atur durasi.</p><p>2. Bagikan kode room ke siswa.</p><p>3. Tekan mulai, pantau peserta, lalu lihat leaderboard.</p></div>
            </details>
            <form id="battle-room-form" class="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div class="grid gap-3 md:grid-cols-2">
                <label class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Kelas<select id="battle-assignment" class="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium normal-case tracking-normal text-slate-800">${options || '<option value="">Tidak ada relasi</option>'}</select></label>
                <label class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Judul battle<input id="battle-title" value="Battle Review Kelas" maxlength="60" class="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium normal-case tracking-normal text-slate-800" /></label>
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Jenis battle<select id="battle-game-type" class="mt-2 w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-800"><option value="math">∑ Matematika</option><option value="english_vocab">Aa English Vocabulary</option></select></label>
                <label class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Jumlah soal<select id="battle-question-count" class="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm normal-case tracking-normal text-slate-800"><option value="10">10 soal</option><option value="15">15 soal</option><option value="20">20 soal</option></select></label>
              </div>
              <div id="battle-math-controls" class="grid gap-3 sm:grid-cols-2">
                <label class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Detik per soal<select id="battle-time-per-question" class="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm normal-case tracking-normal text-slate-800"><option value="15">15 detik</option><option value="20" selected>20 detik</option><option value="30">30 detik</option></select></label>
                <label class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Operasi<select id="battle-operation" class="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm normal-case tracking-normal text-slate-800"><option value="mixed">Campuran</option><option value="add">Penjumlahan</option><option value="sub">Pengurangan</option><option value="mul">Perkalian</option></select></label>
              </div>
              <div id="battle-english-controls" class="hidden space-y-3">
                <div class="grid gap-3 sm:grid-cols-2">
                  <label class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tema vocabulary<select id="battle-vocab-theme" class="mt-2 w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-800"><option value="school">School Objects</option><option value="animals">Animals</option><option value="family">Family</option><option value="food">Food & Drink</option><option value="activities">Daily Activities</option></select></label>
                  <label class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Mode soal<select id="battle-vocab-mode" class="mt-2 w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-800"><option value="meaning_choice">English ke Indonesia</option><option value="reverse_choice">Indonesia ke English</option><option value="sentence_fill">Lengkapi Kalimat</option><option value="mixed">Campuran</option></select></label>
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-3"><button id="battle-create-btn" type="submit" class="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-700/20 hover:bg-violet-800">Buat Room Battle</button><p id="battle-room-message" class="text-sm text-slate-500"></p></div>
            </form>
            <div id="battle-host-panel" class="hidden space-y-4 rounded-[24px] border border-violet-200 bg-white p-4">
              <div class="flex flex-wrap items-center justify-between gap-3"><div><p class="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">Room aktif</p><p id="battle-room-code" class="mt-1 text-4xl font-black tracking-[0.22em] text-slate-900">------</p></div><div class="flex gap-2"><button id="battle-copy-code-btn" type="button" class="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Salin kode</button><button id="battle-start-btn" type="button" class="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Mulai battle</button></div></div>
              <div class="grid gap-3 sm:grid-cols-3"><div class="rounded-2xl bg-violet-50 p-3"><p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-600">Status</p><p id="battle-host-status" class="mt-1 font-semibold text-slate-900">Menunggu siswa</p></div><div class="rounded-2xl bg-sky-50 p-3"><p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-600">Peserta</p><p id="battle-host-participants" class="mt-1 font-semibold text-slate-900">0 siswa</p></div><div class="rounded-2xl bg-amber-50 p-3"><p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-600">Ronde</p><p id="battle-host-round" class="mt-1 font-semibold text-slate-900">Lobby</p></div></div>
              <div class="flex items-center justify-between gap-3"><div><p class="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-600">Live scoreboard</p><p class="mt-1 text-xs text-slate-500">Skor berubah saat jawaban siswa masuk.</p></div><span class="live-score-pulse"><span></span>LIVE</span></div>
              <div id="battle-host-leaderboard" class="battle-live-scoreboard space-y-2"></div>
              <button id="battle-finish-btn" type="button" class="hidden rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700">Akhiri battle</button>
            </div>
          </article>

          ${gameCatalog.filter((game) => !game.available).map((game) => `
            <article id="game-workspace-${game.key}" data-game-workspace="${game.key}" class="game-workspace hidden rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Roadmap Game</p>
                  <h3 class="mt-2 text-2xl font-semibold text-slate-900">${game.workspaceTitle}</h3>
                  <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-500">${game.workspaceCaption}</p>
                </div>
                <div class="rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${game.cardBadgeClass || game.badgeClass}">${game.status}</div>
              </div>

              <div class="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div class="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                  <p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Peran dalam platform</p>
                  <p class="mt-2 text-sm leading-6 text-slate-700">${game.description}</p>
                  <div class="mt-4 space-y-2">
                    ${game.bullets.map((bullet) => `
                      <div class="flex items-start gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
                        <span class="mt-1 h-2.5 w-2.5 rounded-full bg-slate-900"></span>
                        <p class="text-sm text-slate-700">${bullet}</p>
                      </div>
                    `).join('')}
                  </div>
                </div>
                <div class="rounded-[24px] border border-dashed border-slate-200 bg-white p-4">
                  <p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Saran implementasi</p>
                  <div class="mt-4 space-y-3 text-sm text-slate-600">
                    <p>Gunakan struktur yang sama seperti game matematika: konfigurasi, akses token, monitoring, dan leaderboard.</p>
                    <p>Pastikan game type baru memakai koleksi konfigurasi yang sama agar guru tidak perlu belajar ulang antarmuka.</p>
                    <p>Gunakan panel ini sebagai placeholder hingga engine game baru siap diaktifkan.</p>
                  </div>
                </div>
              </div>
            </article>
          `).join('')}
        </div>

        <aside id="game-settings-aside" class="space-y-4">
          <div class="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <p class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Template Modul</p>
            <h4 class="mt-1 text-xl font-semibold text-slate-900">Standar game platform</h4>
            <div class="mt-4 space-y-3 text-sm text-slate-600">
              <div class="rounded-2xl bg-slate-50 px-4 py-3">1. Pilih game dari katalog.</div>
              <div class="rounded-2xl bg-slate-50 px-4 py-3">2. Atur konfigurasi per relasi mengajar.</div>
              <div class="rounded-2xl bg-slate-50 px-4 py-3">3. Kelola token akses dan publish.</div>
              <div class="rounded-2xl bg-slate-50 px-4 py-3">4. Pantau hasil, akurasi, dan top siswa.</div>
            </div>
          </div>

          <div class="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <p class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Kesiapan Ekspansi</p>
            <div class="mt-4 space-y-3 text-sm text-slate-600">
              <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p class="font-semibold text-slate-900">Bank Konten</p>
                <p class="mt-1">Pisahkan engine game dari bank soal agar satu mapel bisa dipakai di banyak game.</p>
              </div>
              <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p class="font-semibold text-slate-900">Leaderboard</p>
                <p class="mt-1">Gunakan format monitoring yang sama untuk semua game agar laporan guru konsisten.</p>
              </div>
              <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p class="font-semibold text-slate-900">Token & Akses</p>
                <p class="mt-1">Pertahankan pola token guru karena sudah paling cocok dengan alur kelas yang Anda pakai.</p>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </div>
  `);

  container.innerHTML = html;

  const assignmentSelect = container.querySelector('#game-assignment');
  const statusSelect = container.querySelector('#game-status');
  const configMessage = container.querySelector('#config-message');
  const form = container.querySelector('#game-config-form');
  const accessTokenInput = container.querySelector('#game-access-token');
  const generateTokenBtn = container.querySelector('#generate-game-token-btn');
  const accessTokenExpiryEl = container.querySelector('#game-access-token-expiry');
  const tokenEnabledInput = container.querySelector('#game-token-enabled');
  const tokenEnabledLabel = container.querySelector('#token-enabled-label');
  const tokenControlsEl = container.querySelector('#game-token-controls');
  const copyTokenBtn = container.querySelector('#copy-game-token-btn');
  const englishAssignmentSelect = container.querySelector('#english-game-assignment');
  const englishStatusSelect = container.querySelector('#english-game-status');
  const englishConfigMessage = container.querySelector('#english-config-message');
  const englishForm = container.querySelector('#english-game-config-form');
  const englishWordCountEl = container.querySelector('#english-word-count');
  const englishWordListEl = container.querySelector('#english-word-list');
  const englishImportMessageEl = container.querySelector('#english-import-message');
  const englishImportFileEl = container.querySelector('#english-import-file');
  const englishDownloadTemplateBtn = container.querySelector('#english-download-template-btn');
  const englishResetWordBankBtn = container.querySelector('#english-reset-word-bank-btn');
  const englishCustomThemePanelEl = container.querySelector('#english-custom-theme-panel');
  const englishCustomThemeListEl = container.querySelector('#english-custom-theme-list');
  const battleForm = container.querySelector('#battle-room-form');
  const battleAssignmentEl = container.querySelector('#battle-assignment');
  const battleGameTypeEl = container.querySelector('#battle-game-type');
  const battleMathControlsEl = container.querySelector('#battle-math-controls');
  const battleEnglishControlsEl = container.querySelector('#battle-english-controls');
  const battleRoomMessageEl = container.querySelector('#battle-room-message');
  const battleHostPanelEl = container.querySelector('#battle-host-panel');
  const battleRoomCodeEl = container.querySelector('#battle-room-code');
  const battleHostStatusEl = container.querySelector('#battle-host-status');
  const battleHostParticipantsEl = container.querySelector('#battle-host-participants');
  const battleHostRoundEl = container.querySelector('#battle-host-round');
  const battleHostLeaderboardEl = container.querySelector('#battle-host-leaderboard');
  const battleStartBtn = container.querySelector('#battle-start-btn');
  const battleFinishBtn = container.querySelector('#battle-finish-btn');
  const battleCopyCodeBtn = container.querySelector('#battle-copy-code-btn');

  function updateBattleTypeControls() {
    const isEnglish = battleGameTypeEl?.value === 'english_vocab';
    battleMathControlsEl?.classList.toggle('hidden', isEnglish);
    battleEnglishControlsEl?.classList.toggle('hidden', !isEnglish);
  }

  battleGameTypeEl?.addEventListener('change', updateBattleTypeControls);
  updateBattleTypeControls();

  const totalSessionsEl = container.querySelector('#monitor-total-sessions');
  const averageScoreEl = container.querySelector('#monitor-average-score');
  const averageAccuracyEl = container.querySelector('#monitor-average-accuracy');
  const topStudentsEl = container.querySelector('#monitor-top-students');
  const mathMonitorClassFilterEl = container.querySelector('#math-monitor-class-filter');
  const mathMonitorRangeFilterEl = container.querySelector('#math-monitor-range-filter');
  const mathRecapWeekEl = container.querySelector('#math-recap-week');
  const mathRecapMonthEl = container.querySelector('#math-recap-month');
  const mathRecapSemesterEl = container.querySelector('#math-recap-semester');
  const rekapPanelEl = container.querySelector('#game-rekap-panel');
  const rekapTableBodyEl = container.querySelector('#rekap-table-body');
  const rekapEmptyEl = container.querySelector('#rekap-empty');
  const rekapClassFilterEl = container.querySelector('#math-rekap-class-filter');
  const rekapRangeFilterEl = container.querySelector('#math-rekap-range-filter');
  const rekapSubtabAsliBtn = container.querySelector('[data-rekap-subtab="asli"]');
  const rekapSubtabRekapBtn = container.querySelector('[data-rekap-subtab="rekap"]');
  const rekapColN1 = container.querySelector('#rekap-col-n1');
  const rekapColN2 = container.querySelector('#rekap-col-n2');
  const rekapColN3 = container.querySelector('#rekap-col-n3');
  const rekapColN4 = container.querySelector('#rekap-col-n4');
  const rekapColN5 = container.querySelector('#rekap-col-n5');
  const rekapColAvg = container.querySelector('#rekap-col-avg');
  let currentRekapMode = 'asli';
  const summarySessionsEl = container.querySelector('#game-summary-sessions');
  const workspaceTitleEl = container.querySelector('#workspace-title');
  const workspaceCaptionEl = container.querySelector('#workspace-caption');
  const workspaceStatusBadgeEl = container.querySelector('#workspace-status-badge');
  const overviewStatusEl = container.querySelector('#overview-status');
  const overviewOperationsEl = container.querySelector('#overview-operations');
  const overviewQuizModesEl = container.querySelector('#overview-quiz-modes');
  const overviewDurationEl = container.querySelector('#overview-duration');
  const overviewTokenEl = container.querySelector('#overview-token');
  const workspaceModePillEl = container.querySelector('#workspace-mode-pill');
  const gameCatalogSectionEl = container.querySelector('#game-catalog-section');
  const gameSelectionHintEl = container.querySelector('#game-selection-hint');
  const gameSettingsSectionEl = container.querySelector('#game-settings-section');
  const gameSettingsAsideEl = container.querySelector('#game-settings-aside');
  const gameBackToCatalogBtn = container.querySelector('#game-back-to-catalog-btn');
  const gameCards = Array.from(container.querySelectorAll('[data-game-card]'));
  const gameWorkspaces = Array.from(container.querySelectorAll('[data-game-workspace]'));
  const workspaceTabs = Array.from(container.querySelectorAll('[data-workspace-tab]'));
  const overviewPanelEl = container.querySelector('#game-overview-panel');
  const configPanelEl = container.querySelector('#game-config-panel');
  const accessPanelEl = container.querySelector('#game-access-panel');
  const monitoringPanelEl = container.querySelector('#game-monitoring-panel');
  const englishOverviewStatusEl = container.querySelector('#english-overview-status');
  const englishOverviewThemesEl = container.querySelector('#english-overview-themes');
  const englishOverviewQuizModesEl = container.querySelector('#english-overview-quiz-modes');
  const englishOverviewDurationEl = container.querySelector('#english-overview-duration');
  const englishOverviewAccessEl = container.querySelector('#english-overview-access');
  const englishWorkspaceTabs = Array.from(container.querySelectorAll('[data-english-tab]'));
  const englishOverviewPanelEl = container.querySelector('#english-overview-panel');
  const englishConfigPanelEl = container.querySelector('#english-game-config-panel');
  const englishPublishPanelEl = container.querySelector('#english-game-publish-panel');
  const englishMonitoringPanelEl = container.querySelector('#english-game-monitoring-panel');
  const englishTotalSessionsEl = container.querySelector('#english-monitor-total-sessions');
  const englishAverageScoreEl = container.querySelector('#english-monitor-average-score');
  const englishAverageAccuracyEl = container.querySelector('#english-monitor-average-accuracy');
  const englishTopStudentsEl = container.querySelector('#english-monitor-top-students');
  const englishMonitorClassFilterEl = container.querySelector('#english-monitor-class-filter');
  const englishMonitorRangeFilterEl = container.querySelector('#english-monitor-range-filter');
  const englishRecapWeekEl = container.querySelector('#english-recap-week');
  const englishRecapMonthEl = container.querySelector('#english-recap-month');
  const englishRecapSemesterEl = container.querySelector('#english-recap-semester');

  let currentAssignmentId = selectedAssignment?.id || '';
  let currentEnglishAssignmentId = selectedAssignment?.id || '';
  let currentAccessToken = '';
  let currentAccessTokenIssuedAt = '';
  let currentAccessTokenExpiresAt = '';
  let currentTokenEnabled = true;
  let currentGameKey = '';
  let currentWorkspaceTab = 'overview';
  let currentEnglishWorkspaceTab = 'overview';
  let currentEnglishWordBank = [];
  let hasGameSelection = false;
  let activeBattleRoom = null;
  let battlePollId = null;
  let battleUnsubscribe = null;
  let battleParticipantsUnsubscribe = null;

  function readBattleRooms() {
    return readLocalList(BATTLE_ROOM_LOCAL_KEY);
  }

  function saveBattleRoom(room) {
    upsertLocalById(BATTLE_ROOM_LOCAL_KEY, room);
    saveDocument('battle_rooms', room, room.id).catch(() => {});
  }

  function setBattleMessage(text, isError = false) {
    if (!battleRoomMessageEl) return;
    battleRoomMessageEl.textContent = text;
    battleRoomMessageEl.className = isError ? 'text-sm text-rose-600' : 'text-sm text-slate-500';
  }

  function renderBattleLeaderboard(room) {
    const participants = Object.values(room?.participants || {}).sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    if (battleHostParticipantsEl) battleHostParticipantsEl.textContent = `${participants.length} siswa`;
    if (battleHostLeaderboardEl) {
      battleHostLeaderboardEl.innerHTML = participants.length
        ? participants.map((item, index) => `<div class="battle-live-score-row ${index === 0 ? 'is-leading' : ''}"><div class="battle-rank-badge">${index + 1}</div><div class="min-w-0 flex-1"><div class="flex items-center gap-2"><span class="truncate text-sm font-bold text-slate-800">${item.nama || 'Siswa'}</span>${item.ready ? '<span class="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-700">Siap</span>' : ''}</div><p class="mt-0.5 text-[11px] text-slate-500">Benar ${Number(item.correct || 0)} • Salah ${Number(item.wrong || 0)} • Tidak jawab ${Object.values(item.score_events || {}).filter((event) => event.outcome === 'unanswered').length}</p></div><div class="text-right"><p class="text-lg font-black text-violet-700">${Number(item.score || 0)}</p><p class="text-[9px] font-bold uppercase tracking-wide text-slate-400">poin</p></div></div>`).join('')
        : '<p class="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-500">Belum ada siswa bergabung.</p>';
    }
  }

  function renderBattleRoom(room) {
    if (!room) return;
    activeBattleRoom = room;
    if (battleHostPanelEl) battleHostPanelEl.classList.remove('hidden');
    if (battleRoomCodeEl) battleRoomCodeEl.textContent = room.code;
    if (battleHostStatusEl) battleHostStatusEl.textContent = room.status === 'live' ? 'Battle berlangsung' : room.status === 'finished' ? 'Selesai' : 'Menunggu siswa';
    if (battleHostRoundEl) battleHostRoundEl.textContent = room.status === 'live' ? `Soal ${Math.min(room.current_question + 1, room.questions.length)}/${room.questions.length}` : 'Lobby';
    battleStartBtn?.classList.toggle('hidden', room.status !== 'waiting');
    battleFinishBtn?.classList.toggle('hidden', !['waiting', 'live'].includes(room.status));
    renderBattleLeaderboard(room);
  }

  async function refreshBattleRoom() {
    if (!activeBattleRoom) return;
    const localRoom = readBattleRooms().find((item) => item.id === activeBattleRoom.id);
    if (localRoom) renderBattleRoom(localRoom);
    try {
      let roomDoc = null;
      if (window.firebaseDb && activeBattleRoom.id) {
        const snap = await window.firebaseDb.collection('battle_rooms').doc(activeBattleRoom.id).get();
        if (snap.exists) roomDoc = { id: snap.id, ...snap.data() };
      }
      if (!roomDoc) {
        const docs = await getDocumentsWhere('battle_rooms', [{ field: 'id', operator: '==', value: activeBattleRoom.id }]);
        roomDoc = docs[0] || null;
      }
      if (roomDoc) {
        upsertLocalById(BATTLE_ROOM_LOCAL_KEY, roomDoc);
        renderBattleRoom(roomDoc);
      }
      if (activeBattleRoom.id) {
        const participantDocs = await getDocumentsWhere('battle_participants', [
          { field: 'room_id', operator: '==', value: activeBattleRoom.id },
        ]);
        const participants = {};
        participantDocs.forEach((item) => {
          const id = item.participant_id || item.id;
          participants[id] = { ...item, id };
        });
        if (Object.keys(participants).length) {
          const mergedRoom = { ...(roomDoc || activeBattleRoom), participants };
          upsertLocalById(BATTLE_ROOM_LOCAL_KEY, mergedRoom);
          renderBattleRoom(mergedRoom);
        }
      }
    } catch {}
  }

  function stopBattlePolling() {
    if (battlePollId) clearInterval(battlePollId);
    battlePollId = null;
    if (battleUnsubscribe) battleUnsubscribe();
    battleUnsubscribe = null;
    if (battleParticipantsUnsubscribe) battleParticipantsUnsubscribe();
    battleParticipantsUnsubscribe = null;
  }

  function setGameSettingsVisibility(visible, animate = false) {
    if (gameSelectionHintEl) {
      gameSelectionHintEl.classList.add('hidden');
      gameSelectionHintEl.setAttribute('aria-hidden', 'true');
    }
    if (gameCatalogSectionEl) {
      gameCatalogSectionEl.classList.toggle('hidden', visible);
    }
    if (!gameSettingsSectionEl) {
      return;
    }

    gameSettingsSectionEl.classList.toggle('hidden', !visible);
    gameSettingsSectionEl.setAttribute('aria-hidden', String(!visible));

    if (visible) {
      gameSettingsSectionEl.style.gridTemplateColumns = 'minmax(0,1fr)';
      gameSettingsSectionEl.style.minHeight = 'calc(100dvh - 240px)';
      if (gameSettingsAsideEl) {
        gameSettingsAsideEl.classList.add('hidden');
      }
    } else {
      gameSettingsSectionEl.style.gridTemplateColumns = '';
      gameSettingsSectionEl.style.minHeight = '';
      if (gameSettingsAsideEl) {
        gameSettingsAsideEl.classList.remove('hidden');
      }
    }

    if (visible && animate && gameSettingsSectionEl.animate) {
      gameSettingsSectionEl.animate(
        [
          { opacity: 0, transform: 'translateY(12px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    }
  }

  function updateWorkspaceHeader() {
    const selectedGame = gameCatalog.find((item) => item.key === currentGameKey) || gameCatalog[0];
    if (workspaceTitleEl) {
      workspaceTitleEl.textContent = selectedGame.workspaceTitle;
    }
    if (workspaceCaptionEl) {
      workspaceCaptionEl.textContent = selectedGame.workspaceCaption;
    }
    if (workspaceStatusBadgeEl) {
      workspaceStatusBadgeEl.textContent = selectedGame.status;
      workspaceStatusBadgeEl.className = selectedGame.available
        ? 'rounded-full border border-white/25 bg-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white'
        : `rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${selectedGame.cardBadgeClass || selectedGame.badgeClass}`;
    }
    if (workspaceModePillEl) {
      workspaceModePillEl.textContent = selectedGame.title;
    }
  }

  function updateOverviewSnapshot(status = 'draft', settings = normalizeGameSettings({}), token = '') {
    if (overviewStatusEl) {
      overviewStatusEl.textContent = status === 'published' ? 'Published' : 'Draft';
      overviewStatusEl.className = status === 'published'
        ? 'rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700'
        : 'rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700';
    }
    if (overviewOperationsEl) {
      overviewOperationsEl.textContent = settings.operations?.length
        ? settings.operations.map((item) => getOperationLabel(item)).join(', ')
        : 'Belum dipilih';
    }
    if (overviewQuizModesEl) {
      overviewQuizModesEl.textContent = settings.quiz_modes?.length
        ? settings.quiz_modes.map((item) => getQuizTypeLabel(item)).join(', ')
        : 'Belum dipilih';
    }
    if (overviewDurationEl) {
      overviewDurationEl.textContent = `${settings.question_count || 0} soal • ${settings.duration_sec || 0} detik`;
    }
    if (overviewTokenEl) {
      overviewTokenEl.textContent = !currentTokenEnabled ? 'Dimatikan' : (token || 'Belum dibuat');
    }
  }

  function updateEnglishOverviewSnapshot(status = 'draft', settings = normalizeVocabularySettings({})) {
    if (englishOverviewStatusEl) {
      englishOverviewStatusEl.textContent = status === 'published' ? 'Published' : 'Draft';
      englishOverviewStatusEl.className = status === 'published'
        ? 'rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700'
        : 'rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700';
    }
    if (englishOverviewThemesEl) {
      englishOverviewThemesEl.textContent = settings.themes?.length
        ? settings.themes.map((item) => getVocabularyThemeLabel(item, settings.word_bank)).join(', ')
        : 'Belum dipilih';
    }
    if (englishOverviewQuizModesEl) {
      englishOverviewQuizModesEl.textContent = settings.quiz_modes?.length
        ? settings.quiz_modes.map((item) => getVocabularyQuizTypeLabel(item)).join(', ')
        : 'Belum dipilih';
    }
    if (englishOverviewDurationEl) {
      englishOverviewDurationEl.textContent = `${settings.question_count || 0} soal • ${settings.duration_sec || 0} detik`;
    }
    if (englishOverviewAccessEl) {
      englishOverviewAccessEl.textContent = 'Tanpa token';
    }
  }

  const mathTabStyles = {
    overview: {
      active: 'workspace-tab group flex items-start gap-3 rounded-2xl border border-sky-300 bg-sky-600 px-3.5 py-3 text-left text-white shadow-md transition',
      idle: 'workspace-tab group flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-100 px-3.5 py-3 text-left text-sky-900 transition hover:bg-sky-200/80',
      badgeActive: 'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/20 text-xs font-bold',
      badgeIdle: 'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-200 text-xs font-bold text-sky-900',
      captionActive: 'mt-0.5 block text-[11px] leading-4 text-sky-50/90',
      captionIdle: 'mt-0.5 block text-[11px] leading-4 text-sky-800/80',
    },
    config: {
      active: 'workspace-tab group flex items-start gap-3 rounded-2xl border border-violet-300 bg-violet-600 px-3.5 py-3 text-left text-white shadow-md transition',
      idle: 'workspace-tab group flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-100 px-3.5 py-3 text-left text-violet-800 transition hover:bg-violet-200/80',
      badgeActive: 'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/20 text-xs font-bold',
      badgeIdle: 'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-200 text-xs font-bold text-violet-800',
      captionActive: 'mt-0.5 block text-[11px] leading-4 text-violet-50/90',
      captionIdle: 'mt-0.5 block text-[11px] leading-4 text-violet-700/80',
    },
    rekap: {
      active: 'workspace-tab group flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-500 px-3.5 py-3 text-left text-white shadow-md transition',
      idle: 'workspace-tab group flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-100 px-3.5 py-3 text-left text-amber-900 transition hover:bg-amber-200/80',
      badgeActive: 'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/20 text-xs font-bold',
      badgeIdle: 'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-200 text-xs font-bold text-amber-900',
      captionActive: 'mt-0.5 block text-[11px] leading-4 text-amber-50/90',
      captionIdle: 'mt-0.5 block text-[11px] leading-4 text-amber-800/80',
    },
    monitoring: {
      active: 'workspace-tab group flex items-start gap-3 rounded-2xl border border-emerald-300 bg-emerald-600 px-3.5 py-3 text-left text-white shadow-md transition',
      idle: 'workspace-tab group flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-100 px-3.5 py-3 text-left text-emerald-900 transition hover:bg-emerald-200/80',
      badgeActive: 'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/20 text-xs font-bold',
      badgeIdle: 'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-200 text-xs font-bold text-emerald-900',
      captionActive: 'mt-0.5 block text-[11px] leading-4 text-emerald-50/90',
      captionIdle: 'mt-0.5 block text-[11px] leading-4 text-emerald-800/80',
    },
  };

  function setWorkspaceTab(tabKey) {
    currentWorkspaceTab = tabKey;
    workspaceTabs.forEach((button) => {
      const key = button.getAttribute('data-workspace-tab') || 'overview';
      const isActive = key === tabKey;
      const style = mathTabStyles[key] || mathTabStyles.overview;
      button.className = isActive ? style.active : style.idle;
      const badge = button.querySelector('span.flex.h-8');
      const caption = button.querySelector('span.min-w-0 > span:last-child');
      if (badge) {
        badge.className = isActive ? style.badgeActive : style.badgeIdle;
      }
      if (caption) {
        caption.className = isActive ? style.captionActive : style.captionIdle;
      }
    });

    if (overviewPanelEl) {
      overviewPanelEl.classList.toggle('hidden', tabKey !== 'overview');
    }
    if (form) {
      form.classList.toggle('hidden', tabKey !== 'config');
    }
    if (configPanelEl) {
      configPanelEl.classList.toggle('hidden', tabKey !== 'config');
    }
    if (rekapPanelEl) {
      rekapPanelEl.classList.toggle('hidden', tabKey !== 'rekap');
    }
    if (monitoringPanelEl) {
      monitoringPanelEl.classList.toggle('hidden', tabKey !== 'monitoring');
    }
  }

  const englishTabStyles = {
    overview: {
      active: 'english-workspace-tab group flex items-start gap-3 rounded-2xl border border-sky-300 bg-sky-600 px-3.5 py-3 text-left text-white shadow-md transition',
      idle: 'english-workspace-tab group flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-100 px-3.5 py-3 text-left text-sky-900 transition hover:bg-sky-200/80',
    },
    config: {
      active: 'english-workspace-tab group flex items-start gap-3 rounded-2xl border border-violet-300 bg-violet-600 px-3.5 py-3 text-left text-white shadow-md transition',
      idle: 'english-workspace-tab group flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-100 px-3.5 py-3 text-left text-violet-800 transition hover:bg-violet-200/80',
    },
    publish: {
      active: 'english-workspace-tab group flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-500 px-3.5 py-3 text-left text-white shadow-md transition',
      idle: 'english-workspace-tab group flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-100 px-3.5 py-3 text-left text-amber-900 transition hover:bg-amber-200/80',
    },
    monitoring: {
      active: 'english-workspace-tab group flex items-start gap-3 rounded-2xl border border-emerald-300 bg-emerald-600 px-3.5 py-3 text-left text-white shadow-md transition',
      idle: 'english-workspace-tab group flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-100 px-3.5 py-3 text-left text-emerald-900 transition hover:bg-emerald-200/80',
    },
  };

  function setEnglishWorkspaceTab(tabKey) {
    currentEnglishWorkspaceTab = tabKey;
    englishWorkspaceTabs.forEach((button) => {
      const key = button.getAttribute('data-english-tab') || 'overview';
      const isActive = key === tabKey;
      const style = englishTabStyles[key] || englishTabStyles.overview;
      button.className = isActive ? style.active : style.idle;
    });

    if (englishOverviewPanelEl) {
      englishOverviewPanelEl.classList.toggle('hidden', tabKey !== 'overview');
    }
    if (englishForm) {
      englishForm.classList.toggle('hidden', !['config', 'publish'].includes(tabKey));
    }
    if (englishConfigPanelEl) {
      englishConfigPanelEl.classList.toggle('hidden', tabKey !== 'config');
    }
    if (englishPublishPanelEl) {
      englishPublishPanelEl.classList.toggle('hidden', tabKey !== 'publish');
    }
    if (englishMonitoringPanelEl) {
      englishMonitoringPanelEl.classList.toggle('hidden', tabKey !== 'monitoring');
    }
  }

  function setActiveGame(gameKey, shouldAnimateWorkspace = false) {
    currentGameKey = gameKey;
    gameCards.forEach((card) => {
      const isActive = Boolean(gameKey) && card.getAttribute('data-game-card') === gameKey;
      card.classList.toggle('ring-2', isActive);
      card.classList.toggle('ring-white/80', isActive);
    });
    gameWorkspaces.forEach((panel) => {
      panel.classList.toggle('hidden', panel.getAttribute('data-game-workspace') !== gameKey);
    });

    if (gameKey === 'math') {
      updateWorkspaceHeader();
      setWorkspaceTab(currentWorkspaceTab);
      renderMonitoring(currentAssignmentId);
      if (currentWorkspaceTab === 'rekap') {
        renderRekapTable();
      }
    }

    if (gameKey === 'english_vocab') {
      setEnglishWorkspaceTab(currentEnglishWorkspaceTab);
      renderEnglishMonitoring(currentEnglishAssignmentId);
    }

    const activeWorkspace = gameWorkspaces.find((panel) => panel.getAttribute('data-game-workspace') === gameKey);
    if (activeWorkspace && shouldAnimateWorkspace && activeWorkspace.animate) {
      activeWorkspace.animate(
        [
          { opacity: 0, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 220, easing: 'ease-out' },
      );
    }
  }

  function formatDateTime(dateString) {
    if (!dateString) {
      return '-';
    }
    return new Date(dateString).toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function generateAccessToken(length = 6) {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let token = '';
    for (let i = 0; i < length; i += 1) {
      token += charset[Math.floor(Math.random() * charset.length)];
    }
    return token;
  }

  function setMessage(text, isError = false) {
    if (!configMessage) return;
    configMessage.textContent = text;
    configMessage.className = isError ? 'text-sm text-rose-600' : 'text-sm text-slate-500';
  }

  function applyTokenEnabledUI() {
    if (tokenEnabledInput) {
      tokenEnabledInput.checked = currentTokenEnabled;
    }
    if (tokenEnabledLabel) {
      tokenEnabledLabel.textContent = currentTokenEnabled ? 'Aktif' : 'Nonaktif';
      tokenEnabledLabel.className = currentTokenEnabled
        ? 'text-xs font-semibold text-emerald-600'
        : 'text-xs font-semibold text-slate-500';
    }
    if (tokenControlsEl) {
      tokenControlsEl.classList.toggle('opacity-50', !currentTokenEnabled);
      tokenControlsEl.classList.toggle('pointer-events-none', !currentTokenEnabled);
    }
  }

  function setEnglishMessage(text, isError = false) {
    if (!englishConfigMessage) return;
    englishConfigMessage.textContent = text;
    englishConfigMessage.className = isError ? 'text-sm text-rose-600' : 'text-sm text-slate-500';
  }

  function setEnglishImportMessage(text, isError = false) {
    if (!englishImportMessageEl) return;
    englishImportMessageEl.textContent = text;
    englishImportMessageEl.className = isError ? 'text-sm text-rose-600' : 'text-sm text-slate-500';
  }

  function getActiveEnglishWordBank() {
    const settings = getSelectedEnglishSettings();
    const effectiveSettings = {
      ...settings,
      word_bank: currentEnglishWordBank,
    };
    return getVocabularyWordList(effectiveSettings);
  }

  function getSelectedEnglishThemeKeys() {
    const builtInThemes = Array.from(container.querySelectorAll('.english-theme:checked')).map((input) => input.value);
    const customThemes = getVocabularyThemeOptions(currentEnglishWordBank)
      .filter((item) => item.is_custom)
      .map((item) => item.key);
    return [...new Set([...builtInThemes, ...customThemes])];
  }

  function renderEnglishCustomThemes() {
    if (!englishCustomThemePanelEl || !englishCustomThemeListEl) {
      return;
    }

    const customThemes = getVocabularyThemeOptions(currentEnglishWordBank).filter((item) => item.is_custom);
    englishCustomThemePanelEl.classList.toggle('hidden', !customThemes.length);
    englishCustomThemeListEl.innerHTML = customThemes
      .map((item) => `<span class="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold text-sky-700">${item.label}</span>`)
      .join('');
  }

  function renderEnglishWordList() {
    if (!englishWordListEl) {
      return;
    }

    const words = getActiveEnglishWordBank();
    if (englishWordCountEl) {
      englishWordCountEl.textContent = `${words.length} kata`;
    }

    englishWordListEl.innerHTML = words.length
      ? words.map((item) => `
          <tr>
            <td class="px-4 py-3 text-slate-600">${item.theme_label || getVocabularyThemeLabel(item.theme)}</td>
            <td class="px-4 py-3 font-semibold text-slate-900">${item.word}</td>
            <td class="px-4 py-3 text-slate-700">${item.translation}</td>
            <td class="px-4 py-3 text-slate-600">${item.sentence}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="4" class="px-4 py-4 text-sm text-slate-500">Belum ada kosakata aktif.</td></tr>';

      renderEnglishCustomThemes();
  }

  function buildVocabularyTemplateRows() {
    return [
      { theme: 'animals', word: 'cat', translation: 'kucing', sentence: 'The cat is sleeping on the chair.' },
      { theme: 'school', word: 'book', translation: 'buku', sentence: 'I read a book in the library.' },
      { theme: 'family', word: 'mother', translation: 'ibu', sentence: 'My mother cooks delicious soup.' },
      { theme: 'food', word: 'apple', translation: 'apel', sentence: 'I eat an apple at break time.' },
      { theme: 'activities', word: 'study', translation: 'belajar', sentence: 'Students study for the test.' },
    ];
  }

  function downloadVocabularyTemplate() {
    if (!window.XLSX) {
      setEnglishImportMessage('Library Excel belum tersedia di browser.', true);
      return;
    }

    const workbook = window.XLSX.utils.book_new();
    const dataSheet = window.XLSX.utils.json_to_sheet(buildVocabularyTemplateRows());
    const guideSheet = window.XLSX.utils.json_to_sheet([
      { field: 'theme', description: 'Gunakan salah satu: animals, school, family, food, activities' },
      { field: 'word', description: 'Kosakata bahasa Inggris, contoh: cat' },
      { field: 'translation', description: 'Arti bahasa Indonesia, contoh: kucing' },
      { field: 'sentence', description: 'Contoh kalimat bahasa Inggris yang memuat kata tersebut' },
    ]);
    window.XLSX.utils.book_append_sheet(workbook, dataSheet, 'template_vocab');
    window.XLSX.utils.book_append_sheet(workbook, guideSheet, 'panduan');
    window.XLSX.writeFile(workbook, VOCAB_TEMPLATE_FILE_NAME);
    setEnglishImportMessage('Template Excel berhasil diunduh. Isi sheet template_vocab lalu import kembali.');
  }

  function sanitizeImportedVocabularyRows(rows = []) {
    return (Array.isArray(rows) ? rows : [])
      .map((item) => {
        const theme = slugifyText(item.theme || item.theme_key || item.tema);
        const word = String(item.word || item.kata || '').trim().toLowerCase();
        const translation = String(item.translation || item.arti || item.meaning || '').trim().toLowerCase();
        const sentence = String(item.sentence || item.kalimat || '').trim();

        if (!theme || !word || !translation) {
          return null;
        }

        return {
          theme,
          word,
          translation,
          sentence,
        };
      })
      .filter(Boolean)
      .filter((item, index, list) => list.findIndex((entry) => `${entry.theme}:${entry.word}` === `${item.theme}:${item.word}`) === index);
  }

  function getSessionsByScope(sessions, scope = 'semester') {
    const now = new Date();
    const nowTime = now.getTime();
    const weekStart = getWeekStart(now).getTime();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    if (scope === 'week') {
      return sessions.filter((item) => getSessionTimestamp(item) >= weekStart);
    }
    if (scope === 'month') {
      return sessions.filter((item) => getSessionTimestamp(item) >= monthStart);
    }
    return sessions.filter((item) => getSessionTimestamp(item) <= nowTime);
  }

  function getSessionsForClass(sessions, kelasId = 'all') {
    if (!kelasId || kelasId === 'all') {
      return sessions;
    }
    return sessions.filter((item) => String(item.kelas_id || '') === String(kelasId));
  }

  function updateRecapCards(sessions, weekEl, monthEl, semesterEl) {
    const weekCount = getSessionsByScope(sessions, 'week').length;
    const monthCount = getSessionsByScope(sessions, 'month').length;
    const semesterCount = getSessionsByScope(sessions, 'semester').length;
    if (weekEl) weekEl.textContent = `${weekCount} sesi`;
    if (monthEl) monthEl.textContent = `${monthCount} sesi`;
    if (semesterEl) semesterEl.textContent = `${semesterCount} sesi`;
  }

  function getSelectedSettings() {
    const operations = Array.from(container.querySelectorAll('.game-operation:checked')).map((input) => input.value);
    const quizModes = Array.from(container.querySelectorAll('.game-quiz-mode:checked')).map((input) => input.value);
    return normalizeGameSettings({
      operations,
      quiz_modes: quizModes,
      number_min: container.querySelector('#game-number-min')?.value,
      number_max: container.querySelector('#game-number-max')?.value,
      question_count: container.querySelector('#game-question-count')?.value,
      duration_sec: container.querySelector('#game-duration')?.value,
      mul_number_min: container.querySelector('#game-mul-min')?.value,
      mul_number_max: container.querySelector('#game-mul-max')?.value,
      div_number_min: container.querySelector('#game-div-min')?.value,
      div_number_max: container.querySelector('#game-div-max')?.value,
      max_exponent: container.querySelector('#game-max-exponent')?.value,
      allow_negative: container.querySelector('#game-allow-negative')?.checked,
    });
  }

  function getSelectedEnglishSettings() {
    const themes = getSelectedEnglishThemeKeys();
    const quizModes = Array.from(container.querySelectorAll('.english-quiz-mode:checked')).map((input) => input.value);
    return normalizeVocabularySettings({
      themes,
      quiz_modes: quizModes,
      question_count: container.querySelector('#english-question-count')?.value,
      duration_sec: container.querySelector('#english-duration')?.value,
      difficulty: container.querySelector('#english-difficulty')?.value,
      word_bank: currentEnglishWordBank,
    });
  }

  function applyConfigToForm(config) {
    if (!config) return;

    const settings = normalizeGameSettings(config.settings || {});
    statusSelect.value = config.status || 'draft';

    container.querySelectorAll('.game-operation').forEach((input) => {
      input.checked = settings.operations.includes(input.value);
    });

    container.querySelectorAll('.game-quiz-mode').forEach((input) => {
      input.checked = settings.quiz_modes.includes(input.value);
    });

    container.querySelector('#game-number-min').value = settings.number_min;
    container.querySelector('#game-number-max').value = settings.number_max;
    container.querySelector('#game-question-count').value = settings.question_count;
    container.querySelector('#game-duration').value = settings.duration_sec;
    container.querySelector('#game-mul-min').value = settings.mul_number_min;
    container.querySelector('#game-mul-max').value = settings.mul_number_max;
    container.querySelector('#game-div-min').value = settings.div_number_min;
    container.querySelector('#game-div-max').value = settings.div_number_max;
    container.querySelector('#game-max-exponent').value = settings.max_exponent;
    container.querySelector('#game-allow-negative').checked = settings.allow_negative;
    currentAccessToken = String(config.game_access_token || '').trim();
    currentAccessTokenIssuedAt = String(config.game_access_token_issued_at || '');
    currentAccessTokenExpiresAt = String(config.game_access_token_expires_at || '');
    currentTokenEnabled = config.token_enabled !== false;
    applyTokenEnabledUI();
    if (accessTokenInput) {
      accessTokenInput.value = currentAccessToken;
    }
    if (accessTokenExpiryEl) {
      accessTokenExpiryEl.textContent = currentAccessToken
        ? `Berlaku sampai: ${formatDateTime(currentAccessTokenExpiresAt)}`
        : 'Token belum dibuat.';
    }
    updateOverviewSnapshot(config.status || 'draft', settings, currentAccessToken);
  }

  function applyEnglishConfigToForm(config) {
    if (!config) return;

    const settings = normalizeVocabularySettings(config.settings || {});
    currentEnglishWordBank = Array.isArray(settings.word_bank) ? settings.word_bank : [];
    if (englishStatusSelect) {
      englishStatusSelect.value = config.status || 'draft';
    }

    container.querySelectorAll('.english-theme').forEach((input) => {
      input.checked = settings.themes.includes(input.value);
    });

    container.querySelectorAll('.english-quiz-mode').forEach((input) => {
      input.checked = settings.quiz_modes.includes(input.value);
    });

    container.querySelector('#english-question-count').value = settings.question_count;
    container.querySelector('#english-duration').value = settings.duration_sec;
    container.querySelector('#english-difficulty').value = settings.difficulty;
    updateEnglishOverviewSnapshot(config.status || 'draft', settings);
    renderEnglishWordList();
  }

  function getLocalConfigForAssignment(assignmentId) {
    return readLocalList(LOCAL_CONFIG_KEY).find((item) => item.pengajaran_id === assignmentId && item.game_type === 'math') || null;
  }

  function getLocalEnglishConfigForAssignment(assignmentId) {
    return readLocalList(LOCAL_CONFIG_KEY).find((item) => item.pengajaran_id === assignmentId && item.game_type === 'english_vocab') || null;
  }

  async function fetchRemoteConfig(assignmentId) {
    const docs = await getDocumentsWhere('game_configs', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
      { field: 'pengajaran_id', operator: '==', value: assignmentId },
      { field: 'game_type', operator: '==', value: 'math' },
    ]);
    return docs[0] || null;
  }

  async function fetchRemoteEnglishConfig(assignmentId) {
    const docs = await getDocumentsWhere('game_configs', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
      { field: 'pengajaran_id', operator: '==', value: assignmentId },
      { field: 'game_type', operator: '==', value: 'english_vocab' },
    ]);
    return docs[0] || null;
  }

  async function loadConfig(assignmentId) {
    if (!assignmentId) {
      return;
    }
    const remoteConfig = await fetchRemoteConfig(assignmentId);
    const localConfig = getLocalConfigForAssignment(assignmentId);
    const config = remoteConfig || localConfig;
    if (config) {
      applyConfigToForm(config);
      setMessage(`Konfigurasi aktif: ${config.status === 'published' ? 'Published' : 'Draft'}.`);
    } else {
      form.reset();
      container.querySelector('#game-number-min').value = 1;
      container.querySelector('#game-number-max').value = 20;
      container.querySelector('#game-question-count').value = 10;
      container.querySelector('#game-duration').value = 180;
      container.querySelector('#game-mul-min').value = 1;
      container.querySelector('#game-mul-max').value = 15;
      container.querySelector('#game-div-min').value = 1;
      container.querySelector('#game-div-max').value = 12;
      container.querySelector('#game-max-exponent').value = 3;
      container.querySelectorAll('.game-operation').forEach((input) => {
        input.checked = ['add', 'sub', 'mul', 'div'].includes(input.value);
      });
      container.querySelectorAll('.game-quiz-mode').forEach((input) => {
        input.checked = input.value === 'short_answer';
      });
      currentAccessToken = '';
      currentAccessTokenIssuedAt = '';
      currentAccessTokenExpiresAt = '';
      currentTokenEnabled = true;
      applyTokenEnabledUI();
      if (accessTokenInput) {
        accessTokenInput.value = '';
      }
      if (accessTokenExpiryEl) {
        accessTokenExpiryEl.textContent = 'Token belum dibuat.';
      }
      updateOverviewSnapshot('draft', getSelectedSettings(), '');
      setMessage('Belum ada konfigurasi. Silakan simpan draft baru.');
    }
  }

  async function loadEnglishConfig(assignmentId) {
    if (!assignmentId) {
      return;
    }

    const remoteConfig = await fetchRemoteEnglishConfig(assignmentId);
    const localConfig = getLocalEnglishConfigForAssignment(assignmentId);
    const config = remoteConfig || localConfig;

    if (config) {
      applyEnglishConfigToForm(config);
      setEnglishMessage(`Konfigurasi aktif: ${config.status === 'published' ? 'Published' : 'Draft'}.`);
      return;
    }

    englishForm?.reset();
    currentEnglishWordBank = [];
    container.querySelector('#english-question-count').value = 10;
    container.querySelector('#english-duration').value = 180;
    container.querySelector('#english-difficulty').value = 'basic';
    container.querySelectorAll('.english-theme').forEach((input, index) => {
      input.checked = index === 0;
    });
    container.querySelectorAll('.english-quiz-mode').forEach((input, index) => {
      input.checked = index < 2;
    });
    updateEnglishOverviewSnapshot('draft', getSelectedEnglishSettings());
    renderEnglishWordList();
    setEnglishMessage('Belum ada konfigurasi. Silakan simpan draft baru.');
  }

  // ==========================================================================
  // OPTIMASI READ (Fase 1): monitoring & rekap game membaca `game_sessions`
  // /`game_session_rekap` untuk SATU game_type seluruh semester. Sebelumnya
  // TANPA cache dan dipanggil ulang oleh renderMonitoring + renderRekapTable
  // serta setiap perubahan filter kelas/rentang (yang sebenarnya hanya
  // memfilter di sisi klien). Kini:
  //   1) hasil server di-cache 60 dtk di data-service (cacheMs) → panggilan
  //      berulang dalam jendela itu = 0 read;
  //   2) ditambah cache per-halaman agar filter/tab tidak memicu await ulang.
  // Data sesi ditulis oleh SISWA (bukan halaman ini), jadi staleness 60 dtk
  // pada dashboard pemantauan tidak berdampak pada kebenaran input guru.
  const GAME_SESSION_CACHE_TTL_MS = 60000;
  const gameSessionCache = new Map(); // key: `${collection}:${gameType}` → { at, data }

  function readGameCache(key) {
    const entry = gameSessionCache.get(key);
    if (entry && Date.now() - entry.at < GAME_SESSION_CACHE_TTL_MS) return entry.data;
    return null;
  }

  function writeGameCache(key, data) {
    gameSessionCache.set(key, { at: Date.now(), data });
    return data;
  }

  async function getSessionsForAssignment(assignmentId, gameType = 'math') {
    // Pakai daftar sesi game_type yang sudah dimuat (dan ter-cache), lalu
    // saring per pengajaran di klien — menghindari query terpisah per relasi.
    const all = await getSessionsForGameType(gameType);
    return all.filter((item) => item.pengajaran_id === assignmentId);
  }

  async function getSessionsForGameType(gameType = 'math') {
    const cacheKey = `game_sessions:${gameType}`;
    const cached = readGameCache(cacheKey);
    if (cached) return cached;

    let docs = [];
    try {
      docs = await getDocumentsWhere('game_sessions', [
        { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
        { field: 'semester_id', operator: '==', value: context.semester_aktif },
        { field: 'game_type', operator: '==', value: gameType },
      ], { cacheMs: GAME_SESSION_CACHE_TTL_MS });
    } catch {
      docs = [];
    }

    const assignmentIds = new Set(assignments.map((item) => item.id));
    const local = readLocalList(LOCAL_SESSION_KEY).filter((item) => item.game_type === gameType && assignmentIds.has(item.pengajaran_id));
    const map = new Map();
    [...docs, ...local]
      .filter((item) => assignmentIds.has(item.pengajaran_id))
      .forEach((item) => {
        map.set(item.id, item);
      });
    return writeGameCache(cacheKey, [...map.values()]);
  }

  async function getRekapForGameType(gameType = 'math') {
    const cacheKey = `game_session_rekap:${gameType}`;
    const cached = readGameCache(cacheKey);
    if (cached) return cached;

    let docs = [];
    try {
      docs = await getDocumentsWhere('game_session_rekap', [
        { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
        { field: 'semester_id', operator: '==', value: context.semester_aktif },
        { field: 'game_type', operator: '==', value: gameType },
      ], { cacheMs: GAME_SESSION_CACHE_TTL_MS });
    } catch {
      docs = [];
    }

    const assignmentIds = new Set(assignments.map((item) => item.id));
    return writeGameCache(cacheKey, docs.filter((item) => assignmentIds.has(item.pengajaran_id)));
  }

  function renderTopStudentsList(sessions, targetEl) {
    const byStudent = {};
    sessions.forEach((item) => {
      const key = String(item.siswa_id || '-');
      if (!byStudent[key]) {
        byStudent[key] = {
          name: item.siswa_nama || key,
          attempts: 0,
          score: 0,
        };
      }
      byStudent[key].attempts += 1;
      byStudent[key].score += Number(item.score || 0);
    });

    const top = Object.values(byStudent)
      .map((item) => ({ ...item, avg: item.attempts ? item.score / item.attempts : 0 }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);

    targetEl.innerHTML = top.length
      ? top.map((item, index) => `
          <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p class="text-sm font-semibold text-slate-800">${index + 1}. ${item.name}</p>
            <p class="mt-1 text-xs text-slate-500">Rata-rata skor ${item.avg.toFixed(1)} • ${item.attempts} sesi</p>
          </div>
        `).join('')
      : '<p class="text-sm text-slate-500">Belum ada sesi game untuk relasi ini.</p>';
  }

  async function renderMonitoring(assignmentId) {
    const allSessions = await getSessionsForGameType('math');
    const classId = mathMonitorClassFilterEl?.value || 'all';
    const scope = mathMonitorRangeFilterEl?.value || 'semester';
    const classSessions = getSessionsForClass(allSessions, classId);
    const sessions = getSessionsByScope(classSessions, scope);
    const total = sessions.length;
    const averageScore = total ? sessions.reduce((sum, item) => sum + Number(item.score || 0), 0) / total : 0;
    const averageAccuracy = total ? sessions.reduce((sum, item) => sum + Number(item.accuracy || 0), 0) / total : 0;

    totalSessionsEl.textContent = String(total);
    averageScoreEl.textContent = averageScore.toFixed(1);
    averageAccuracyEl.textContent = `${averageAccuracy.toFixed(1)}%`;
    if (summarySessionsEl) {
      summarySessionsEl.textContent = String(total);
    }
    updateRecapCards(classSessions, mathRecapWeekEl, mathRecapMonthEl, mathRecapSemesterEl);
    renderTopStudentsList(sessions, topStudentsEl);
  }

  async function renderRekapTable() {
    if (!rekapPanelEl || !rekapTableBodyEl) return;

    const allSessions = await getSessionsForGameType('math');
    const classId = rekapClassFilterEl?.value || 'all';
    const scope = rekapRangeFilterEl?.value || 'semester';
    const classSessions = getSessionsForClass(allSessions, classId);
    const rekapDocs = getSessionsByScope(classSessions, scope);

    const byStudent = {};
    rekapDocs.forEach((item) => {
      const key = String(item.siswa_id || '-');
      if (!byStudent[key]) {
        byStudent[key] = {
          name: item.siswa_nama || key,
          attempts: [],
        };
      }
      const correct = Number(item.correct_count || 0);
      const total = Number(item.total_questions || 0);
      const rekapValue = Number(item.score || 0);
      byStudent[key].attempts.push({
        startedAt: item.started_at || item.finished_at || '',
        raw: total ? `${correct}/${total}` : '-',
        rekap: rekapValue,
      });
    });

    const students = Object.values(byStudent)
      .map((item) => ({
        name: item.name,
        attempts: item.attempts.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt))),
      }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));

    const maxAttempts = students.reduce((max, item) => Math.max(max, item.attempts.length), 0);
    const cols = [rekapColN1, rekapColN2, rekapColN3, rekapColN4, rekapColN5];
    cols.forEach((col, idx) => {
      if (col) {
        col.textContent = idx < maxAttempts ? `N${idx + 1}` : '';
        col.classList.toggle('hidden', idx >= maxAttempts);
      }
    });
    if (rekapColAvg) {
      rekapColAvg.textContent = 'Rata-rata skor';
    }

    if (!students.length) {
      rekapTableBodyEl.innerHTML = '';
      rekapEmptyEl?.classList.remove('hidden');
      return;
    }

    rekapEmptyEl?.classList.add('hidden');

    rekapTableBodyEl.innerHTML = students
      .map((student, idx) => {
        const values = student.attempts.map((att) => (currentRekapMode === 'asli' ? att.raw : att.rekap));
        const avg = student.attempts.length
          ? (student.attempts.reduce((sum, att) => sum + att.rekap, 0) / student.attempts.length).toFixed(1)
          : '-';
        const cells = values.map((val) => `<td class="px-4 py-3 text-center tabular-nums">${val}</td>`).join('');
        const emptyCells = Array.from({ length: Math.max(0, 5 - values.length) })
          .map(() => '<td class="px-4 py-3 text-center text-slate-300">-</td>')
          .join('');
        return `
          <tr class="hover:bg-amber-50/60">
            <td class="px-4 py-3 text-xs font-semibold text-slate-500">${idx + 1}</td>
            <td class="px-4 py-3 text-sm font-semibold text-slate-900">${student.name}</td>
            ${cells}
            ${emptyCells}
            <td class="px-4 py-3 text-center text-sm font-semibold text-slate-900">${avg}</td>
          </tr>
        `;
      })
      .join('');
  }

  async function renderEnglishMonitoring(assignmentId) {
    const allSessions = await getSessionsForGameType('english_vocab');
    const classId = englishMonitorClassFilterEl?.value || 'all';
    const scope = englishMonitorRangeFilterEl?.value || 'semester';
    const classSessions = getSessionsForClass(allSessions, classId);
    const sessions = getSessionsByScope(classSessions, scope);
    const total = sessions.length;
    const averageScore = total ? sessions.reduce((sum, item) => sum + Number(item.score || 0), 0) / total : 0;
    const averageAccuracy = total ? sessions.reduce((sum, item) => sum + Number(item.accuracy || 0), 0) / total : 0;

    if (englishTotalSessionsEl) {
      englishTotalSessionsEl.textContent = String(total);
    }
    if (englishAverageScoreEl) {
      englishAverageScoreEl.textContent = averageScore.toFixed(1);
    }
    if (englishAverageAccuracyEl) {
      englishAverageAccuracyEl.textContent = `${averageAccuracy.toFixed(1)}%`;
    }
    if (summarySessionsEl && currentGameKey === 'english_vocab') {
      summarySessionsEl.textContent = String(total);
    }
    updateRecapCards(classSessions, englishRecapWeekEl, englishRecapMonthEl, englishRecapSemesterEl);
    if (englishTopStudentsEl) {
      renderTopStudentsList(sessions, englishTopStudentsEl);
    }
  }

  async function saveConfig(forcePublished = false) {
    const assignment = assignments.find((item) => item.id === currentAssignmentId);
    if (!assignment) {
      setMessage('Relasi mengajar tidak ditemukan.', true);
      return;
    }

    const settings = getSelectedSettings();
    if (!settings.operations.length) {
      setMessage('Pilih minimal satu operasi matematika.', true);
      return;
    }

    if (!settings.quiz_modes.length) {
      setMessage('Pilih minimal satu tipe kuis.', true);
      return;
    }

    const status = forcePublished ? 'published' : (statusSelect?.value || 'draft');
    const configId = `${assignment.id}_math`;

    const payload = {
      id: configId,
      tahun_ajaran_id: context.tahun_ajaran_aktif,
      semester_id: context.semester_aktif,
      pengajaran_id: assignment.id,
      guru_id: assignment.guru_id,
      guru_nama: assignment.guru_nama,
      kelas_id: assignment.kelas_id,
      kelas_nama: assignment.kelas_nama,
      mapel_id: assignment.mapel_id,
      mapel_nama: assignment.mapel_nama,
      game_type: 'math',
      status,
      token_enabled: currentTokenEnabled,
      game_access_token: currentAccessToken || '',
      game_access_token_issued_at: currentAccessTokenIssuedAt || '',
      game_access_token_expires_at: currentAccessTokenExpiresAt || '',
      settings,
      updated_at: new Date().toISOString(),
    };

    try {
      await saveDocument('game_configs', payload, configId);
    } catch (error) {
      console.warn('Simpan Firestore gagal, data disimpan lokal:', error);
    }

    upsertLocalById(LOCAL_CONFIG_KEY, payload);
    statusSelect.value = status;

    const operationNames = settings.operations.map((item) => getOperationLabel(item)).join(', ');
    const quizNames = settings.quiz_modes.map((item) => getQuizTypeLabel(item)).join(', ');

    updateOverviewSnapshot(status, settings, currentAccessToken);
    setMessage(`Konfigurasi ${status === 'published' ? 'published' : 'draft'} tersimpan. Operasi: ${operationNames}. Tipe kuis: ${quizNames}.${currentAccessToken ? ` Token akses: ${currentAccessToken} (berlaku 15 menit)` : ' Token akses belum dibuat.'}`);
  }

  async function saveEnglishConfig(forcePublished = false) {
    const assignment = assignments.find((item) => item.id === currentEnglishAssignmentId);
    if (!assignment) {
      setEnglishMessage('Relasi mengajar tidak ditemukan.', true);
      return;
    }

    const settings = getSelectedEnglishSettings();
    if (!settings.themes.length) {
      setEnglishMessage('Pilih minimal satu tema kosakata.', true);
      return;
    }

    if (!settings.quiz_modes.length) {
      setEnglishMessage('Pilih minimal satu mode kuis.', true);
      return;
    }

    const status = forcePublished ? 'published' : (englishStatusSelect?.value || 'draft');
    const configId = `${assignment.id}_english_vocab`;

    const payload = {
      id: configId,
      tahun_ajaran_id: context.tahun_ajaran_aktif,
      semester_id: context.semester_aktif,
      pengajaran_id: assignment.id,
      guru_id: assignment.guru_id,
      guru_nama: assignment.guru_nama,
      kelas_id: assignment.kelas_id,
      kelas_nama: assignment.kelas_nama,
      mapel_id: assignment.mapel_id,
      mapel_nama: assignment.mapel_nama,
      game_type: 'english_vocab',
      status,
      game_access_token: '',
      game_access_token_issued_at: '',
      game_access_token_expires_at: '',
      settings,
      updated_at: new Date().toISOString(),
    };

    try {
      await saveDocument('game_configs', payload, configId);
    } catch (error) {
      console.warn('Simpan Firestore gagal, data English Vocabulary disimpan lokal:', error);
    }

    upsertLocalById(LOCAL_CONFIG_KEY, payload);
    if (englishStatusSelect) {
      englishStatusSelect.value = status;
    }

    const themeNames = settings.themes.map((item) => getVocabularyThemeLabel(item, settings.word_bank)).join(', ');
    const quizNames = settings.quiz_modes.map((item) => getVocabularyQuizTypeLabel(item)).join(', ');
    updateEnglishOverviewSnapshot(status, settings);
    setEnglishMessage(`Konfigurasi ${status === 'published' ? 'published' : 'draft'} tersimpan. Tema: ${themeNames}. Mode kuis: ${quizNames}. Game ini tidak memerlukan token siswa.`);
  }

  generateTokenBtn?.addEventListener('click', async () => {
    const now = new Date();
    const expires = new Date(now.getTime() + 15 * 60 * 1000);
    currentAccessToken = generateAccessToken(6);
    currentAccessTokenIssuedAt = now.toISOString();
    currentAccessTokenExpiresAt = expires.toISOString();
    currentTokenEnabled = true;
    applyTokenEnabledUI();
    if (accessTokenInput) {
      accessTokenInput.value = currentAccessToken;
    }
    if (accessTokenExpiryEl) {
      accessTokenExpiryEl.textContent = `Berlaku sampai: ${formatDateTime(currentAccessTokenExpiresAt)}`;
    }
    updateOverviewSnapshot(statusSelect?.value || 'draft', getSelectedSettings(), currentAccessToken);
    await saveConfig(false);
    const isPublished = (statusSelect?.value || 'draft') === 'published';
    setMessage(isPublished
      ? `Token ${currentAccessToken} langsung aktif. Siswa dapat memasukkan token ini sekarang.`
      : `Token ${currentAccessToken} tersimpan. Publish game agar siswa bisa memainkannya.`);
  });

  tokenEnabledInput?.addEventListener('change', async (event) => {
    currentTokenEnabled = Boolean(event.target.checked);
    applyTokenEnabledUI();
    if (!currentTokenEnabled) {
      currentAccessToken = '';
      currentAccessTokenIssuedAt = '';
      currentAccessTokenExpiresAt = '';
      if (accessTokenInput) {
        accessTokenInput.value = '';
      }
      if (accessTokenExpiryEl) {
        accessTokenExpiryEl.textContent = 'Token dinonaktifkan.';
      }
      updateOverviewSnapshot(statusSelect?.value || 'draft', getSelectedSettings(), '');
    }
    await saveConfig(false);
    setMessage(currentTokenEnabled
      ? 'Token diaktifkan. Klik Generate Token untuk membuat token baru yang bisa dibagikan.'
      : 'Token dinonaktifkan. Siswa dapat bermain tanpa token.');
  });

  copyTokenBtn?.addEventListener('click', async () => {
    if (!currentAccessToken) {
      setMessage('Belum ada token untuk disalin.', true);
      return;
    }
    try {
      await navigator.clipboard.writeText(currentAccessToken);
      setMessage(`Token ${currentAccessToken} disalin ke clipboard.`);
    } catch {
      setMessage(`Token: ${currentAccessToken}`);
    }
  });

  battleForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const assignment = assignments.find((item) => item.id === battleAssignmentEl?.value) || selectedAssignment;
    if (!assignment) {
      setBattleMessage('Pilih relasi kelas terlebih dahulu.', true);
      return;
    }
    const count = Number(container.querySelector('#battle-question-count')?.value || 10);
    const timePerQuestion = Number(container.querySelector('#battle-time-per-question')?.value || 20);
    const gameType = battleGameTypeEl?.value || 'math';
    const operation = container.querySelector('#battle-operation')?.value || 'mixed';
    const operations = operation === 'mixed' ? ['add', 'sub', 'mul'] : [operation];
    const vocabTheme = container.querySelector('#battle-vocab-theme')?.value || 'school';
    const vocabMode = container.querySelector('#battle-vocab-mode')?.value || 'meaning_choice';
    const mathSettings = normalizeGameSettings({ operations, question_count: count, number_min: 1, number_max: 20, quiz_modes: ['multiple_choice'] });
    const vocabSettings = normalizeVocabularySettings({ themes: [vocabTheme], question_count: count, quiz_modes: vocabMode === 'mixed' ? ['meaning_choice', 'reverse_choice', 'sentence_fill'] : [vocabMode] });
    const questions = gameType === 'english_vocab'
      ? (vocabMode === 'mixed'
        ? vocabSettings.quiz_modes.flatMap((mode) => generateVocabularyQuestions({ ...vocabSettings, question_count: Math.ceil(count / vocabSettings.quiz_modes.length) }, mode)).slice(0, count).map((question, index) => ({ ...question, order: index + 1 }))
        : generateVocabularyQuestions(vocabSettings, vocabMode))
      : generateMathQuestions(mathSettings, 'multiple_choice');
    const room = {
      id: `battle_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      code: getBattleRoomCode(),
      title: container.querySelector('#battle-title')?.value?.trim() || (gameType === 'english_vocab' ? 'English Vocabulary Battle' : 'Battle Review Kelas'),
      game_type: 'battle',
      battle_game_type: gameType,
      subject_label: gameType === 'english_vocab' ? 'English Vocabulary' : 'Matematika',
      battle_settings: gameType === 'english_vocab' ? vocabSettings : mathSettings,
      mode: 'individual',
      status: 'waiting',
      current_question: 0,
      time_per_question: timePerQuestion,
      questions,
      participants: {},
      guru_id: userId,
      guru_nama: session?.user?.nama || 'Guru',
      kelas_id: assignment.kelas_id || '',
      kelas_nama: assignment.kelas_nama || '',
      pengajaran_id: assignment.id,
      tahun_ajaran_id: context.tahun_ajaran_aktif,
      semester_id: context.semester_aktif,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    saveBattleRoom(room);
    renderBattleRoom(room);
    setBattleMessage('Room siap. Bagikan kode kepada siswa di kelas.');
    stopBattlePolling();
    battleUnsubscribe = window.firebaseDb?.collection('battle_rooms').doc(room.id)
      .onSnapshot((snapshot) => {
        if (!snapshot.exists) return;
        const roomData = snapshot.data() || {};
        const nextRoom = {
          id: snapshot.id,
          ...roomData,
          participants: activeBattleRoom?.participants || roomData.participants || {},
        };
        upsertLocalById(BATTLE_ROOM_LOCAL_KEY, nextRoom);
        renderBattleRoom(nextRoom);
      }, () => {
        battleUnsubscribe = null;
        if (!battlePollId) {
          battlePollId = setInterval(() => {
            if (!document.hidden) refreshBattleRoom();
          }, 15000);
        }
      });
    battleParticipantsUnsubscribe = window.firebaseDb?.collection('battle_participants')
      .where('room_id', '==', room.id)
      .onSnapshot((snapshot) => {
        if (!activeBattleRoom) return;
        // Hemat read: proses HANYA dokumen yang berubah (added/modified/removed),
        // bukan membangun ulang seluruh peta peserta dari snapshot.docs. Saat 30
        // siswa aktif menjawab, ini memangkas beban dari kuadratik (~N x N) menjadi
        // linear (~N). Peserta yang keluar (removed) ikut dibersihkan.
        const participants = { ...(activeBattleRoom.participants || {}) };
        snapshot.docChanges().forEach((change) => {
          const data = change.doc.data() || {};
          const id = data.participant_id || change.doc.id;
          if (change.type === 'removed') {
            delete participants[id];
          } else {
            participants[id] = { id, ...data };
          }
        });
        activeBattleRoom = { ...activeBattleRoom, participants };
        upsertLocalById(BATTLE_ROOM_LOCAL_KEY, activeBattleRoom);
        renderBattleRoom(activeBattleRoom);
      }, () => {
        battleParticipantsUnsubscribe = null;
        if (!battlePollId) {
          battlePollId = setInterval(() => {
            if (!document.hidden) refreshBattleRoom();
          }, 15000);
        }
      });
  });

  battleCopyCodeBtn?.addEventListener('click', async () => {
    if (!activeBattleRoom?.code) return;
    try { await navigator.clipboard.writeText(activeBattleRoom.code); } catch {}
    setBattleMessage(`Kode room ${activeBattleRoom.code} berhasil disalin.`);
  });

  battleStartBtn?.addEventListener('click', () => {
    if (!activeBattleRoom) return;
    activeBattleRoom = { ...activeBattleRoom, status: 'live', started_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    saveBattleRoom(activeBattleRoom);
    renderBattleRoom(activeBattleRoom);
    setBattleMessage('Battle dimulai. Siswa sekarang dapat menjawab.');
  });

  battleFinishBtn?.addEventListener('click', () => {
    if (!activeBattleRoom) return;
    activeBattleRoom = { ...activeBattleRoom, status: 'finished', finished_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    saveBattleRoom(activeBattleRoom);
    renderBattleRoom(activeBattleRoom);
    setBattleMessage('Battle diakhiri. Leaderboard final tersimpan.');
    stopBattlePolling();
  });

  workspaceTabs.forEach((button) => {
    button.addEventListener('click', () => {
      setWorkspaceTab(button.getAttribute('data-workspace-tab') || 'overview');
      if (button.getAttribute('data-workspace-tab') === 'rekap') {
        renderRekapTable();
      }
    });
  });

  rekapSubtabAsliBtn?.addEventListener('click', () => {
    currentRekapMode = 'asli';
    rekapSubtabAsliBtn.className = 'rekap-subtab rounded-xl border border-amber-300 bg-amber-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition';
    rekapSubtabRekapBtn.className = 'rekap-subtab rounded-xl border border-amber-200 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-200/80';
    renderRekapTable();
  });

  rekapSubtabRekapBtn?.addEventListener('click', () => {
    currentRekapMode = 'rekap';
    rekapSubtabRekapBtn.className = 'rekap-subtab rounded-xl border border-amber-300 bg-amber-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition';
    rekapSubtabAsliBtn.className = 'rekap-subtab rounded-xl border border-amber-200 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-200/80';
    renderRekapTable();
  });

  rekapClassFilterEl?.addEventListener('change', renderRekapTable);
  rekapRangeFilterEl?.addEventListener('change', renderRekapTable);

  gameCards.forEach((card) => {
    card.addEventListener('click', () => {
      const nextKey = card.getAttribute('data-game-card') || 'math';
      const shouldReveal = !hasGameSelection;
      hasGameSelection = true;
      setGameSettingsVisibility(true, shouldReveal);
      setActiveGame(nextKey, true);
      gameSettingsSectionEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  gameBackToCatalogBtn?.addEventListener('click', () => {
    hasGameSelection = false;
    setGameSettingsVisibility(false);
    setActiveGame('');
    gameCatalogSectionEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  assignmentSelect?.addEventListener('change', async (event) => {
    currentAssignmentId = event.target.value;
    await loadConfig(currentAssignmentId);
    await renderMonitoring(currentAssignmentId);
  });

  englishAssignmentSelect?.addEventListener('change', async (event) => {
    currentEnglishAssignmentId = event.target.value;
    await loadEnglishConfig(currentEnglishAssignmentId);
    await renderEnglishMonitoring(currentEnglishAssignmentId);
  });

  mathMonitorClassFilterEl?.addEventListener('change', async () => {
    await renderMonitoring(currentAssignmentId);
  });

  mathMonitorRangeFilterEl?.addEventListener('change', async () => {
    await renderMonitoring(currentAssignmentId);
  });

  englishMonitorClassFilterEl?.addEventListener('change', async () => {
    await renderEnglishMonitoring(currentEnglishAssignmentId);
  });

  englishMonitorRangeFilterEl?.addEventListener('change', async () => {
    await renderEnglishMonitoring(currentEnglishAssignmentId);
  });

  container.querySelectorAll('.english-theme, .english-quiz-mode, #english-question-count, #english-duration, #english-difficulty').forEach((element) => {
    element.addEventListener('change', () => {
      updateEnglishOverviewSnapshot(englishStatusSelect?.value || 'draft', getSelectedEnglishSettings());
      renderEnglishWordList();
    });
  });

  englishDownloadTemplateBtn?.addEventListener('click', () => {
    downloadVocabularyTemplate();
  });

  englishResetWordBankBtn?.addEventListener('click', () => {
    currentEnglishWordBank = [];
    renderEnglishWordList();
    updateEnglishOverviewSnapshot(englishStatusSelect?.value || 'draft', getSelectedEnglishSettings());
    setEnglishImportMessage('Bank kosakata dikembalikan ke daftar default berdasarkan tema yang dipilih.');
  });

  englishImportFileEl?.addEventListener('change', async (event) => {
    const [file] = Array.from(event.target.files || []);
    if (!file) {
      return;
    }
    if (!window.XLSX) {
      setEnglishImportMessage('Library Excel belum tersedia di browser.', true);
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: '' });
      const importedWords = sanitizeImportedVocabularyRows(rows);

      if (!importedWords.length) {
        setEnglishImportMessage('File tidak berisi baris kosakata yang valid. Gunakan template yang disediakan.', true);
        return;
      }

      currentEnglishWordBank = importedWords;
      const importedThemes = [...new Set(importedWords.map((item) => item.theme))];
      container.querySelectorAll('.english-theme').forEach((input) => {
        input.checked = importedThemes.includes(input.value);
      });
      renderEnglishWordList();
      updateEnglishOverviewSnapshot(englishStatusSelect?.value || 'draft', getSelectedEnglishSettings());
      setEnglishImportMessage(`${importedWords.length} kosakata berhasil diimport dari file ${file.name}. Simpan konfigurasi untuk menerapkan perubahan.`);
    } catch (error) {
      console.warn('Gagal memproses file Excel vocabulary:', error);
      setEnglishImportMessage('File gagal dibaca. Pastikan format mengikuti template Excel.', true);
    } finally {
      event.target.value = '';
    }
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveConfig(false);
    await renderMonitoring(currentAssignmentId);
  });

  container.querySelector('#publish-now-btn')?.addEventListener('click', async () => {
    await saveConfig(true);
    await renderMonitoring(currentAssignmentId);
  });

  englishForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveEnglishConfig(false);
    await renderEnglishMonitoring(currentEnglishAssignmentId);
  });

  container.querySelector('#english-publish-now-btn')?.addEventListener('click', async () => {
    await saveEnglishConfig(true);
    await renderEnglishMonitoring(currentEnglishAssignmentId);
  });

  englishWorkspaceTabs.forEach((button) => {
    button.addEventListener('click', () => {
      setEnglishWorkspaceTab(button.getAttribute('data-english-tab') || 'overview');
    });
  });

  updateWorkspaceHeader();
  setGameSettingsVisibility(false);
  setActiveGame('math');
  setActiveGame('');
  setWorkspaceTab('overview');
  setEnglishWorkspaceTab('overview');
  await loadConfig(currentAssignmentId);
  await renderMonitoring(currentAssignmentId);
  await loadEnglishConfig(currentEnglishAssignmentId);
  renderEnglishWordList();
  await renderEnglishMonitoring(currentEnglishAssignmentId);

  if (battleAssignmentEl && selectedAssignment) battleAssignmentEl.value = selectedAssignment.id;

  container.routeCleanup = () => {
    stopBattlePolling();
  };

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
