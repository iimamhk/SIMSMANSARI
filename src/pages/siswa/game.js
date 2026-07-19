import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import { getActiveTeachingAssignments, getDocumentsWhere, saveDocument } from '../../firebase/data-service.js';
import { quizTypes, generateMathQuestions, evaluateMathSession, normalizeGameSettings, getOperationCatalog } from '../../utils/math-game.js';
import { vocabularyQuizTypes, generateVocabularyQuestions, evaluateVocabularySession, normalizeVocabularySettings, getVocabularyThemeLabel } from '../../utils/vocab-game.js';

const LOCAL_CONFIG_KEY = 'simguru_game_configs_local';
const LOCAL_SESSION_KEY = 'simguru_game_sessions_local';
const LOCAL_TOKEN_KEY = 'simguru_game_tokens_local';
const BATTLE_ROOM_LOCAL_KEY = 'simguru_battle_rooms_local';
const BATTLE_AVATARS = [
  { key: 'comet', label: 'Kometa', seed: 'simguru-comet' },
  { key: 'sprout', label: 'Tunas', seed: 'simguru-sprout' },
  { key: 'pixel', label: 'Pixel', seed: 'simguru-pixel' },
  { key: 'bubbles', label: 'Bubbles', seed: 'simguru-bubbles' },
  { key: 'rocket', label: 'Roket', seed: 'simguru-rocket' },
  { key: 'sunny', label: 'Sunny', seed: 'simguru-sunny' },
  { key: 'orbit', label: 'Orbit', seed: 'simguru-orbit' },
  { key: 'berry', label: 'Berry', seed: 'simguru-berry' },
];
const BATTLE_LOBBY_PHRASES = [
  { label: 'P Info', icon: '📣', tone: 'do' },
  { label: 'Ngopi Yuks', icon: '☕', tone: 're' },
  { label: 'Bakal Savage nih bos!', icon: '🔥', tone: 'mi' },
  { label: 'Semangat!', icon: '🎺', tone: 'fa' },
  { label: 'Gas terus!', icon: '🚀', tone: 'sol' },
  { label: 'Fokus dulu!', icon: '🎯', tone: 'la' },
];
const BATTLE_LOBBY_NOTES = [
  { key: 'do', label: 'Do', frequency: 261.63 },
  { key: 're', label: 'Re', frequency: 293.66 },
  { key: 'mi', label: 'Mi', frequency: 329.63 },
  { key: 'fa', label: 'Fa', frequency: 349.23 },
  { key: 'sol', label: 'Sol', frequency: 392 },
  { key: 'la', label: 'La', frequency: 440 },
  { key: 'si', label: 'Si', frequency: 493.88 },
];

function getBattleAvatarUrl(seed) {
  return `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
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

function getDateKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function normalizeClass(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSameClass(a, b) {
  const one = normalizeClass(a);
  const two = normalizeClass(b);
  return Boolean(one && two && one === two);
}

function getOperationLabel(operation) {
  return getOperationCatalog()[operation]?.label || operation;
}

function getVocabularyQuizTypeLabel(type) {
  return vocabularyQuizTypes[type] || type;
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

function getGameOverlayMarkup() {
  return `
    <section id="student-game-overlay" class="fixed inset-0 z-[120] hidden overflow-hidden sg-overlay">
      <div class="sg-blob sg-blob-1"></div>
      <div class="sg-blob sg-blob-2"></div>
      <div class="sg-blob sg-blob-3"></div>
      <div class="relative z-[1] flex h-[100dvh] w-full flex-col">
        <div class="glass-panel flex items-center justify-between gap-3 px-4 py-3 sm:px-6" style="padding-top: calc(0.75rem + env(safe-area-inset-top));">
          <div class="min-w-0">
            <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/90">Mode Fokus Penuh</p>
            <p id="student-game-overlay-title" class="mt-1 truncate text-base font-semibold text-white">Game Center</p>
          </div>
          <button id="student-game-overlay-back-btn" type="button" class="sg-btn sg-btn-ghost inline-flex items-center gap-2 px-4 py-2 text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-4 w-4 stroke-current" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span>Kembali</span>
          </button>
        </div>
        <div id="student-game-overlay-body" class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6" style="padding-bottom: calc(1rem + env(safe-area-inset-bottom));"></div>
      </div>
      <section id="battle-lobby-overlay" class="battle-lobby-overlay hidden" aria-label="Lobi Quiz Battle">
        <div class="battle-lobby-stars"></div>
        <div class="battle-lobby-shell">
          <header class="battle-lobby-header">
            <div class="min-w-0">
              <p class="battle-lobby-kicker">LOBI KELAS</p>
              <h2 id="battle-arena-title" class="truncate text-xl font-black text-white">Battle Kelas</h2>
              <p id="battle-arena-subtitle" class="mt-1 text-xs text-indigo-100/75">Avatar kamu sedang berkumpul di arena</p>
            </div>
            <div class="flex items-center gap-2">
              <div class="battle-room-chip"><span>KODE</span><strong id="battle-arena-code">------</strong></div>
              <button id="battle-arena-back-btn" type="button" class="sg-btn sg-btn-ghost px-3 py-2 text-xs">Keluar</button>
            </div>
          </header>
          <div class="battle-arena-stage">
            <div class="battle-arena-sign"><span class="text-2xl">⚡</span><div><p class="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-200">CLASSROOM ARENA</p><p class="text-sm font-black text-white">Siap untuk battle?</p></div></div>
            <div class="battle-arena-platform"></div>
            <div id="battle-arena-players" class="battle-arena-players"></div>
            <div id="battle-arena-countdown" class="battle-arena-countdown hidden">3</div>
          </div>
          <footer class="battle-lobby-footer">
            <div><p id="battle-arena-status" class="text-sm font-bold text-white">Menunggu guru memulai...</p><p id="battle-arena-player-count" class="mt-1 text-xs text-indigo-100/70">0 pemain di arena</p></div>
            <div id="battle-soundboard" class="battle-soundboard">
              <p class="battle-soundboard-label">Soundboard lobi <span id="battle-soundboard-cooldown"></span></p>
              <div id="battle-soundboard-buttons" class="battle-soundboard-buttons"></div>
            </div>
          </footer>
        </div>
      </section>
    </section>
  `;
}

export async function renderSiswaGamePage(container) {
  const context = getStoredContext();
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const user = session?.user || {};
  const studentGameCatalog = [
    {
      key: 'math',
      title: 'Matematika Cepat',
      description: 'Latihan hitung cepat dengan token guru dan pilihan mode kuis.',
      access: 'Token Guru',
      accentClass: 'from-emerald-500 to-cyan-500',
      tileClass: 'from-emerald-500 via-teal-500 to-cyan-500',
      iconGlyph: '∑',
    },
    {
      key: 'english_vocab',
      title: 'English Vocabulary',
      description: 'Latihan kosakata bahasa Inggris berdasarkan tema tanpa token tambahan.',
      access: 'Tanpa Token',
      accentClass: 'from-sky-500 to-blue-500',
      tileClass: 'from-fuchsia-500 via-violet-500 to-indigo-500',
      iconGlyph: 'Aa',
    },
    {
      key: 'battle',
      title: 'Quiz Battle Kelas',
      description: 'Masuk ke room kelas dan berlomba menjawab soal dengan cepat dan tepat.',
      access: 'Kode Room',
      accentClass: 'from-violet-600 to-fuchsia-500',
      tileClass: 'from-violet-600 via-indigo-600 to-fuchsia-600',
      iconGlyph: '⚡',
    },
  ];

  const html = renderLayout('Game Center Siswa', `
    <div class="space-y-6">
      <section id="game-hero" class="overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-900 via-sky-900 to-cyan-800 p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div class="grid gap-5 xl:grid-cols-[1.2fr_0.8fr] xl:items-start">
          <div class="space-y-4">
            <p class="text-xs font-semibold uppercase tracking-[0.26em] text-cyan-100">Game Center Siswa</p>
            <div>
              <h2 class="text-3xl font-semibold tracking-tight">Pilih game dan mulai bermain</h2>
              <p class="mt-3 max-w-2xl text-sm leading-6 text-cyan-50/85">Semua game kelas aktif tersedia di satu tempat.</p>
            </div>
          </div>
          <div class="grid gap-3 sm:grid-cols-3 xl:grid-cols-2">
            <div class="rounded-[28px] border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
              <p class="text-xs uppercase tracking-[0.18em] text-cyan-100">Mode Aktif</p>
              <p id="student-active-game-label" class="mt-3 text-xl font-semibold text-white">Matematika Cepat</p>
            </div>
            <div class="rounded-[28px] border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
              <p class="text-xs uppercase tracking-[0.18em] text-cyan-100">Akses</p>
              <p id="student-active-access-label" class="mt-3 text-xl font-semibold text-white">Token Guru</p>
            </div>
            <div class="rounded-[28px] border border-white/10 bg-white/10 p-4 backdrop-blur-sm xl:col-span-2">
              <p class="text-xs uppercase tracking-[0.18em] text-cyan-100">Ringkas</p>
              <p class="mt-3 text-sm leading-6 text-cyan-50/90">Pilih game, main, lihat hasil.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="game-selection-view" class="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div class="space-y-4">
          <div id="game-workspace-panel" class="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p class="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">Akses Game</p>
                <h3 id="student-workspace-title" class="mt-2 text-2xl font-semibold text-slate-900">Arena Matematika Cepat</h3>
                <p id="student-workspace-caption" class="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Atur akses, mulai sesi, lalu cek hasil.</p>
              </div>
              <div id="student-workspace-badge" class="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Siap dimainkan</div>
            </div>
          </div>

          <div id="game-card-grid" class="grid grid-cols-2 gap-4">
            ${studentGameCatalog.map((game, index) => `
              <button type="button" data-student-game-card="${game.key}" class="student-game-card group relative overflow-hidden rounded-[30px] bg-gradient-to-br ${game.tileClass} p-4 text-left text-white shadow-[0_16px_32px_rgba(15,23,42,0.2)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(15,23,42,0.28)] ${index === 0 ? 'ring-2 ring-white/80' : ''}">
                <div class="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/25 blur-2xl"></div>
                <div class="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-white/20 blur-2xl"></div>
                <div class="relative">
                  <div class="mb-3 flex items-start justify-between gap-2">
                    <div class="flex h-16 w-16 items-center justify-center rounded-[20px] bg-white/20 text-3xl font-extrabold shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-sm">${game.iconGlyph}</div>
                    <span class="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/95">${game.access}</span>
                  </div>
                  <p class="text-base font-semibold leading-tight">${game.title}</p>
                  <p class="mt-1 text-xs leading-5 text-white/90">${game.key === 'math' ? 'Hitung cepat dengan mode kuis.' : 'Kuis kosakata berdasarkan tema.'}</p>
                </div>
              </button>
            `).join('')}
          </div>

          <section id="game-lobby" class="hidden space-y-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Lobby</p>
                <h4 id="student-lobby-title" class="mt-1 text-xl font-semibold text-slate-900">Siapkan sesi</h4>
              </div>
              <div class="flex items-center gap-2">
                <div id="student-lobby-note" class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">Pilih mode lalu mulai.</div>
                <button id="student-lobby-back-btn" type="button" class="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-4 w-4 stroke-current" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  <span>Pilih Game</span>
                </button>
              </div>
            </div>

              <div id="battle-generic-config-controls" class="grid gap-3 md:grid-cols-2">
              <div>
                <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Konfigurasi Kelas</label>
                <select id="game-config-select" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"></select>
              </div>
              <div>
                <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tipe Kuis</label>
                <select id="quiz-type-select" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"></select>
              </div>
            </div>

            <div id="config-summary" class="rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"></div>

            <div id="battle-student-panel" class="hidden space-y-4 rounded-[24px] border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-4">
              <details class="group rounded-2xl border border-violet-100 bg-white/80 p-4">
                <summary class="cursor-pointer list-none text-sm font-semibold text-violet-900">Panduan bermain <span class="float-right text-violet-500 transition group-open:rotate-180">⌄</span></summary>
                <div class="mt-3 space-y-2 text-xs leading-5 text-violet-900/75"><p>1. Masukkan kode room dari guru.</p><p>2. Tunggu guru memulai battle.</p><p>3. Pilih satu jawaban. Skor dipengaruhi benar dan cepat.</p><p>4. Setelah selesai, lihat posisi dan pembahasan.</p></div>
              </details>
              <div id="battle-avatar-picker" class="rounded-2xl border border-violet-100 bg-white/80 p-4">
                <div class="flex flex-wrap items-end justify-between gap-2"><div><p class="text-xs font-semibold uppercase tracking-[0.14em] text-violet-700">Pilih avatar kamu</p><p class="mt-1 text-xs text-slate-500">Avatar akan tampil di lobi kelas.</p></div><span id="battle-avatar-label" class="text-xs font-semibold text-violet-600">Belum dipilih</span></div>
                <div id="battle-avatar-options" class="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8"></div>
              </div>
              <div id="battle-join-controls" class="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><label class="text-xs font-semibold uppercase tracking-[0.12em] text-violet-700">Kode room<input id="battle-room-input" maxlength="6" autocomplete="off" class="mt-2 w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-lg font-black uppercase tracking-[0.2em] text-slate-900" placeholder="ABC123" /></label><button id="battle-join-btn" type="button" class="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-700/20 hover:bg-violet-800">Gabung room</button></div>
              <div id="battle-lobby-view" class="hidden space-y-4 rounded-2xl border border-violet-200 bg-white p-4">
                <div class="flex flex-wrap items-center justify-between gap-3"><div><p class="text-xs font-semibold uppercase tracking-[0.14em] text-violet-600">Lobi kelas</p><p id="battle-lobby-room-title" class="mt-1 text-lg font-bold text-slate-900">Menunggu peserta</p></div><div class="rounded-full bg-violet-100 px-3 py-1.5 text-xs font-bold text-violet-700"><span id="battle-lobby-count">0</span> pemain</div></div>
                <div id="battle-lobby-participants" class="grid grid-cols-2 gap-2 sm:grid-cols-3"></div>
                <div class="border-t border-slate-100 pt-3"><p id="battle-ready-status" class="text-xs text-slate-500">Avatar kamu sudah masuk arena. Gunakan soundboard sambil menunggu guru.</p></div>
              </div>
              <div id="battle-student-status" class="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm text-slate-600">Belum terhubung ke room.</div>
            </div>

            <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div id="game-token-panel" class="rounded-[24px] border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
                <p class="font-semibold text-slate-800">Masukkan Token Dari Guru</p>
                <p class="mt-1 text-xs text-slate-500">Token harus valid dan belum kedaluwarsa.</p>
                <input id="game-access-token-input" type="text" maxlength="12" class="mt-3 w-full max-w-[320px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em]" placeholder="Contoh: A7K9P2" />
              </div>
              <div class="flex flex-wrap items-center gap-3">
                <button id="start-game-btn" type="button" class="rounded-2xl bg-[#007AFF] px-5 py-3 text-sm font-semibold text-white hover:bg-[#0063CC]">Mulai Main</button>
                <p id="game-message" class="text-sm text-slate-500"></p>
              </div>
            </div>
          </section>

          <section id="game-play" class="hidden">
            <div class="mx-auto max-w-3xl space-y-5">
              <div class="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-[28px] px-5 py-4">
                <div class="min-w-0">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/90">Sesi Game</p>
                  <p class="mt-1 text-sm font-semibold text-white">Soal <span id="question-counter">1/10</span></p>
                </div>
                <p id="timer-pill" class="sg-timer-pill inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-4 w-4 stroke-current" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="13" r="8" />
                    <path d="M12 9v4l2 2M9 2h6" />
                  </svg>
                  <span>Sisa waktu: <span id="timer-text">00:00</span></span>
                </p>
              </div>

              <div class="sg-progress-track">
                <div id="question-progress" class="sg-progress-fill" style="width: 0%;"></div>
              </div>

              <div class="sg-question-card p-6 sm:p-8">
                <div class="flex items-center gap-3">
                  <span class="inline-flex items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-500 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-sm" id="question-operation">Operasi</span>
                  <span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Soal <span id="question-index-label">1</span></span>
                </div>
                <p id="question-prompt" class="mt-5 text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">...</p>
              </div>

              <div id="answer-area" class="space-y-3"></div>

              <div id="question-nav" class="grid grid-cols-5 gap-2 sm:grid-cols-10"></div>

              <div class="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div class="flex flex-wrap items-center gap-3">
                  <button id="prev-question-btn" type="button" class="sg-btn sg-btn-ghost">Sebelumnya</button>
                  <button id="next-question-btn" type="button" class="sg-btn sg-btn-primary">Simpan & Lanjut</button>
                </div>
                <div class="hidden h-9 w-px bg-white/30 sm:block"></div>
                <button id="finish-game-btn" type="button" class="sg-btn sg-btn-finish sm:ml-auto">Selesai Sekarang</button>
              </div>
            </div>
          </section>

          <section id="game-result" class="hidden">
            <div class="mx-auto max-w-3xl space-y-5">
              <div class="sg-result-card p-6 sm:p-8">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Hasil Game</p>
                    <h4 class="mt-1 text-2xl font-semibold text-slate-900">Hasil permainan</h4>
                  </div>
                  <div class="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Tersimpan</div>
                </div>

                <div class="mt-5 grid gap-3 sm:grid-cols-3">
                  <div class="rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-center">
                    <p class="text-xs uppercase tracking-[0.12em] text-slate-500">Skor</p>
                    <p id="result-score" class="mt-2 text-3xl font-semibold text-slate-900">0</p>
                  </div>
                  <div class="rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-center">
                    <p class="text-xs uppercase tracking-[0.12em] text-slate-500">Akurasi</p>
                    <p id="result-accuracy" class="mt-2 text-3xl font-semibold text-slate-900">0%</p>
                  </div>
                  <div class="rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-center">
                    <p class="text-xs uppercase tracking-[0.12em] text-slate-500">Benar / Salah</p>
                    <p id="result-correct" class="mt-2 text-3xl font-semibold text-slate-900">0/0</p>
                  </div>
                </div>

                <div class="mt-5">
                  <p id="result-analysis-label" class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Analisis Operasi</p>
                  <div id="result-by-operation" class="mt-2 space-y-2"></div>
                </div>
              </div>

              <div class="flex flex-wrap items-center justify-center gap-3">
                <button id="play-again-btn" type="button" class="sg-btn sg-btn-accent">Main Lagi</button>
              </div>
            </div>
          </section>
        </div>

      </section>
    </div>
  `);

  container.innerHTML = html;

  const existingOverlay = document.getElementById('student-game-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }
  document.body.insertAdjacentHTML('beforeend', getGameOverlayMarkup());

  const configSelect = container.querySelector('#game-config-select');
  const quizTypeSelect = container.querySelector('#quiz-type-select');
  const summaryEl = container.querySelector('#config-summary');
  const messageEl = container.querySelector('#game-message');
  const accessTokenInput = container.querySelector('#game-access-token-input');
  const tokenPanelEl = container.querySelector('#game-token-panel');
  const gameCards = Array.from(container.querySelectorAll('[data-student-game-card]'));
  const heroEl = container.querySelector('#game-hero');
  const selectionViewEl = container.querySelector('#game-selection-view');
  const workspacePanelEl = container.querySelector('#game-workspace-panel');
  const cardGridEl = container.querySelector('#game-card-grid');
  const activeGameLabelEl = container.querySelector('#student-active-game-label');
  const activeAccessLabelEl = container.querySelector('#student-active-access-label');
  const workspaceTitleEl = container.querySelector('#student-workspace-title');
  const workspaceCaptionEl = container.querySelector('#student-workspace-caption');
  const workspaceBadgeEl = container.querySelector('#student-workspace-badge');
  const lobbyNoteEl = container.querySelector('#student-lobby-note');
  const lobbyTitleEl = container.querySelector('#student-lobby-title');
  const lobbyBackBtn = container.querySelector('#student-lobby-back-btn');
  const resultAnalysisLabelEl = container.querySelector('#result-analysis-label');
  const battleStudentPanelEl = container.querySelector('#battle-student-panel');
  const battleRoomInputEl = container.querySelector('#battle-room-input');
  const battleJoinBtn = container.querySelector('#battle-join-btn');
  const battleStudentStatusEl = container.querySelector('#battle-student-status');
  const battleAvatarOptionsEl = container.querySelector('#battle-avatar-options');
  const battleAvatarLabelEl = container.querySelector('#battle-avatar-label');
  const battleJoinControlsEl = container.querySelector('#battle-join-controls');
  const battleLobbyViewEl = container.querySelector('#battle-lobby-view');
  const battleLobbyRoomTitleEl = container.querySelector('#battle-lobby-room-title');
  const battleLobbyCountEl = container.querySelector('#battle-lobby-count');
  const battleLobbyParticipantsEl = container.querySelector('#battle-lobby-participants');
  const battleReadyStatusEl = container.querySelector('#battle-ready-status');
  const battleLobbyOverlayEl = document.getElementById('battle-lobby-overlay');
  const battleArenaTitleEl = document.getElementById('battle-arena-title');
  const battleArenaSubtitleEl = document.getElementById('battle-arena-subtitle');
  const battleArenaCodeEl = document.getElementById('battle-arena-code');
  const battleArenaPlayersEl = document.getElementById('battle-arena-players');
  const battleArenaStatusEl = document.getElementById('battle-arena-status');
  const battleArenaPlayerCountEl = document.getElementById('battle-arena-player-count');
  const battleArenaBackBtn = document.getElementById('battle-arena-back-btn');
  const battleArenaCountdownEl = document.getElementById('battle-arena-countdown');
  const battleSoundboardButtonsEl = document.getElementById('battle-soundboard-buttons');
  const battleSoundboardCooldownEl = document.getElementById('battle-soundboard-cooldown');

  const lobbyEl = container.querySelector('#game-lobby');
  const playEl = container.querySelector('#game-play');
  const resultEl = container.querySelector('#game-result');
  const startGameBtn = container.querySelector('#start-game-btn');
  const nextQuestionBtn = playEl?.querySelector('#next-question-btn');
  const prevQuestionBtn = playEl?.querySelector('#prev-question-btn');
  const finishGameBtn = playEl?.querySelector('#finish-game-btn');
  const questionNavEl = playEl?.querySelector('#question-nav');
  const playAgainBtn = resultEl?.querySelector('#play-again-btn');

  const overlayEl = document.getElementById('student-game-overlay');
  const overlayBodyEl = document.getElementById('student-game-overlay-body');
  const overlayTitleEl = document.getElementById('student-game-overlay-title');
  const overlayBackBtn = document.getElementById('student-game-overlay-back-btn');

  const counterEl = container.querySelector('#question-counter');
  const timerEl = container.querySelector('#timer-text');
  const timerPillEl = container.querySelector('#timer-pill');
  const promptEl = container.querySelector('#question-prompt');
  const operationEl = container.querySelector('#question-operation');
  const answerArea = container.querySelector('#answer-area');

  const scoreEl = container.querySelector('#result-score');
  const accuracyEl = container.querySelector('#result-accuracy');
  const correctEl = container.querySelector('#result-correct');
  const byOperationEl = container.querySelector('#result-by-operation');

  let allPublishedConfigs = [];
  let publishedConfigs = [];
  let activeConfig = null;
  let gameState = null;
  let timerId = null;
  let tokenState = null;
  let currentGameType = 'math';
  let battleRoom = null;
  let battlePollId = null;
  let battleTimerId = null;
  let battleQuestionStartedAt = 0;
  let selectedBattleAvatar = BATTLE_AVATARS[0];
  let battleArenaMotionId = null;
  let battleArenaLastRoomStatus = '';
  let battleSoundboardCooldownUntil = 0;
  let battleSoundboardCooldownId = null;
  if (overlayBodyEl && playEl && resultEl) {
    overlayBodyEl.append(playEl, resultEl);
  }

  function getCurrentGameMeta() {
    return studentGameCatalog.find((item) => item.key === currentGameType) || studentGameCatalog[0];
  }

  function setMessage(text, isError = false) {
    messageEl.textContent = text;
    messageEl.className = isError ? 'text-sm text-rose-600' : 'text-sm text-slate-500';
  }

  function openGameOverlay() {
    overlayEl?.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  function closeGameOverlay() {
    overlayEl?.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }

  function updateWorkspaceMeta() {
    const meta = getCurrentGameMeta();
    if (activeGameLabelEl) {
      activeGameLabelEl.textContent = meta.title;
    }
    if (activeAccessLabelEl) {
      activeAccessLabelEl.textContent = meta.access;
    }
    if (overlayTitleEl) {
      overlayTitleEl.textContent = meta.title;
    }
    if (workspaceTitleEl) {
      workspaceTitleEl.textContent = currentGameType === 'battle' ? 'Arena Quiz Battle Kelas' : currentGameType === 'english_vocab' ? 'Arena English Vocabulary' : 'Arena Matematika Cepat';
    }
    if (workspaceCaptionEl) {
      workspaceCaptionEl.textContent = currentGameType === 'battle'
        ? 'Masuk ke room, tunggu host, lalu jawab secepat dan setepat mungkin.'
        : currentGameType === 'english_vocab'
        ? 'Pilih tema, mainkan kuis, lalu cek kata yang perlu diulang.'
        : 'Masukkan token, mulai sesi, lalu cek hasil.';
    }
    if (workspaceBadgeEl) {
      workspaceBadgeEl.textContent = meta.access;
      workspaceBadgeEl.className = currentGameType === 'english_vocab'
        ? 'rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-700'
        : 'rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-700';
    }
    if (lobbyNoteEl) {
      lobbyNoteEl.textContent = currentGameType === 'english_vocab'
        ? 'Pilih mode lalu mulai tanpa token.'
        : 'Pilih mode lalu masukkan token.';
    }
    if (lobbyTitleEl) {
      lobbyTitleEl.textContent = currentGameType === 'battle' ? 'Lobby Quiz Battle Kelas' : currentGameType === 'english_vocab' ? 'Lobby English Vocabulary' : 'Lobby Matematika Cepat';
    }
    if (tokenPanelEl) {
      const tokenEnabled = activeConfig ? activeConfig.token_enabled !== false : (currentGameType === 'math');
      tokenPanelEl.classList.toggle('hidden', currentGameType === 'english_vocab' || !tokenEnabled);
    }
    battleStudentPanelEl?.classList.toggle('hidden', currentGameType !== 'battle');
    startGameBtn?.classList.toggle('hidden', currentGameType === 'battle');
    if (resultAnalysisLabelEl) {
      resultAnalysisLabelEl.textContent = currentGameType === 'english_vocab' ? 'Analisis Tema & Review Kata' : 'Analisis Operasi';
    }
  }

  function refreshPublishedConfigsForGame() {
    publishedConfigs = allPublishedConfigs.filter((item) => item.game_type === currentGameType);
    configSelect.innerHTML = publishedConfigs.length
      ? publishedConfigs.map((item) => `<option value="${item.id}">${item.kelas_nama || '-'} • ${item.mapel_nama || '-'} • ${item.guru_nama || '-'}</option>`).join('')
      : `<option value="">Belum ada game ${currentGameType === 'english_vocab' ? 'English Vocabulary' : 'matematika'} published</option>`;

    activeConfig = publishedConfigs[0] || null;
    renderConfigSummary(activeConfig);
    renderQuizTypeOptions(activeConfig);
    if (accessTokenInput) {
      accessTokenInput.value = '';
    }
    updateWorkspaceMeta();
    setMessage(activeConfig ? 'Konfigurasi game siap dimainkan.' : 'Guru belum mem-publish game untuk kelas ini.', !activeConfig);
  }

  function setActiveGameType(gameType) {
    currentGameType = gameType;
    gameCards.forEach((card) => {
      const isActive = card.getAttribute('data-student-game-card') === gameType;
      card.classList.toggle('ring-2', isActive);
      card.classList.toggle('ring-white/80', isActive);
    });
    refreshPublishedConfigsForGame();
    updateWorkspaceMeta();
  }

  function formatTime(sec) {
    const total = Math.max(0, Number(sec || 0));
    const m = String(Math.floor(total / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function readBattleRooms() {
    try { return JSON.parse(localStorage.getItem(BATTLE_ROOM_LOCAL_KEY) || '[]'); } catch { return []; }
  }

  function saveBattleRoomLocal(room) {
    const rooms = readBattleRooms();
    const index = rooms.findIndex((item) => item.id === room.id);
    if (index >= 0) rooms[index] = room; else rooms.push(room);
    localStorage.setItem(BATTLE_ROOM_LOCAL_KEY, JSON.stringify(rooms));
    saveDocument('battle_rooms', room, room.id).catch(() => {});
  }

  function saveBattleParticipant(room, participant) {
    const payload = { ...participant, id: `${room.id}_${participant.id}`, participant_id: participant.id, room_id: room.id, room_code: room.code, updated_at: new Date().toISOString() };
    saveDocument('battle_participants', payload, `${room.id}_${participant.id}`).catch(() => {});
  }

  function renderBattleAvatarPicker() {
    if (!battleAvatarOptionsEl) return;
    battleAvatarOptionsEl.innerHTML = BATTLE_AVATARS.map((avatar) => `<button type="button" data-battle-avatar="${avatar.key}" class="battle-avatar-option ${selectedBattleAvatar.key === avatar.key ? 'is-selected' : ''}" title="${avatar.label}"><img src="${getBattleAvatarUrl(avatar.seed)}" alt="Avatar ${avatar.label}" loading="lazy" /><span>${avatar.label}</span></button>`).join('');
    battleAvatarOptionsEl.querySelectorAll('[data-battle-avatar]').forEach((button) => button.addEventListener('click', () => {
      selectedBattleAvatar = BATTLE_AVATARS.find((avatar) => avatar.key === button.dataset.battleAvatar) || BATTLE_AVATARS[0];
      renderBattleAvatarPicker();
      if (battleAvatarLabelEl) battleAvatarLabelEl.textContent = selectedBattleAvatar.label;
    }));
  }

  function renderBattleLobby(room) {
    if (!room) return;
    openGameOverlay();
    const participants = Object.values(room.participants || {}).sort((left, right) => String(left.nama || '').localeCompare(String(right.nama || '')));
    battleLobbyViewEl?.classList.remove('hidden');
    battleJoinControlsEl?.classList.add('hidden');
    if (battleLobbyRoomTitleEl) battleLobbyRoomTitleEl.textContent = room.title || 'Battle Kelas';
    if (battleLobbyCountEl) battleLobbyCountEl.textContent = String(participants.length);
    if (battleLobbyParticipantsEl) {
      battleLobbyParticipantsEl.innerHTML = participants.length
        ? participants.map((participant) => {
          const avatar = BATTLE_AVATARS.find((item) => item.key === participant.avatar_key) || BATTLE_AVATARS[0];
          return `<div class="battle-lobby-player ${participant.ready ? 'is-ready' : ''}"><img src="${getBattleAvatarUrl(participant.avatar_seed || avatar.seed)}" alt="Avatar ${participant.nama || 'Siswa'}" /><div class="min-w-0"><p class="truncate text-xs font-bold text-slate-800">${participant.nama || 'Siswa'}</p><p class="text-[10px] text-slate-500">${participant.ready ? 'Siap bermain' : 'Memilih avatar'}</p></div></div>`;
        }).join('')
        : '<p class="col-span-full rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center text-xs text-slate-500">Menunggu teman-teman masuk...</p>';
    }
    const currentParticipant = getBattleParticipant(room);
    if (battleReadyStatusEl) battleReadyStatusEl.textContent = currentParticipant?.ready ? 'Kamu sudah siap. Tunggu guru memulai.' : 'Pilih avatar lalu tekan siap.';
    if (battleReadyStatusEl && currentParticipant?.ready) battleReadyStatusEl.textContent = 'Kamu sudah siap. Gunakan soundboard sambil menunggu guru.';
    renderBattleArena(room);
  }

  function renderBattleArena(room) {
    if (!battleArenaPlayersEl || !room) return;
    const participants = Object.values(room.participants || {});
    if (battleArenaTitleEl) battleArenaTitleEl.textContent = room.title || 'Battle Kelas';
    if (battleArenaSubtitleEl) battleArenaSubtitleEl.textContent = `${room.subject_label || (room.battle_game_type === 'english_vocab' ? 'English Vocabulary' : 'Matematika')} • Avatar kamu sedang berkumpul di arena`;
    if (battleArenaCodeEl) battleArenaCodeEl.textContent = room.code || '------';
    if (battleArenaPlayerCountEl) battleArenaPlayerCountEl.textContent = `${participants.length} pemain di arena`;
    if (battleArenaStatusEl) battleArenaStatusEl.textContent = room.status === 'live' ? 'Battle dimulai!' : 'Menunggu guru memulai...';
    battleArenaPlayersEl.innerHTML = participants.map((participant, index) => {
      const avatar = BATTLE_AVATARS.find((item) => item.key === participant.avatar_key) || BATTLE_AVATARS[0];
      const left = 12 + ((index * 23) % 76);
      const bottom = 14 + ((index * 17) % 35);
      const delay = (index * 0.55).toFixed(2);
      return `<div class="battle-arena-player ${participant.ready ? 'is-ready' : ''}" data-arena-player="${participant.id}" style="left:${left}%;bottom:${bottom}%;--walk-delay:${delay}s"><div class="battle-arena-nameplate"><span>${participant.nama || 'Siswa'}</span>${participant.ready ? '<b>SIAP</b>' : ''}</div><img src="${getBattleAvatarUrl(participant.avatar_seed || avatar.seed)}" alt="Avatar ${participant.nama || 'Siswa'}" /></div>`;
    }).join('');
    renderBattleSoundboard();
    if (room.status === 'waiting') {
      battleLobbyOverlayEl?.classList.remove('hidden');
      document.body.classList.add('overflow-hidden');
    }
  }

  function closeBattleArena() {
    battleLobbyOverlayEl?.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    stopBattleArenaMotion();
    if (battleSoundboardCooldownId) window.clearTimeout(battleSoundboardCooldownId);
    battleSoundboardCooldownId = null;
  }

  function stopBattleArenaMotion() {
    if (battleArenaMotionId) cancelAnimationFrame(battleArenaMotionId);
    battleArenaMotionId = null;
  }

  function startBattleArenaMotion() {
    if (battleArenaMotionId) return;
    const tick = (time) => {
      document.querySelectorAll('#battle-arena-players .battle-arena-player').forEach((player, index) => {
        const drift = Math.sin((time / 1800) + index) * 1.7;
        player.style.transform = `translate(${drift}px, ${Math.cos((time / 1400) + index) * 2}px)`;
      });
      battleArenaMotionId = requestAnimationFrame(tick);
    };
    battleArenaMotionId = requestAnimationFrame(tick);
  }

  function playLocalBattleTone(noteKey) {
    const note = BATTLE_LOBBY_NOTES.find((item) => item.key === noteKey) || BATTLE_LOBBY_NOTES[0];
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audio = new AudioContextClass();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = note.frequency;
      gain.gain.setValueAtTime(0.08, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.32);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.32);
    } catch {}
  }

  function showBattleFloatingText(label, icon) {
    if (!battleArenaPlayersEl) return;
    const player = battleArenaPlayersEl.querySelector(`[data-arena-player="${CSS.escape(getBattleStudentId())}"]`) || battleArenaPlayersEl.querySelector('.battle-arena-player');
    const bubble = document.createElement('div');
    bubble.className = 'battle-floating-cheer';
    bubble.textContent = `${icon} ${label}`;
    if (player) player.append(bubble); else battleArenaPlayersEl.append(bubble);
    window.setTimeout(() => bubble.remove(), 1800);
  }

  function updateBattleSoundboardCooldown() {
    const remaining = Math.max(0, battleSoundboardCooldownUntil - Date.now());
    if (battleSoundboardCooldownEl) battleSoundboardCooldownEl.textContent = remaining ? `• tunggu ${Math.ceil(remaining / 1000)} detik` : '• pilih kata atau nada';
    battleSoundboardButtonsEl?.querySelectorAll('button').forEach((button) => { button.disabled = remaining > 0; });
    if (remaining) battleSoundboardCooldownId = window.setTimeout(updateBattleSoundboardCooldown, 1000);
  }

  function renderBattleSoundboard() {
    if (!battleSoundboardButtonsEl) return;
    const phraseButtons = BATTLE_LOBBY_PHRASES.map((item) => `<button type="button" data-sound-label="${item.label}" data-sound-icon="${item.icon}" data-sound-tone="${item.tone}" class="battle-sound-button">${item.icon} ${item.label}</button>`).join('');
    const noteButtons = BATTLE_LOBBY_NOTES.map((item) => `<button type="button" data-sound-note="${item.key}" class="battle-note-button">${item.label}</button>`).join('');
    battleSoundboardButtonsEl.innerHTML = `${phraseButtons}${noteButtons}`;
    battleSoundboardButtonsEl.querySelectorAll('[data-sound-label]').forEach((button) => button.addEventListener('click', () => {
      if (battleSoundboardCooldownUntil > Date.now()) return;
      playLocalBattleTone(button.dataset.soundTone);
      showBattleFloatingText(button.dataset.soundLabel, button.dataset.soundIcon);
      battleSoundboardCooldownUntil = Date.now() + 30000;
      updateBattleSoundboardCooldown();
    }));
    battleSoundboardButtonsEl.querySelectorAll('[data-sound-note]').forEach((button) => button.addEventListener('click', () => {
      if (battleSoundboardCooldownUntil > Date.now()) return;
      playLocalBattleTone(button.dataset.soundNote);
      const note = BATTLE_LOBBY_NOTES.find((item) => item.key === button.dataset.soundNote);
      showBattleFloatingText(note?.label || 'Nada', '🎵');
      battleSoundboardCooldownUntil = Date.now() + 30000;
      updateBattleSoundboardCooldown();
    }));
    updateBattleSoundboardCooldown();
  }

  function setBattleStudentStatus(text, isError = false) {
    if (!battleStudentStatusEl) return;
    battleStudentStatusEl.textContent = text;
    battleStudentStatusEl.className = isError
      ? 'rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'
      : 'rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm text-slate-600';
  }

  function getBattleStudentId() {
    return user.username || user.id || user.nis || 'siswa';
  }

  function getBattleParticipant(room) {
    return room?.participants?.[getBattleStudentId()] || null;
  }

  async function fetchBattleRoom() {
    if (!battleRoom) return null;
    const localRoom = readBattleRooms().find((item) => item.id === battleRoom.id || item.code === battleRoom.code);
    if (localRoom) battleRoom = localRoom;
    try {
      const docs = await getDocumentsWhere('battle_rooms', [{ field: 'code', operator: '==', value: battleRoom.code }]);
      if (docs[0]) {
        const remoteUpdatedAt = new Date(docs[0].updated_at || 0).getTime();
        const localUpdatedAt = new Date(battleRoom.updated_at || 0).getTime();
        if (remoteUpdatedAt >= localUpdatedAt) battleRoom = docs[0];
        localStorage.setItem(BATTLE_ROOM_LOCAL_KEY, JSON.stringify(readBattleRooms().filter((item) => item.id !== battleRoom.id).concat(battleRoom)));
      }
      const participantDocs = await getDocumentsWhere('battle_participants', [{ field: 'room_id', operator: '==', value: battleRoom.id }]);
      if (participantDocs.length) {
        battleRoom = { ...battleRoom, participants: participantDocs.reduce((result, item) => ({ ...result, [item.id?.replace(`${battleRoom.id}_`, '') || item.participant_id || item.id]: item }), { ...(battleRoom.participants || {}) }) };
      }
    } catch {}
    return battleRoom;
  }

  function getBattleIndex(room) {
    if (!room?.started_at) return -1;
    return Math.floor(Math.max(0, Date.now() - new Date(room.started_at).getTime()) / (Number(room.time_per_question || 20) * 1000));
  }

  function getBattleRemainingMs(room, index) {
    if (!room?.started_at) return 0;
    const durationMs = Number(room.time_per_question || 20) * 1000;
    const questionStartedAt = new Date(room.started_at).getTime() + (index * durationMs);
    return Math.max(0, durationMs - (Date.now() - questionStartedAt));
  }

  function getBattlePoints(room, outcome, index) {
    if (outcome === 'correct') {
      const durationMs = Number(room.time_per_question || 20) * 1000;
      const speedBonus = Math.round((getBattleRemainingMs(room, index) / durationMs) * 100);
      return { points: 100 + Math.max(0, Math.min(100, speedBonus)), speed_bonus: speedBonus };
    }
    if (outcome === 'wrong') return { points: -20, speed_bonus: 0 };
    return { points: -8, speed_bonus: 0 };
  }

  function applyBattleMissedQuestions() {
    if (!battleRoom || battleRoom.status !== 'live') return;
    const participant = getBattleParticipant(battleRoom);
    if (!participant) return;
    const currentIndex = getBattleIndex(battleRoom);
    const scoreEvents = { ...(participant.score_events || {}) };
    let changed = false;
    let nextScore = Number(participant.score || 0);
    for (let index = 0; index < currentIndex && index < battleRoom.questions.length; index += 1) {
      const question = battleRoom.questions[index];
      const eventKey = String(question.order);
      if (scoreEvents[eventKey] || participant.answers?.[question.order] !== undefined) continue;
      const scoring = getBattlePoints(battleRoom, 'unanswered', index);
      nextScore = Math.max(0, nextScore + scoring.points);
      scoreEvents[eventKey] = { outcome: 'unanswered', points: scoring.points, speed_bonus: 0, scored_at: new Date().toISOString() };
      changed = true;
    }
    if (!changed) return;
    const updatedParticipant = { ...participant, score: nextScore, score_events: scoreEvents, last_seen_at: new Date().toISOString() };
    battleRoom = { ...battleRoom, participants: { ...(battleRoom.participants || {}), [getBattleStudentId()]: updatedParticipant }, updated_at: new Date().toISOString() };
    saveBattleRoomLocal(battleRoom);
    saveBattleParticipant(battleRoom, updatedParticipant);
  }

  function renderBattleQuestion(index) {
    const question = battleRoom?.questions?.[index];
    if (!question) return;
    gameState = { ...(gameState || {}), battle: true, currentIndex: index, questions: battleRoom.questions, answers: getBattleParticipant(battleRoom)?.answers || {} };
    counterEl.textContent = `${index + 1}/${battleRoom.questions.length}`;
    promptEl.textContent = question.prompt;
    promptEl.classList.toggle('text-3xl', battleRoom.battle_game_type === 'english_vocab');
    operationEl.textContent = battleRoom.battle_game_type === 'english_vocab' ? `Vocabulary • ${question.theme_label || 'English'}` : `Ronde ${index + 1}`;
    battleQuestionStartedAt = Date.now();
    answerArea.innerHTML = (question.options || []).map((option, optionIndex) => `<button type="button" data-battle-answer="${option}" class="sg-battle-choice group flex w-full items-center gap-3 rounded-2xl border border-white/40 bg-white/90 px-4 py-4 text-left text-base font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-400 hover:bg-violet-50"><span class="sg-battle-choice-letter flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-xs font-bold text-violet-700">${String.fromCharCode(65 + optionIndex)}</span><span class="min-w-0 flex-1">${option}</span><span class="sg-battle-choice-mark hidden rounded-full bg-violet-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">Dipilih</span></button>`).join('');
    const answered = getBattleParticipant(battleRoom)?.answers?.[question.order];
    if (answered !== undefined) answerArea.querySelectorAll('[data-battle-answer]').forEach((button) => {
      const isSelected = String(button.dataset.battleAnswer) === String(answered);
      button.disabled = true;
      button.classList.toggle('is-selected', isSelected);
      button.querySelector('.sg-battle-choice-mark')?.classList.toggle('hidden', !isSelected);
    });
    answerArea.querySelectorAll('[data-battle-answer]').forEach((button) => button.addEventListener('click', () => {
      answerArea.querySelectorAll('[data-battle-answer]').forEach((item) => {
        item.classList.remove('is-selected');
        item.querySelector('.sg-battle-choice-mark')?.classList.add('hidden');
      });
      button.classList.add('is-selected');
      button.querySelector('.sg-battle-choice-mark')?.classList.remove('hidden');
      submitBattleAnswer(question, button.dataset.battleAnswer);
    }));
  }

  function renderBattleResult() {
    const participant = getBattleParticipant(battleRoom) || {};
    const participants = Object.values(battleRoom?.participants || {}).sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    const rank = Math.max(0, participants.findIndex((item) => item.id === getBattleStudentId())) + 1;
    scoreEl.textContent = String(participant.score || 0);
    accuracyEl.textContent = `${participant.correct || 0}/${battleRoom?.questions?.length || 0}`;
    correctEl.textContent = rank ? `Peringkat ${rank}` : 'Selesai';
    resultAnalysisLabelEl.textContent = 'Leaderboard Battle';
    byOperationEl.innerHTML = participants.length ? participants.slice(0, 10).map((item, index) => `<div class="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><span class="text-sm font-semibold text-slate-800">${index + 1}. ${item.nama || 'Siswa'}</span><span class="text-sm font-bold text-violet-700">${Number(item.score || 0)} pt</span></div>`).join('') : '<p class="text-sm text-slate-500">Leaderboard belum tersedia.</p>';
    openResult();
  }

  async function submitBattleAnswer(question, rawAnswer) {
    if (!battleRoom || !question) return;
    const participant = getBattleParticipant(battleRoom) || { id: getBattleStudentId(), nama: user.nama || 'Siswa', score: 0, correct: 0, wrong: 0, answers: {}, score_events: {}, joined_at: new Date().toISOString() };
    if (participant.answers?.[question.order] !== undefined) return;
    const isEnglishBattle = battleRoom.battle_game_type === 'english_vocab';
    const answer = isEnglishBattle ? String(rawAnswer || '').trim().toLowerCase() : Number(rawAnswer);
    const correct = isEnglishBattle
      ? answer === String(question.answer || '').trim().toLowerCase()
      : answer === Number(question.answer);
    const questionIndex = Math.max(0, battleRoom.questions.findIndex((item) => item.order === question.order));
    const scoreEvents = { ...(participant.score_events || {}) };
    if (scoreEvents[String(question.order)]) return;
    const scoring = getBattlePoints(battleRoom, correct ? 'correct' : 'wrong', questionIndex);
    const updatedParticipant = {
      ...participant,
      answers: { ...(participant.answers || {}), [question.order]: rawAnswer },
      score_events: { ...scoreEvents, [String(question.order)]: { outcome: correct ? 'correct' : 'wrong', points: scoring.points, speed_bonus: scoring.speed_bonus, scored_at: new Date().toISOString() } },
      correct: Number(participant.correct || 0) + (correct ? 1 : 0),
      wrong: Number(participant.wrong || 0) + (correct ? 0 : 1),
      score: Math.max(0, Number(participant.score || 0) + scoring.points),
      last_seen_at: new Date().toISOString(),
    };
    battleRoom = { ...battleRoom, participants: { ...(battleRoom.participants || {}), [getBattleStudentId()]: updatedParticipant }, updated_at: new Date().toISOString() };
    saveBattleRoomLocal(battleRoom);
    saveBattleParticipant(battleRoom, updatedParticipant);
    answerArea.querySelectorAll('[data-battle-answer]').forEach((button) => {
      const isSelected = String(button.dataset.battleAnswer) === String(rawAnswer);
      button.disabled = true;
      button.classList.toggle('is-selected', isSelected);
      button.classList.toggle('is-correct', isSelected && correct);
      button.classList.toggle('is-incorrect', isSelected && !correct);
      button.querySelector('.sg-battle-choice-mark')?.classList.toggle('hidden', !isSelected);
      if (isSelected) button.querySelector('.sg-battle-choice-mark').textContent = correct ? 'Benar' : 'Dipilih';
    });
    setBattleStudentStatus(correct ? `Benar! +${scoring.points} poin (${scoring.speed_bonus} bonus cepat)` : `Belum tepat. ${scoring.points} poin. Jawaban benar: ${question.correct_label || question.answer}`);
    if (correct) playBattleTone(880); else playBattleTone(180);
  }

  function playBattleTone(frequency) {
    try { const AudioContextClass = window.AudioContext || window.webkitAudioContext; const audio = new AudioContextClass(); const oscillator = audio.createOscillator(); const gain = audio.createGain(); oscillator.frequency.value = frequency; gain.gain.setValueAtTime(0.06, audio.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.18); oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + 0.18); } catch {}
  }

  async function syncBattle() {
    if (!battleRoom) return;
    await fetchBattleRoom();
    const participant = getBattleParticipant(battleRoom);
    if (battleRoom.status === 'waiting') {
      renderBattleLobby(battleRoom);
      setBattleStudentStatus(`Terhubung ke ${battleRoom.title || 'battle'}. Menunggu guru memulai...`);
      return;
    }
    if (battleRoom.status === 'finished') { closeBattleArena(); renderBattleResult(); return; }
    applyBattleMissedQuestions();
    if (battleRoom.status === 'live' && battleArenaLastRoomStatus !== 'live') {
      battleArenaLastRoomStatus = 'live';
      if (battleArenaCountdownEl) {
        battleArenaCountdownEl.classList.remove('hidden');
        let count = 3;
        battleArenaCountdownEl.textContent = String(count);
        const countdownId = setInterval(() => {
          count -= 1;
          if (count <= 0) {
            clearInterval(countdownId);
            battleArenaCountdownEl.classList.add('hidden');
            closeBattleArena();
            openPlay();
          } else {
            battleArenaCountdownEl.textContent = String(count);
            battleArenaCountdownEl.animate([{ transform: 'scale(0.65)', opacity: 0.2 }, { transform: 'scale(1)', opacity: 1 }], { duration: 320, easing: 'ease-out' });
          }
        }, 850);
      } else {
        closeBattleArena();
      }
      return;
    }
    openPlay();
    const index = getBattleIndex(battleRoom);
    if (index >= battleRoom.questions.length) { renderBattleResult(); return; }
    if (gameState?.currentIndex !== index || !gameState?.battle) renderBattleQuestion(index);
    const elapsed = Math.floor((Date.now() - new Date(battleRoom.started_at).getTime()) / 1000) % Number(battleRoom.time_per_question || 20);
    timerEl.textContent = formatTime(Number(battleRoom.time_per_question || 20) - elapsed);
    setBattleStudentStatus(`Soal ${index + 1} aktif. Jawab sebelum waktu habis.`);
  }

  function getTokenDocId(configId) {
    return `${configId}_${user.username || user.id || 'siswa'}_${getDateKey()}`;
  }

  function getLocalToken(configId) {
    const id = getTokenDocId(configId);
    return readLocalList(LOCAL_TOKEN_KEY).find((item) => item.id === id) || null;
  }

  function upsertLocalToken(payload) {
    const list = readLocalList(LOCAL_TOKEN_KEY);
    const index = list.findIndex((item) => item.id === payload.id);
    if (index >= 0) {
      list[index] = payload;
    } else {
      list.push(payload);
    }
    saveLocalList(LOCAL_TOKEN_KEY, list);
  }

  function getRemainingCooldownSec(lastPlayAt, cooldownSec) {
    if (!lastPlayAt) {
      return 0;
    }
    const elapsed = Math.floor((Date.now() - new Date(lastPlayAt).getTime()) / 1000);
    return Math.max(0, Number(cooldownSec || 0) - elapsed);
  }

  function renderTokenInfo() {}

  function openLobby() {
    heroEl?.classList.add('hidden');
    workspacePanelEl?.classList.add('hidden');
    cardGridEl?.classList.add('hidden');
    lobbyEl.classList.remove('hidden');
    playEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    closeGameOverlay();
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    if (battlePollId) {
      clearInterval(battlePollId);
      battlePollId = null;
    }
    if (battleTimerId) {
      clearInterval(battleTimerId);
      battleTimerId = null;
    }
  }

  function openPlay() {
    heroEl?.classList.add('hidden');
    workspacePanelEl?.classList.add('hidden');
    cardGridEl?.classList.add('hidden');
    lobbyEl.classList.add('hidden');
    playEl.classList.remove('hidden');
    resultEl.classList.add('hidden');
    openGameOverlay();
  }

  function openResult() {
    heroEl?.classList.add('hidden');
    workspacePanelEl?.classList.add('hidden');
    cardGridEl?.classList.add('hidden');
    lobbyEl.classList.add('hidden');
    playEl.classList.add('hidden');
    resultEl.classList.remove('hidden');
    openGameOverlay();
  }

  function openGameSelection() {
    heroEl?.classList.remove('hidden');
    workspacePanelEl?.classList.remove('hidden');
    cardGridEl?.classList.remove('hidden');
    lobbyEl.classList.add('hidden');
    playEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    closeGameOverlay();
    setMessage('');
  }

  function renderConfigSummary(config) {
    if (!config) {
      summaryEl.innerHTML = '<p class="text-sm text-slate-500">Belum ada konfigurasi game untuk kelas Anda.</p>';
      return;
    }
    if (config.game_type === 'english_vocab') {
      const settings = normalizeVocabularySettings(config.settings || {});
      const themes = settings.themes.map((item) => getVocabularyThemeLabel(item, settings.word_bank)).join(', ');
      const quizModes = settings.quiz_modes.map((item) => getVocabularyQuizTypeLabel(item)).join(', ');

      summaryEl.innerHTML = `
        <p><span class="font-semibold text-slate-800">Status:</span> <span class="text-emerald-700 font-semibold">${config.status}</span></p>
        <p class="mt-1"><span class="font-semibold text-slate-800">Tema:</span> ${themes}</p>
        <p class="mt-1"><span class="font-semibold text-slate-800">Mode kuis:</span> ${quizModes}</p>
        <p class="mt-1"><span class="font-semibold text-slate-800">Jumlah soal:</span> ${settings.question_count} • <span class="font-semibold text-slate-800">Durasi:</span> ${settings.duration_sec} detik</p>
        <p class="mt-1"><span class="font-semibold text-slate-800">Akses:</span> Langsung tersedia tanpa token</p>
      `;
      return;
    }

    const settings = normalizeGameSettings(config.settings || {});
    const operations = settings.operations.map((item) => getOperationLabel(item)).join(', ');
    const quizModes = settings.quiz_modes.map((item) => quizTypes[item]).join(', ');

    const tokenEnabled = config.token_enabled !== false;
    const tokenLine = !tokenEnabled
      ? 'Dimatikan — main tanpa token'
      : (config.game_access_token ? `Aktif sampai ${formatDateTime(config.game_access_token_expires_at)}` : 'Belum dibuat guru');

    summaryEl.innerHTML = `
      <p><span class="font-semibold text-slate-800">Status:</span> <span class="text-emerald-700 font-semibold">${config.status}</span></p>
      <p class="mt-1"><span class="font-semibold text-slate-800">Operasi:</span> ${operations}</p>
      <p class="mt-1"><span class="font-semibold text-slate-800">Tipe kuis:</span> ${quizModes}</p>
      <p class="mt-1"><span class="font-semibold text-slate-800">Jumlah soal:</span> ${settings.question_count} • <span class="font-semibold text-slate-800">Durasi:</span> ${settings.duration_sec} detik</p>
      <p class="mt-1"><span class="font-semibold text-slate-800">Token akses:</span> ${tokenLine}</p>
    `;
  }

  async function loadTokenState(config) {
    if (!config) {
      tokenState = null;
      renderTokenInfo();
      return;
    }

    const settings = normalizeGameSettings(config.settings || {});
    const dateKey = getDateKey();
    const tokenDocId = getTokenDocId(config.id);

    let remoteToken = null;
    try {
      const docs = await getDocumentsWhere('game_tokens', [
        { field: 'config_id', operator: '==', value: config.id },
        { field: 'siswa_id', operator: '==', value: user.username || user.id || '' },
        { field: 'date_key', operator: '==', value: dateKey },
      ]);
      remoteToken = docs[0] || null;
    } catch {
      remoteToken = null;
    }

    const localToken = getLocalToken(config.id);
    const source = remoteToken || localToken;

    const spent = Number(source?.spent_count || 0);
    tokenState = {
      id: tokenDocId,
      config_id: config.id,
      siswa_id: user.username || user.id || '',
      siswa_nama: user.nama || 'Siswa',
      date_key: dateKey,
      spent_count: spent,
      remaining_tokens: Math.max(0, Number(settings.token_daily_quota) - spent),
      last_play_at: source?.last_play_at || null,
      updated_at: new Date().toISOString(),
    };

    renderTokenInfo();
  }

  async function consumeToken(config) {
    if (!config || !tokenState) {
      return { ok: false, message: 'Token tidak tersedia.' };
    }

    const settings = normalizeGameSettings(config.settings || {});
    const remainCooldown = getRemainingCooldownSec(tokenState.last_play_at, settings.cooldown_sec);
    if (remainCooldown > 0) {
      return { ok: false, message: `Cooldown aktif. Tunggu ${remainCooldown} detik.` };
    }

    if (tokenState.remaining_tokens <= 0) {
      return { ok: false, message: 'Token habis untuk hari ini.' };
    }

    const spent = tokenState.spent_count + 1;
    const payload = {
      ...tokenState,
      spent_count: spent,
      remaining_tokens: Math.max(0, Number(settings.token_daily_quota) - spent),
      last_play_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      await saveDocument('game_tokens', payload, payload.id);
    } catch (error) {
      console.warn('Gagal menyimpan token ke Firestore:', error);
    }

    upsertLocalToken(payload);
    tokenState = payload;
    renderTokenInfo();
    return { ok: true };
  }

  function renderQuizTypeOptions(config) {
    if (!config) {
      quizTypeSelect.innerHTML = '<option value="">Tidak tersedia</option>';
      return;
    }
    if (config.game_type === 'english_vocab') {
      const settings = normalizeVocabularySettings(config.settings || {});
      quizTypeSelect.innerHTML = settings.quiz_modes
        .map((type) => `<option value="${type}">${getVocabularyQuizTypeLabel(type)}</option>`)
        .join('');
      return;
    }
    const settings = normalizeGameSettings(config.settings || {});
    quizTypeSelect.innerHTML = settings.quiz_modes
      .map((type) => `<option value="${type}">${quizTypes[type] || type}</option>`)
      .join('');
  }

  function renderQuestion() {
    if (!gameState) {
      return;
    }

    const current = gameState.questions[gameState.currentIndex];
    counterEl.textContent = `${gameState.currentIndex + 1}/${gameState.questions.length}`;
    const indexLabelEl = document.getElementById('question-index-label');
    if (indexLabelEl) {
      indexLabelEl.textContent = String(gameState.currentIndex + 1);
    }
    const progressEl = document.getElementById('question-progress');
    if (progressEl) {
      const pct = gameState.questions.length ? ((gameState.currentIndex + 1) / gameState.questions.length) * 100 : 0;
      progressEl.style.width = `${pct}%`;
    }
    promptEl.textContent = current.prompt;
    operationEl.textContent = gameState.gameType === 'english_vocab'
      ? `${current.theme_label} • ${getVocabularyQuizTypeLabel(current.quiz_type)}`
      : `${current.operation_label} • ${quizTypes[current.quiz_type] || current.quiz_type}`;

    renderQuestionNav();
    renderNavButtons();

    const savedAnswer = gameState.answers[current.order] ?? '';

    if (gameState.gameType !== 'english_vocab' && current.quiz_type === 'short_answer') {
      answerArea.innerHTML = `
        <label class="block text-sm font-medium text-slate-700">Jawaban Anda</label>
        <input id="answer-input" type="number" class="sg-input mt-2" value="${savedAnswer}" />
      `;
      animateAnswerArea();
      return;
    }

    const modeTitle = current.quiz_type === 'matching'
      ? 'Cocokkan hasil yang benar'
      : current.quiz_type === 'sentence_fill'
        ? 'Pilih kata yang paling tepat'
        : 'Pilih jawaban yang benar';
    answerArea.innerHTML = `
      <p class="text-sm font-medium text-slate-700">${modeTitle}</p>
      <div class="grid gap-3 sm:grid-cols-2">
        ${(current.options || []).map((option) => {
          const checked = String(savedAnswer) === String(option);
          return `
            <label class="sg-choice ${checked ? 'is-selected' : ''}">
              <input type="radio" name="answer-choice" value="${option}" ${checked ? 'checked' : ''} />
              <span>${option}</span>
            </label>
          `;
        }).join('')}
      </div>
    `;

    animateAnswerArea();

    answerArea.querySelectorAll('input[name="answer-choice"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        answerArea.querySelectorAll('.sg-choice').forEach((label) => label.classList.remove('is-selected'));
        const parent = radio.closest('.sg-choice');
        if (parent) {
          parent.classList.add('is-selected');
        }
      });
    });
  }

  function animateAnswerArea() {
    if (!answerArea) {
      return;
    }
    answerArea.classList.remove('sg-fade-up');
    void answerArea.offsetWidth;
    answerArea.classList.add('sg-fade-up');
  }

  function isQuestionAnswered(question) {
    const value = gameState.answers[question.order];
    return value !== undefined && value !== null && value !== '';
  }

  function renderQuestionNav() {
    if (!gameState || !questionNavEl) {
      return;
    }
    questionNavEl.innerHTML = gameState.questions.map((question, index) => {
      const isCurrent = index === gameState.currentIndex;
      const answered = isQuestionAnswered(question);

      let cls = 'sg-nav-btn';
      if (isCurrent) {
        cls += ' sg-nav-current';
      } else if (answered) {
        cls += ' sg-nav-answered';
      }

      return `<button type="button" data-question-nav="${index}" class="${cls}">${index + 1}</button>`;
    }).join('');
  }

  function renderNavButtons() {
    if (!prevQuestionBtn || !nextQuestionBtn) {
      return;
    }
    const isFirst = gameState.currentIndex <= 0;
    const isLast = gameState.currentIndex >= gameState.questions.length - 1;
    prevQuestionBtn.disabled = isFirst;
    prevQuestionBtn.classList.toggle('is-disabled', isFirst);
    nextQuestionBtn.textContent = isLast ? 'Simpan & Selesai' : 'Simpan & Lanjut';
  }

  function captureCurrentAnswer() {
    if (!gameState) {
      return false;
    }
    const current = gameState.questions[gameState.currentIndex];
    if (gameState.gameType !== 'english_vocab' && current.quiz_type === 'short_answer') {
      const value = answerArea.querySelector('#answer-input')?.value;
      if (value === '' || value === null || value === undefined) {
        return false;
      }
      gameState.answers[current.order] = Number(value);
      return true;
    }

    const selected = answerArea.querySelector('input[name="answer-choice"]:checked');
    if (!selected) {
      return false;
    }
    gameState.answers[current.order] = gameState.gameType === 'english_vocab' ? String(selected.value) : Number(selected.value);
    return true;
  }

  async function saveRekapDocument(sessionPayload) {
    if (!sessionPayload) return;

    const gameType = sessionPayload.game_type || 'math';
    const siswaId = sessionPayload.siswa_id;
    const pengajaranId = sessionPayload.pengajaran_id;
    const sessionId = sessionPayload.id;

    const correct = Number(sessionPayload.correct_count || 0);
    const total = Number(sessionPayload.total_questions || 0);
    const nilaiAsli = total ? `${correct}/${total}` : '-';
    const nilaiRekap = total ? Math.round((correct / total) * 100) : 0;

    let attemptNumber = 1;
    try {
      const existingRekaps = await getDocumentsWhere('game_session_rekap', [
        { field: 'siswa_id', operator: '==', value: siswaId },
        { field: 'game_type', operator: '==', value: gameType },
        { field: 'pengajaran_id', operator: '==', value: pengajaranId },
      ]);
      attemptNumber = existingRekaps.length + 1;
    } catch (error) {
      console.warn('Gagal menghitung attempt_number untuk rekap:', error);
    }

    const rekapPayload = {
      id: `rekap_${sessionId}`,
      game_type: gameType,
      pengajaran_id: pengajaranId,
      kelas_id: sessionPayload.kelas_id,
      kelas_nama: sessionPayload.kelas_nama || '',
      siswa_id: siswaId,
      siswa_nama: sessionPayload.siswa_nama || '',
      tahun_ajaran_id: sessionPayload.tahun_ajaran_id,
      semester_id: sessionPayload.semester_id,
      session_id: sessionId,
      started_at: sessionPayload.started_at,
      finished_at: sessionPayload.finished_at,
      raw_score: Number(sessionPayload.score || 0),
      raw_correct: correct,
      raw_total: total,
      nilai_asli: nilaiAsli,
      nilai_rekap: nilaiRekap,
      attempt_number: attemptNumber,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (gameType === 'math' && sessionPayload.by_operation) {
      rekapPayload.per_operation = sessionPayload.by_operation;
    } else if (gameType === 'english_vocab' && sessionPayload.by_theme) {
      rekapPayload.per_theme = sessionPayload.by_theme;
    }

    try {
      await saveDocument('game_session_rekap', rekapPayload, rekapPayload.id);
    } catch (error) {
      console.warn('Gagal menyimpan rekap ke Firestore:', error);
    }
  }

  async function finishGame(isTimeout = false) {
    if (!gameState || !activeConfig) {
      return;
    }

    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }

    const evaluation = gameState.gameType === 'english_vocab'
      ? evaluateVocabularySession(gameState.questions, gameState.answers)
      : evaluateMathSession(gameState.questions, gameState.answers);
    const endedAt = new Date();
    const durationUsed = Math.max(0, Math.round((endedAt.getTime() - gameState.startedAt.getTime()) / 1000));

    const payload = {
      id: `${activeConfig.id}_${user.username || user.id || 'siswa'}_${Date.now()}`,
      config_id: activeConfig.id,
      game_type: activeConfig.game_type || 'math',
      tahun_ajaran_id: context.tahun_ajaran_aktif,
      semester_id: context.semester_aktif,
      pengajaran_id: activeConfig.pengajaran_id,
      guru_id: activeConfig.guru_id,
      kelas_id: activeConfig.kelas_id,
      siswa_id: user.username || user.id || '',
      siswa_nama: user.nama || 'Siswa',
      started_at: gameState.startedAt.toISOString(),
      finished_at: endedAt.toISOString(),
      duration_used_sec: durationUsed,
      quiz_type: gameState.quizType,
      timeout: isTimeout,
      ...evaluation,
    };

    try {
      await saveDocument('game_sessions', payload, payload.id);
    } catch (error) {
      console.warn('Gagal menyimpan sesi game ke Firestore:', error);
    }

    await saveRekapDocument(payload);

    const localSessions = readLocalList(LOCAL_SESSION_KEY);
    localSessions.push(payload);
    saveLocalList(LOCAL_SESSION_KEY, localSessions);

    scoreEl.textContent = String(payload.score);
    accuracyEl.textContent = `${payload.accuracy.toFixed(1)}%`;
    correctEl.textContent = `${payload.correct_count}/${payload.total_questions}`;

    if (payload.game_type === 'english_vocab') {
      byOperationEl.innerHTML = Object.entries(payload.by_theme || {}).length
        ? `
            <div class="space-y-2">
              ${Object.entries(payload.by_theme)
                .map(([, detail]) => {
                  const accuracy = detail.asked ? (detail.correct / detail.asked) * 100 : 0;
                  return `
                    <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p class="text-sm font-semibold text-slate-800">${detail.label}</p>
                      <p class="mt-1 text-xs text-slate-500">Benar ${detail.correct}/${detail.asked} • Akurasi ${accuracy.toFixed(1)}%</p>
                    </div>
                  `;
                })
                .join('')}
              ${payload.words_to_review?.length ? `
                <div class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                  <p class="text-sm font-semibold text-amber-800">Kata yang perlu diulang</p>
                  <div class="mt-2 space-y-2 text-xs text-amber-900">
                    ${payload.words_to_review.slice(0, 5).map((item) => `
                      <div>
                        <p class="font-semibold">${item.correct_answer}</p>
                        <p>${item.theme} • Jawaban Anda: ${item.student_answer}</p>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
          `
        : '<p class="text-sm text-slate-500">Belum ada data tema.</p>';
    } else {
      byOperationEl.innerHTML = Object.entries(payload.by_operation || {}).length
        ? Object.entries(payload.by_operation)
            .map(([operation, detail]) => {
              const accuracy = detail.asked ? (detail.correct / detail.asked) * 100 : 0;
              return `
                <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p class="text-sm font-semibold text-slate-800">${getOperationLabel(operation)}</p>
                  <p class="mt-1 text-xs text-slate-500">Benar ${detail.correct}/${detail.asked} • Akurasi ${accuracy.toFixed(1)}%</p>
                </div>
              `;
            })
            .join('')
        : '<p class="text-sm text-slate-500">Belum ada data operasi.</p>';
    }

    gameState = null;
    openResult();
  }

  function startTimer() {
    if (!gameState) {
      return;
    }
    timerEl.textContent = formatTime(gameState.remainingSec);
    updateTimerWarning();

    timerId = setInterval(async () => {
      if (!gameState) {
        clearInterval(timerId);
        timerId = null;
        return;
      }
      gameState.remainingSec -= 1;
      timerEl.textContent = formatTime(gameState.remainingSec);
      updateTimerWarning();
      if (gameState.remainingSec <= 0) {
        await finishGame(true);
      }
    }, 1000);
  }

  function updateTimerWarning() {
    if (!timerPillEl || !gameState) {
      return;
    }
    timerPillEl.classList.toggle('is-low', gameState.remainingSec <= 10);
  }

  async function loadPublishedConfigs() {
    const allAssignments = await getActiveTeachingAssignments(context);
    const userClass = user.kelas_id || user.kelas_nama || '';

    const remoteMathConfigs = await getDocumentsWhere('game_configs', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
      { field: 'game_type', operator: '==', value: 'math' },
      { field: 'status', operator: '==', value: 'published' },
    ]);
    const remoteEnglishConfigs = await getDocumentsWhere('game_configs', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
      { field: 'game_type', operator: '==', value: 'english_vocab' },
      { field: 'status', operator: '==', value: 'published' },
    ]);

    const remoteConfigs = [...remoteMathConfigs, ...remoteEnglishConfigs];

    const localConfigs = readLocalList(LOCAL_CONFIG_KEY).filter((item) => ['math', 'english_vocab'].includes(item.game_type) && item.status === 'published');
    const mergedMap = new Map();
    [...remoteConfigs, ...localConfigs].forEach((item) => mergedMap.set(item.id, item));

    const assignmentMap = new Map(allAssignments.map((item) => [item.id, item]));

    allPublishedConfigs = [...mergedMap.values()].filter((item) => {
      const assignment = assignmentMap.get(item.pengajaran_id);
      if (!assignment) {
        return isSameClass(item.kelas_id, userClass) || isSameClass(item.kelas_nama, userClass);
      }
      return isSameClass(assignment.kelas_id, userClass) || isSameClass(assignment.kelas_nama, userClass) || isSameClass(item.kelas_id, userClass) || isSameClass(item.kelas_nama, userClass);
    });

    if (!allPublishedConfigs.length && [...mergedMap.values()].length) {
      allPublishedConfigs = [...mergedMap.values()];
    }
    setActiveGameType(allPublishedConfigs.some((item) => item.game_type === 'math') ? 'math' : 'english_vocab');
  }

  configSelect?.addEventListener('change', async (event) => {
    activeConfig = publishedConfigs.find((item) => item.id === event.target.value) || null;
    renderConfigSummary(activeConfig);
    renderQuizTypeOptions(activeConfig);
    const tokenEnabled = activeConfig ? activeConfig.token_enabled !== false : true;
    if (tokenPanelEl) {
      tokenPanelEl.classList.toggle('hidden', (activeConfig?.game_type === 'english_vocab') || !tokenEnabled);
    }
    if (accessTokenInput) {
      accessTokenInput.value = '';
    }
  });

  startGameBtn?.addEventListener('click', async () => {
    if (!activeConfig) {
      setMessage('Konfigurasi game tidak tersedia.', true);
      return;
    }

    let settings;
    let quizType;
    let questions;

    if (activeConfig.game_type === 'english_vocab') {
      settings = normalizeVocabularySettings(activeConfig.settings || {});
      quizType = quizTypeSelect?.value || settings.quiz_modes[0] || 'meaning_choice';
      questions = generateVocabularyQuestions(settings, quizType);
    } else {
      const tokenEnabled = activeConfig.token_enabled !== false;

      if (!tokenEnabled) {
        if (accessTokenInput) {
          accessTokenInput.value = '';
        }
      } else {
        const requiredToken = String(activeConfig.game_access_token || '').trim().toUpperCase();
        const enteredToken = String(accessTokenInput?.value || '').trim().toUpperCase();
        const tokenExpiresAt = String(activeConfig.game_access_token_expires_at || '').trim();

        if (!requiredToken) {
          setMessage('Guru belum membuat token akses untuk game ini.', true);
          return;
        }

        if (!tokenExpiresAt || Number.isNaN(new Date(tokenExpiresAt).getTime()) || new Date(tokenExpiresAt).getTime() <= Date.now()) {
          setMessage('Token sudah kedaluwarsa. Minta guru generate token baru.', true);
          return;
        }

        if (!enteredToken) {
          setMessage('Masukkan token dari guru terlebih dahulu.', true);
          return;
        }

        if (requiredToken !== enteredToken) {
          setMessage('Token tidak valid. Periksa kembali token dari guru.', true);
          return;
        }
      }

      settings = normalizeGameSettings(activeConfig.settings || {});
      quizType = quizTypeSelect?.value || settings.quiz_modes[0] || 'short_answer';
      questions = generateMathQuestions(settings, quizType);
    }

    gameState = {
      gameType: activeConfig.game_type || 'math',
      quizType,
      questions,
      currentIndex: 0,
      answers: {},
      startedAt: new Date(),
      remainingSec: settings.duration_sec,
    };

    renderQuestion();
    openPlay();
    startTimer();
    setMessage('');
  });

  nextQuestionBtn?.addEventListener('click', async () => {
    if (!gameState) {
      return;
    }

    captureCurrentAnswer();
    setMessage('');

    if (gameState.currentIndex >= gameState.questions.length - 1) {
      await finishGame(false);
      return;
    }

    gameState.currentIndex += 1;
    renderQuestion();
  });

  prevQuestionBtn?.addEventListener('click', () => {
    if (!gameState) {
      return;
    }
    if (gameState.currentIndex <= 0) {
      return;
    }

    captureCurrentAnswer();
    gameState.currentIndex -= 1;
    renderQuestion();
    setMessage('');
  });

  questionNavEl?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-question-nav]');
    if (!btn || !gameState) {
      return;
    }

    captureCurrentAnswer();
    const targetIndex = Number(btn.getAttribute('data-question-nav'));
    if (Number.isNaN(targetIndex)) {
      return;
    }

    gameState.currentIndex = targetIndex;
    renderQuestion();
    setMessage('');
  });

  finishGameBtn?.addEventListener('click', async () => {
    if (!gameState) {
      return;
    }
    captureCurrentAnswer();
    await finishGame(false);
  });

  battleJoinBtn?.addEventListener('click', async () => {
    const code = String(battleRoomInputEl?.value || '').trim().toUpperCase();
    if (!code) {
      setBattleStudentStatus('Masukkan kode room dari guru.', true);
      return;
    }
    const localRoom = readBattleRooms().find((item) => item.code === code);
    battleRoom = localRoom || { code };
    await fetchBattleRoom();
    if (!battleRoom?.id) {
      setBattleStudentStatus('Room tidak ditemukan. Periksa kode dan pastikan guru sudah membuat room.', true);
      return;
    }
    if (battleRoom.status === 'finished') {
      setBattleStudentStatus('Battle ini sudah selesai.', true);
      return;
    }
    const studentId = getBattleStudentId();
    const participants = { ...(battleRoom.participants || {}) };
    participants[studentId] = { ...(participants[studentId] || { id: studentId, nama: user.nama || user.username || 'Siswa', score: 0, correct: 0, wrong: 0, answers: {}, score_events: {}, joined_at: new Date().toISOString() }), wrong: Number(participants[studentId]?.wrong || 0), score_events: participants[studentId]?.score_events || {}, avatar_key: selectedBattleAvatar.key, avatar_seed: selectedBattleAvatar.seed, ready: true };
    battleRoom = { ...battleRoom, participants, updated_at: new Date().toISOString() };
    battleArenaLastRoomStatus = battleRoom.status === 'live' ? 'live' : 'waiting';
    saveBattleRoomLocal(battleRoom);
    saveBattleParticipant(battleRoom, participants[studentId]);
    setBattleStudentStatus(battleRoom.status === 'live' ? 'Battle sedang berlangsung. Bersiap menjawab!' : `Berhasil bergabung ke ${battleRoom.title || 'room'}. Menunggu guru memulai...`);
    openLobby();
    if (battlePollId) clearInterval(battlePollId);
    battlePollId = setInterval(() => {
      if (!document.hidden) syncBattle();
    }, 5000);
    await syncBattle();
    startBattleArenaMotion();
  });

  battleArenaBackBtn?.addEventListener('click', () => {
    closeBattleArena();
    if (battlePollId) clearInterval(battlePollId);
    battlePollId = null;
    battleRoom = null;
    openLobby();
  });

  playAgainBtn?.addEventListener('click', () => {
    openLobby();
  });

  lobbyBackBtn?.addEventListener('click', () => {
    openGameSelection();
  });

  overlayBackBtn?.addEventListener('click', () => {
    if (battleRoom) {
      if (battlePollId) clearInterval(battlePollId);
      battlePollId = null;
      battleRoom = null;
      gameState = null;
      openLobby();
      return;
    }
    if (gameState) {
      const shouldExit = window.confirm('Permainan sedang berjalan. Keluar dari mode main penuh akan mengakhiri sesi ini. Lanjutkan?');
      if (!shouldExit) {
        return;
      }
      gameState = null;
      setMessage('Sesi game dibatalkan.', true);
    }
    openLobby();
  });

  gameCards.forEach((card) => {
    card.addEventListener('click', () => {
      setActiveGameType(card.getAttribute('data-student-game-card') || 'math');
      openLobby();
    });
  });

  await loadPublishedConfigs();
  openGameSelection();
  renderBattleAvatarPicker();
  renderBattleSoundboard();
  if (battleAvatarLabelEl) battleAvatarLabelEl.textContent = selectedBattleAvatar.label;

  container.routeCleanup = () => {
    if (timerId) clearInterval(timerId);
    if (battlePollId) clearInterval(battlePollId);
    if (battleTimerId) clearInterval(battleTimerId);
    stopBattleArenaMotion();
    timerId = null;
    battlePollId = null;
    battleTimerId = null;
  };

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
