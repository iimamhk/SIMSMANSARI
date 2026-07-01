import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import { getActiveTeachingAssignments, getDocumentsWhere, saveDocument } from '../../firebase/data-service.js';
import { quizTypes, generateMathQuestions, evaluateMathSession, normalizeGameSettings, getOperationCatalog } from '../../utils/math-game.js';

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

  const html = renderLayout('Game Matematika', `
    <div class="space-y-5">
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h3 class="text-lg font-semibold text-slate-900">Arena Game Matematika</h3>
        <p class="mt-1 text-sm text-slate-500">Latihan cepat untuk operasi penjumlahan, pengurangan, perkalian, pembagian, pangkat, dan akar.</p>
      </div>

      <section id="game-lobby" class="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="grid gap-3 md:grid-cols-2">
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Relasi Game Aktif</label>
            <select id="game-config-select" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"></select>
          </div>
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tipe Kuis</label>
            <select id="quiz-type-select" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"></select>
          </div>
        </div>

        <div id="config-summary" class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600"></div>

        <div class="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
          <p class="font-semibold text-slate-800">Masukkan Token Dari Guru</p>
          <p class="mt-1 text-xs text-slate-500">Token dibuat oleh guru di halaman pengaturan game. Token wajib benar sebelum game dimulai.</p>
          <input id="game-access-token-input" type="text" maxlength="12" class="mt-2 w-full max-w-[260px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold uppercase tracking-[0.12em]" placeholder="Contoh: A7K9P2" />
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button id="start-game-btn" type="button" class="rounded-xl bg-[#007AFF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0063CC]">Mulai Main</button>
          <p id="game-message" class="text-sm text-slate-500"></p>
        </div>
      </section>

      <section id="game-play" class="hidden space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-semibold text-slate-800">Soal <span id="question-counter">1/10</span></p>
          <p class="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">Sisa waktu: <span id="timer-text">00:00</span></p>
        </div>
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500" id="question-operation">Operasi</p>
          <p id="question-prompt" class="mt-2 text-2xl font-semibold text-slate-900">...</p>
        </div>

        <div id="answer-area" class="space-y-3"></div>

        <div class="flex flex-wrap items-center gap-2">
          <button id="next-question-btn" type="button" class="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Simpan Jawaban</button>
          <button id="finish-game-btn" type="button" class="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Selesai Sekarang</button>
        </div>
      </section>

      <section id="game-result" class="hidden space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h4 class="text-base font-semibold text-slate-900">Hasil Sesi</h4>
        <div class="grid gap-3 sm:grid-cols-3">
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
            <p class="text-xs uppercase tracking-[0.12em] text-slate-500">Skor</p>
            <p id="result-score" class="mt-2 text-2xl font-semibold text-slate-900">0</p>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
            <p class="text-xs uppercase tracking-[0.12em] text-slate-500">Akurasi</p>
            <p id="result-accuracy" class="mt-2 text-2xl font-semibold text-slate-900">0%</p>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
            <p class="text-xs uppercase tracking-[0.12em] text-slate-500">Benar / Salah</p>
            <p id="result-correct" class="mt-2 text-2xl font-semibold text-slate-900">0/0</p>
          </div>
        </div>

        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Analisis Operasi</p>
          <div id="result-by-operation" class="mt-2 space-y-2"></div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button id="play-again-btn" type="button" class="rounded-xl bg-[#007AFF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0063CC]">Main Lagi</button>
        </div>
      </section>
    </div>
  `);

  container.innerHTML = html;

  const configSelect = container.querySelector('#game-config-select');
  const quizTypeSelect = container.querySelector('#quiz-type-select');
  const summaryEl = container.querySelector('#config-summary');
  const messageEl = container.querySelector('#game-message');
  const accessTokenInput = container.querySelector('#game-access-token-input');

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

  let publishedConfigs = [];
  let activeConfig = null;
  let gameState = null;
  let timerId = null;
  let tokenState = null;

  function setMessage(text, isError = false) {
    messageEl.textContent = text;
    messageEl.className = isError ? 'text-sm text-rose-600' : 'text-sm text-slate-500';
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
    operationEl.textContent = `${current.operation_label} • ${quizTypes[current.quiz_type] || current.quiz_type}`;

    const savedAnswer = gameState.answers[current.order] ?? '';

    if (current.quiz_type === 'short_answer') {
      answerArea.innerHTML = `
        <label class="block text-sm font-medium text-slate-700">Jawaban Anda</label>
        <input id="answer-input" type="number" class="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" value="${savedAnswer}" />
      `;
      return;
    }

    const modeTitle = current.quiz_type === 'matching' ? 'Cocokkan hasil yang benar' : 'Pilih jawaban yang benar';
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
    if (current.quiz_type === 'short_answer') {
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
    gameState.answers[current.order] = Number(selected.value);
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

    const evaluation = evaluateMathSession(gameState.questions, gameState.answers);
    const endedAt = new Date();
    const durationUsed = Math.max(0, Math.round((endedAt.getTime() - gameState.startedAt.getTime()) / 1000));

    const payload = {
      id: `${activeConfig.id}_${user.username || user.id || 'siswa'}_${Date.now()}`,
      config_id: activeConfig.id,
      game_type: 'math',
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

    const remoteConfigs = await getDocumentsWhere('game_configs', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
      { field: 'game_type', operator: '==', value: 'math' },
      { field: 'status', operator: '==', value: 'published' },
    ]);

    const localConfigs = readLocalList(LOCAL_CONFIG_KEY).filter((item) => item.game_type === 'math' && item.status === 'published');
    const mergedMap = new Map();
    [...remoteConfigs, ...localConfigs].forEach((item) => mergedMap.set(item.id, item));

    const assignmentMap = new Map(allAssignments.map((item) => [item.id, item]));

    publishedConfigs = [...mergedMap.values()].filter((item) => {
      const assignment = assignmentMap.get(item.pengajaran_id);
      if (!assignment) {
        return isSameClass(item.kelas_id, userClass) || isSameClass(item.kelas_nama, userClass);
      }
      return isSameClass(assignment.kelas_id, userClass) || isSameClass(assignment.kelas_nama, userClass) || isSameClass(item.kelas_id, userClass) || isSameClass(item.kelas_nama, userClass);
    });

    if (!publishedConfigs.length && [...mergedMap.values()].length) {
      publishedConfigs = [...mergedMap.values()];
    }

    configSelect.innerHTML = publishedConfigs.length
      ? publishedConfigs.map((item) => `<option value="${item.id}">${item.kelas_nama || '-'} • ${item.mapel_nama || '-'} • ${item.guru_nama || '-'}</option>`).join('')
      : '<option value="">Belum ada game matematika published</option>';

    activeConfig = publishedConfigs[0] || null;
    renderConfigSummary(activeConfig);
    renderQuizTypeOptions(activeConfig);
    if (accessTokenInput) {
      accessTokenInput.value = '';
    }

    setMessage(activeConfig ? 'Konfigurasi game siap dimainkan.' : 'Guru belum mem-publish game matematika untuk kelas ini.', !activeConfig);
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

    const settings = normalizeGameSettings(activeConfig.settings || {});
    const quizType = quizTypeSelect?.value || settings.quiz_modes[0] || 'short_answer';
    const questions = generateMathQuestions(settings, quizType);

    gameState = {
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

  await loadPublishedConfigs();

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
