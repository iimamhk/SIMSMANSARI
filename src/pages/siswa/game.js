import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import { getActiveTeachingAssignments, getDocumentsWhere, saveDocument } from '../../firebase/data-service.js';
import { quizTypes, generateMathQuestions, evaluateMathSession, normalizeGameSettings, getOperationCatalog } from '../../utils/math-game.js';
import { vocabularyQuizTypes, generateVocabularyQuestions, evaluateVocabularySession, normalizeVocabularySettings, getVocabularyThemeLabel } from '../../utils/vocab-game.js';

const LOCAL_CONFIG_KEY = 'simguru_game_configs_local';
const LOCAL_SESSION_KEY = 'simguru_game_sessions_local';
const LOCAL_TOKEN_KEY = 'simguru_game_tokens_local';

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
    },
    {
      key: 'english_vocab',
      title: 'English Vocabulary',
      description: 'Latihan kosakata bahasa Inggris berdasarkan tema tanpa token tambahan.',
      access: 'Tanpa Token',
      accentClass: 'from-sky-500 to-blue-500',
    },
  ];

  const html = renderLayout('Game Center Siswa', `
    <div class="space-y-6">
      <section class="overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-900 via-sky-900 to-cyan-800 p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div class="grid gap-5 xl:grid-cols-[1.2fr_0.8fr] xl:items-start">
          <div class="space-y-4">
            <p class="text-xs font-semibold uppercase tracking-[0.26em] text-cyan-100">Game Center Siswa</p>
            <div>
              <h2 class="text-3xl font-semibold tracking-tight">Masuk ke arena belajar dengan alur yang rapi dan cepat</h2>
              <p class="mt-3 max-w-2xl text-sm leading-6 text-cyan-50/85">Pilih game aktif, cek aturan kelas, lalu mulai sesi belajar dari satu Game Center yang sama.</p>
            </div>
            <div class="flex flex-wrap gap-2 text-xs text-cyan-50/90">
              <span class="rounded-full border border-white/15 bg-white/10 px-3 py-1">2 game aktif</span>
              <span class="rounded-full border border-white/15 bg-white/10 px-3 py-1">Math dengan token, vocab tanpa token</span>
              <span class="rounded-full border border-white/15 bg-white/10 px-3 py-1">Hasil sesi tersimpan otomatis</span>
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
              <p class="mt-3 text-sm leading-6 text-cyan-50/90">Satu workspace untuk memilih konfigurasi, bermain, dan melihat hasil sesi setelah selesai.</p>
            </div>
          </div>
        </div>
      </section>

      <section class="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div class="space-y-4">
          <div class="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p class="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">Workspace Aktif</p>
                <h3 id="student-workspace-title" class="mt-2 text-2xl font-semibold text-slate-900">Arena Matematika Cepat</h3>
                <p id="student-workspace-caption" class="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Struktur halaman mengikuti modul guru: ringkasan, akses token, sesi bermain, lalu hasil akhir yang mudah dibaca.</p>
              </div>
              <div id="student-workspace-badge" class="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Siap dimainkan</div>
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            ${studentGameCatalog.map((game, index) => `
              <button type="button" data-student-game-card="${game.key}" class="student-game-card rounded-[28px] border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)] ${index === 0 ? 'ring-2 ring-sky-200' : ''}">
                <div class="flex items-start justify-between gap-3">
                  <div class="flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br ${game.accentClass} text-lg font-bold text-white shadow-lg">${game.title.split(' ').map((word) => word[0]).slice(0, 2).join('')}</div>
                  <span class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">${game.access}</span>
                </div>
                <p class="mt-4 text-lg font-semibold text-slate-900">${game.title}</p>
                <p class="mt-2 text-sm leading-6 text-slate-500">${game.description}</p>
              </button>
            `).join('')}
          </div>

          <section id="game-lobby" class="space-y-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Lobby</p>
                <h4 class="mt-1 text-xl font-semibold text-slate-900">Siapkan sesi game Anda</h4>
              </div>
              <div id="student-lobby-note" class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">Pilih konfigurasi, cek mode kuis, lalu masukkan token.</div>
            </div>

            <div class="grid gap-3 md:grid-cols-2">
              <div>
                <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Relasi Game Aktif</label>
                <select id="game-config-select" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"></select>
              </div>
              <div>
                <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tipe Kuis</label>
                <select id="quiz-type-select" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"></select>
              </div>
            </div>

            <div id="config-summary" class="rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"></div>

            <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div id="game-token-panel" class="rounded-[24px] border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
                <p class="font-semibold text-slate-800">Masukkan Token Dari Guru</p>
                <p class="mt-1 text-xs text-slate-500">Token dibuat oleh guru di halaman Game Center. Token harus valid dan belum kedaluwarsa sebelum sesi dimulai.</p>
                <input id="game-access-token-input" type="text" maxlength="12" class="mt-3 w-full max-w-[320px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em]" placeholder="Contoh: A7K9P2" />
              </div>
              <div class="flex flex-wrap items-center gap-3">
                <button id="start-game-btn" type="button" class="rounded-2xl bg-[#007AFF] px-5 py-3 text-sm font-semibold text-white hover:bg-[#0063CC]">Mulai Main</button>
                <p id="game-message" class="text-sm text-slate-500"></p>
              </div>
            </div>
          </section>

          <section id="game-play" class="hidden space-y-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Sesi Bermain</p>
                <p class="mt-1 text-sm font-semibold text-slate-800">Soal <span id="question-counter">1/10</span></p>
              </div>
              <p class="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">Sisa waktu: <span id="timer-text">00:00</span></p>
            </div>
            <div class="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500" id="question-operation">Operasi</p>
              <p id="question-prompt" class="mt-3 text-3xl font-semibold text-slate-900">...</p>
            </div>

            <div id="answer-area" class="space-y-3"></div>

            <div class="flex flex-wrap items-center gap-3">
              <button id="next-question-btn" type="button" class="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700">Simpan Jawaban</button>
              <button id="finish-game-btn" type="button" class="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700">Selesai Sekarang</button>
            </div>
          </section>

          <section id="game-result" class="hidden space-y-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Hasil Sesi</p>
                <h4 class="mt-1 text-xl font-semibold text-slate-900">Rekap permainan Anda</h4>
              </div>
              <div class="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Tersimpan</div>
            </div>

            <div class="grid gap-3 sm:grid-cols-3">
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

            <div>
              <p id="result-analysis-label" class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Analisis Operasi</p>
              <div id="result-by-operation" class="mt-2 space-y-2"></div>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <button id="play-again-btn" type="button" class="rounded-2xl bg-[#007AFF] px-5 py-3 text-sm font-semibold text-white hover:bg-[#0063CC]">Main Lagi</button>
            </div>
          </section>
        </div>

        <aside class="space-y-4">
          <div class="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <p class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Alur Main</p>
            <div class="mt-4 space-y-3 text-sm text-slate-600">
              <div class="rounded-2xl bg-slate-50 px-4 py-3">1. Pilih konfigurasi kelas yang tersedia.</div>
              <div class="rounded-2xl bg-slate-50 px-4 py-3">2. Tentukan tipe kuis yang dibuka guru.</div>
              <div class="rounded-2xl bg-slate-50 px-4 py-3">3. Ikuti akses game: token untuk math, langsung main untuk vocab.</div>
              <div class="rounded-2xl bg-slate-50 px-4 py-3">4. Mainkan sesi dan cek hasil akhir.</div>
            </div>
          </div>

          <div class="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <p class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Catatan Siswa</p>
            <div class="mt-4 space-y-3 text-sm text-slate-600">
              <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p class="font-semibold text-slate-900">Akses Tergantung Jenis Game</p>
                <p class="mt-1">Math memakai token guru, sedangkan English Vocabulary bisa langsung dimainkan saat sudah published.</p>
              </div>
              <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p class="font-semibold text-slate-900">Jawaban Tersimpan Per Soal</p>
                <p class="mt-1">Gunakan tombol simpan jawaban untuk maju ke soal berikutnya dengan aman.</p>
              </div>
              <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p class="font-semibold text-slate-900">Hasil Masuk Monitoring Guru</p>
                <p class="mt-1">Skor dan akurasi Anda dipakai guru untuk melihat performa kelas.</p>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </div>
  `);

  container.innerHTML = html;

  const configSelect = container.querySelector('#game-config-select');
  const quizTypeSelect = container.querySelector('#quiz-type-select');
  const summaryEl = container.querySelector('#config-summary');
  const messageEl = container.querySelector('#game-message');
  const accessTokenInput = container.querySelector('#game-access-token-input');
  const tokenPanelEl = container.querySelector('#game-token-panel');
  const gameCards = Array.from(container.querySelectorAll('[data-student-game-card]'));
  const activeGameLabelEl = container.querySelector('#student-active-game-label');
  const activeAccessLabelEl = container.querySelector('#student-active-access-label');
  const workspaceTitleEl = container.querySelector('#student-workspace-title');
  const workspaceCaptionEl = container.querySelector('#student-workspace-caption');
  const workspaceBadgeEl = container.querySelector('#student-workspace-badge');
  const lobbyNoteEl = container.querySelector('#student-lobby-note');
  const resultAnalysisLabelEl = container.querySelector('#result-analysis-label');

  const lobbyEl = container.querySelector('#game-lobby');
  const playEl = container.querySelector('#game-play');
  const resultEl = container.querySelector('#game-result');

  const counterEl = container.querySelector('#question-counter');
  const timerEl = container.querySelector('#timer-text');
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

  function getCurrentGameMeta() {
    return studentGameCatalog.find((item) => item.key === currentGameType) || studentGameCatalog[0];
  }

  function setMessage(text, isError = false) {
    messageEl.textContent = text;
    messageEl.className = isError ? 'text-sm text-rose-600' : 'text-sm text-slate-500';
  }

  function updateWorkspaceMeta() {
    const meta = getCurrentGameMeta();
    if (activeGameLabelEl) {
      activeGameLabelEl.textContent = meta.title;
    }
    if (activeAccessLabelEl) {
      activeAccessLabelEl.textContent = meta.access;
    }
    if (workspaceTitleEl) {
      workspaceTitleEl.textContent = currentGameType === 'english_vocab' ? 'Arena English Vocabulary' : 'Arena Matematika Cepat';
    }
    if (workspaceCaptionEl) {
      workspaceCaptionEl.textContent = currentGameType === 'english_vocab'
        ? 'Mainkan latihan kosakata dengan tema yang dibuka guru, tanpa token tambahan, lalu lihat kata yang masih perlu diulang.'
        : 'Struktur halaman mengikuti modul guru: ringkasan, akses token, sesi bermain, lalu hasil akhir yang mudah dibaca.';
    }
    if (workspaceBadgeEl) {
      workspaceBadgeEl.textContent = meta.access;
      workspaceBadgeEl.className = currentGameType === 'english_vocab'
        ? 'rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-700'
        : 'rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-700';
    }
    if (lobbyNoteEl) {
      lobbyNoteEl.textContent = currentGameType === 'english_vocab'
        ? 'Pilih konfigurasi vocab dan mode kuis, lalu mulai tanpa token.'
        : 'Pilih konfigurasi, cek mode kuis, lalu masukkan token.';
    }
    if (tokenPanelEl) {
      tokenPanelEl.classList.toggle('hidden', currentGameType === 'english_vocab');
    }
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
      card.classList.toggle('ring-sky-200', isActive);
    });
    refreshPublishedConfigsForGame();
  }

  function formatTime(sec) {
    const total = Math.max(0, Number(sec || 0));
    const m = String(Math.floor(total / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${m}:${s}`;
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
    lobbyEl.classList.remove('hidden');
    playEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function openPlay() {
    lobbyEl.classList.add('hidden');
    playEl.classList.remove('hidden');
    resultEl.classList.add('hidden');
  }

  function openResult() {
    lobbyEl.classList.add('hidden');
    playEl.classList.add('hidden');
    resultEl.classList.remove('hidden');
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

    summaryEl.innerHTML = `
      <p><span class="font-semibold text-slate-800">Status:</span> <span class="text-emerald-700 font-semibold">${config.status}</span></p>
      <p class="mt-1"><span class="font-semibold text-slate-800">Operasi:</span> ${operations}</p>
      <p class="mt-1"><span class="font-semibold text-slate-800">Tipe kuis:</span> ${quizModes}</p>
      <p class="mt-1"><span class="font-semibold text-slate-800">Jumlah soal:</span> ${settings.question_count} • <span class="font-semibold text-slate-800">Durasi:</span> ${settings.duration_sec} detik</p>
      <p class="mt-1"><span class="font-semibold text-slate-800">Token akses:</span> ${config.game_access_token ? `Aktif sampai ${formatDateTime(config.game_access_token_expires_at)}` : 'Belum dibuat guru'}</p>
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
    promptEl.textContent = current.prompt;
    operationEl.textContent = gameState.gameType === 'english_vocab'
      ? `${current.theme_label} • ${getVocabularyQuizTypeLabel(current.quiz_type)}`
      : `${current.operation_label} • ${quizTypes[current.quiz_type] || current.quiz_type}`;

    const savedAnswer = gameState.answers[current.order] ?? '';

    if (gameState.gameType !== 'english_vocab' && current.quiz_type === 'short_answer') {
      answerArea.innerHTML = `
        <label class="block text-sm font-medium text-slate-700">Jawaban Anda</label>
        <input id="answer-input" type="number" class="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" value="${savedAnswer}" />
      `;
      return;
    }

    const modeTitle = current.quiz_type === 'matching'
      ? 'Cocokkan hasil yang benar'
      : current.quiz_type === 'sentence_fill'
        ? 'Pilih kata yang paling tepat'
        : 'Pilih jawaban yang benar';
    answerArea.innerHTML = `
      <p class="text-sm font-medium text-slate-700">${modeTitle}</p>
      <div class="grid gap-2 sm:grid-cols-2">
        ${(current.options || []).map((option) => {
          const checked = String(savedAnswer) === String(option);
          return `
            <label class="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input type="radio" name="answer-choice" value="${option}" class="h-4 w-4 border-slate-300 text-[#007AFF]" ${checked ? 'checked' : ''} />
              ${option}
            </label>
          `;
        }).join('')}
      </div>
    `;
  }

  function captureCurrentAnswer() {
    if (!gameState) {
      return false;
    }
    const current = gameState.questions[gameState.currentIndex];
    if (gameState.gameType !== 'english_vocab' && current.quiz_type === 'short_answer') {
      const value = container.querySelector('#answer-input')?.value;
      if (value === '' || value === null || value === undefined) {
        return false;
      }
      gameState.answers[current.order] = Number(value);
      return true;
    }

    const selected = container.querySelector('input[name="answer-choice"]:checked');
    if (!selected) {
      return false;
    }
    gameState.answers[current.order] = gameState.gameType === 'english_vocab' ? String(selected.value) : Number(selected.value);
    return true;
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

    timerId = setInterval(async () => {
      if (!gameState) {
        clearInterval(timerId);
        timerId = null;
        return;
      }
      gameState.remainingSec -= 1;
      timerEl.textContent = formatTime(gameState.remainingSec);
      if (gameState.remainingSec <= 0) {
        await finishGame(true);
      }
    }, 1000);
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
    if (accessTokenInput) {
      accessTokenInput.value = '';
    }
  });

  container.querySelector('#start-game-btn')?.addEventListener('click', async () => {
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

  container.querySelector('#next-question-btn')?.addEventListener('click', async () => {
    if (!gameState) {
      return;
    }

    const captured = captureCurrentAnswer();
    if (!captured) {
      setMessage('Jawaban belum dipilih/diisi.', true);
      return;
    }

    setMessage('');

    if (gameState.currentIndex >= gameState.questions.length - 1) {
      await finishGame(false);
      return;
    }

    gameState.currentIndex += 1;
    renderQuestion();
  });

  container.querySelector('#finish-game-btn')?.addEventListener('click', async () => {
    if (!gameState) {
      return;
    }
    captureCurrentAnswer();
    await finishGame(false);
  });

  container.querySelector('#play-again-btn')?.addEventListener('click', () => {
    openLobby();
  });

  gameCards.forEach((card) => {
    card.addEventListener('click', () => {
      setActiveGameType(card.getAttribute('data-student-game-card') || 'math');
    });
  });

  await loadPublishedConfigs();

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
