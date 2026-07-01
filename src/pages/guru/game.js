import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import { getTeachingAssignmentsForUser, getActiveTeachingAssignments, getDocumentsWhere, saveDocument } from '../../firebase/data-service.js';
import { getOperationCatalog, quizTypes, normalizeGameSettings } from '../../utils/math-game.js';

const LOCAL_CONFIG_KEY = 'simguru_game_configs_local';
const LOCAL_SESSION_KEY = 'simguru_game_sessions_local';

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

export async function renderGuruGamePage(container) {
  const context = getStoredContext();
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const userId = session?.user?.username || '';

  const userAssignments = userId ? await getTeachingAssignmentsForUser(context, userId) : [];
  const fallbackAssignments = userAssignments.length ? userAssignments : await getActiveTeachingAssignments(context);
  const assignments = fallbackAssignments;
  const selectedAssignment = assignments[0] || null;

  const options = assignments
    .map((item) => `<option value="${item.id}">${item.kelas_nama || '-'} • ${item.mapel_nama || '-'}</option>`)
    .join('');

  const html = renderLayout('Game Matematika', `
    <div class="space-y-5">
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h3 class="text-lg font-semibold text-slate-900">Pengaturan Game Matematika</h3>
        <p class="mt-1 text-sm text-slate-500">Atur konfigurasi game untuk kelas aktif. Tipe kuis: isian singkat, pilihan ganda, mencocokkan (opsional).</p>
      </div>

      <form id="game-config-form" class="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="grid gap-3 md:grid-cols-2">
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Relasi Mengajar</label>
            <select id="game-assignment" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">${options || '<option value="">Tidak ada relasi</option>'}</select>
          </div>
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Status</label>
            <select id="game-status" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <option value="draft">Draft</option>
              <option value="published">Published (siap dimainkan siswa)</option>
            </select>
          </div>
        </div>

        <div>
          <p class="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Operasi Matematika</p>
          <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            ${Object.entries(getOperationCatalog()).map(([key, item]) => `
              <label class="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <input type="checkbox" class="game-operation h-4 w-4 rounded border-slate-300 text-[#007AFF]" value="${key}" ${['add', 'sub', 'mul', 'div'].includes(key) ? 'checked' : ''} />
                ${item.label}
              </label>
            `).join('')}
          </div>
        </div>

        <div>
          <p class="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tipe Kuis</p>
          <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            ${Object.entries(quizTypes).map(([key, label]) => `
              <label class="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <input type="checkbox" class="game-quiz-mode h-4 w-4 rounded border-slate-300 text-[#007AFF]" value="${key}" ${key === 'short_answer' ? 'checked' : ''} />
                ${label}
              </label>
            `).join('')}
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Angka Min</label>
            <input id="game-number-min" type="number" value="1" min="0" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Angka Max</label>
            <input id="game-number-max" type="number" value="20" min="5" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Jumlah Soal</label>
            <input id="game-question-count" type="number" value="10" min="5" max="50" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Durasi (detik)</label>
            <input id="game-duration" type="number" value="180" min="30" max="1800" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Kriteria Kali Min</label>
            <input id="game-mul-min" type="number" value="1" min="0" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Kriteria Kali Max</label>
            <input id="game-mul-max" type="number" value="15" min="1" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Kriteria Bagi Min</label>
            <input id="game-div-min" type="number" value="1" min="1" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Kriteria Bagi Max</label>
            <input id="game-div-max" type="number" value="12" min="2" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Maks Pangkat</label>
            <input id="game-max-exponent" type="number" value="3" min="2" max="6" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          </div>
          <div class="flex items-end">
            <label class="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input id="game-allow-negative" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-[#007AFF]" />
              Izinkan hasil negatif
            </label>
          </div>
        </div>

        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Token Akses Game</p>
          <p class="mt-1 text-xs text-slate-600">Guru generate token, lalu siswa wajib memasukkan token ini sebelum mulai bermain. Token otomatis kedaluwarsa dalam 15 menit.</p>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <input id="game-access-token" readonly class="w-full max-w-[220px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold tracking-[0.14em] text-slate-800" placeholder="Belum dibuat" />
            <button id="generate-game-token-btn" type="button" class="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Generate Token</button>
          </div>
          <p id="game-access-token-expiry" class="mt-2 text-xs text-slate-500">Token belum dibuat.</p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button type="submit" class="rounded-xl bg-[#007AFF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0063CC]">Simpan Konfigurasi</button>
          <button id="publish-now-btn" type="button" class="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Publish Sekarang</button>
          <p id="config-message" class="text-sm text-slate-500"></p>
        </div>
      </form>

      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h4 class="text-base font-semibold text-slate-900">Monitoring Hasil Game</h4>
        <p class="mt-1 text-sm text-slate-500">Ringkasan sesi siswa untuk konfigurasi kelas yang dipilih.</p>
        <div class="mt-3 grid gap-3 sm:grid-cols-3">
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
            <p class="text-xs uppercase tracking-[0.12em] text-slate-500">Sesi Tercatat</p>
            <p id="monitor-total-sessions" class="mt-2 text-2xl font-semibold text-slate-900">0</p>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
            <p class="text-xs uppercase tracking-[0.12em] text-slate-500">Rata-rata Skor</p>
            <p id="monitor-average-score" class="mt-2 text-2xl font-semibold text-slate-900">0</p>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
            <p class="text-xs uppercase tracking-[0.12em] text-slate-500">Akurasi Kelas</p>
            <p id="monitor-average-accuracy" class="mt-2 text-2xl font-semibold text-slate-900">0%</p>
          </div>
        </div>
        <div class="mt-4">
          <p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Top Siswa</p>
          <div id="monitor-top-students" class="mt-2 space-y-2"></div>
        </div>
      </div>
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

  const totalSessionsEl = container.querySelector('#monitor-total-sessions');
  const averageScoreEl = container.querySelector('#monitor-average-score');
  const averageAccuracyEl = container.querySelector('#monitor-average-accuracy');
  const topStudentsEl = container.querySelector('#monitor-top-students');

  let currentAssignmentId = selectedAssignment?.id || '';
  let currentAccessToken = '';
  let currentAccessTokenIssuedAt = '';
  let currentAccessTokenExpiresAt = '';

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
    if (accessTokenInput) {
      accessTokenInput.value = currentAccessToken;
    }
    if (accessTokenExpiryEl) {
      accessTokenExpiryEl.textContent = currentAccessToken
        ? `Berlaku sampai: ${formatDateTime(currentAccessTokenExpiresAt)}`
        : 'Token belum dibuat.';
    }
  }

  function getLocalConfigForAssignment(assignmentId) {
    return readLocalList(LOCAL_CONFIG_KEY).find((item) => item.pengajaran_id === assignmentId && item.game_type === 'math') || null;
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
      if (accessTokenInput) {
        accessTokenInput.value = '';
      }
      if (accessTokenExpiryEl) {
        accessTokenExpiryEl.textContent = 'Token belum dibuat.';
      }
      setMessage('Belum ada konfigurasi. Silakan simpan draft baru.');
    }
  }

  async function getSessionsForAssignment(assignmentId) {
    let docs = [];
    try {
      docs = await getDocumentsWhere('game_sessions', [
        { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
        { field: 'semester_id', operator: '==', value: context.semester_aktif },
        { field: 'pengajaran_id', operator: '==', value: assignmentId },
        { field: 'game_type', operator: '==', value: 'math' },
      ]);
    } catch {
      docs = [];
    }

    const local = readLocalList(LOCAL_SESSION_KEY).filter((item) => item.pengajaran_id === assignmentId && item.game_type === 'math');
    const map = new Map();
    [...docs, ...local].forEach((item) => {
      map.set(item.id, item);
    });
    return [...map.values()];
  }

  async function renderMonitoring(assignmentId) {
    const sessions = await getSessionsForAssignment(assignmentId);
    const total = sessions.length;
    const averageScore = total ? sessions.reduce((sum, item) => sum + Number(item.score || 0), 0) / total : 0;
    const averageAccuracy = total ? sessions.reduce((sum, item) => sum + Number(item.accuracy || 0), 0) / total : 0;

    totalSessionsEl.textContent = String(total);
    averageScoreEl.textContent = averageScore.toFixed(1);
    averageAccuracyEl.textContent = `${averageAccuracy.toFixed(1)}%`;

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

    topStudentsEl.innerHTML = top.length
      ? top.map((item, index) => `
          <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p class="text-sm font-semibold text-slate-800">${index + 1}. ${item.name}</p>
            <p class="mt-1 text-xs text-slate-500">Rata-rata skor ${item.avg.toFixed(1)} • ${item.attempts} sesi</p>
          </div>
        `).join('')
      : '<p class="text-sm text-slate-500">Belum ada sesi game untuk relasi ini.</p>';
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

    setMessage(`Konfigurasi ${status === 'published' ? 'published' : 'draft'} tersimpan. Operasi: ${operationNames}. Tipe kuis: ${quizNames}.${currentAccessToken ? ` Token akses: ${currentAccessToken} (berlaku 15 menit)` : ' Token akses belum dibuat.'}`);
  }

  generateTokenBtn?.addEventListener('click', () => {
    const now = new Date();
    const expires = new Date(now.getTime() + 15 * 60 * 1000);
    currentAccessToken = generateAccessToken(6);
    currentAccessTokenIssuedAt = now.toISOString();
    currentAccessTokenExpiresAt = expires.toISOString();
    if (accessTokenInput) {
      accessTokenInput.value = currentAccessToken;
    }
    if (accessTokenExpiryEl) {
      accessTokenExpiryEl.textContent = `Berlaku sampai: ${formatDateTime(currentAccessTokenExpiresAt)}`;
    }
    setMessage(`Token baru dibuat: ${currentAccessToken}. Berlaku 15 menit. Simpan konfigurasi agar token aktif.`);
  });

  assignmentSelect?.addEventListener('change', async (event) => {
    currentAssignmentId = event.target.value;
    await loadConfig(currentAssignmentId);
    await renderMonitoring(currentAssignmentId);
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

  await loadConfig(currentAssignmentId);
  await renderMonitoring(currentAssignmentId);

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
