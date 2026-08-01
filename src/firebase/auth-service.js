import { auth } from './firebase-config.js';

function getBackendBase() {
  const base = typeof window !== 'undefined' ? window.__SIM_BACKEND_URL__ : '';
  return String(base || '').replace(/\/+$/, '');
}

function backendUrl(path) {
  return `${getBackendBase()}${path}`;
}

function markFirestoreReadQuotaStatus(source = '') {
  try {
    localStorage.setItem('simguru_firestore_read_status', JSON.stringify({
      state: 'exhausted',
      source: String(source || 'login'),
      message: 'Kuota database Firebase sedang habis.',
      detected_at: new Date().toISOString(),
    }));
  } catch {
    // Ignore localStorage errors.
  }
}

let authReadyPromise = null;

export function waitForAuthReady() {
  if (!auth) return Promise.resolve(null);
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (authReadyPromise) return authReadyPromise;
  authReadyPromise = new Promise((resolve) => {
    let unsubscribe = () => {};
    unsubscribe = auth.onAuthStateChanged(
      (user) => {
        unsubscribe();
        authReadyPromise = null;
        resolve(user || null);
      },
      () => {
        unsubscribe();
        authReadyPromise = null;
        resolve(null);
      }
    );
  });
  return authReadyPromise;
}

export function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

export function normalizePassword(value) {
  return String(value || '').trim();
}

export function upsertLocalUser(userData) {
  // Keep only non-sensitive directory data for offline UI helpers.
  const username = String(userData.username || '').trim();
  const safeUser = { ...userData, username, username_lower: normalizeUsername(username) };
  delete safeUser.password;
  delete safeUser.password_hash;
  localStorage.setItem(`simguru_user_${normalizeUsername(username)}`, JSON.stringify(safeUser));
  return safeUser;
}

export function removeLocalUser(username) {
  localStorage.removeItem(`simguru_user_${normalizeUsername(username)}`);
}

export function getEmergencyLocalUser(username) {
  const key = normalizeUsername(username);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(`simguru_user_${key}`);
    if (!raw) return null;
    const user = JSON.parse(raw);
    if (!user?.username || !user?.role) return null;
    return {
      ...user,
      emergency_local: true,
      emergency_reason: 'firestore_quota_exceeded',
    };
  } catch {
    return null;
  }
}

async function getAuthHeaders(forceRefresh = false) {
  const currentUser = await waitForAuthReady();
  const token = currentUser ? await currentUser.getIdToken(forceRefresh) : '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function clearExpiredSession() {
  localStorage.removeItem('simguru_session');
  localStorage.removeItem('simguru_wali');
}

/**
 * Keluar dari akun aktif secara konsisten dari halaman mana pun.
 * Sesi lokal dibersihkan lebih dulu agar router tidak sempat merender ulang
 * halaman terlindungi ketika Firebase sedang menyelesaikan sign-out.
 */
export async function logoutCurrentUser() {
  clearExpiredSession();
  try {
    if (auth?.currentUser) await auth.signOut();
  } catch (error) {
    // Sesi lokal sudah dibersihkan, jadi kegagalan jaringan tidak boleh
    // menahan pengguna di halaman yang memerlukan autentikasi.
    console.warn('Firebase sign-out gagal; sesi lokal tetap dihapus:', error);
  }
}

async function authenticatedFetch(path, options = {}) {
  const headers = { ...(options.headers || {}), ...(await getAuthHeaders()) };
  let response = await fetch(backendUrl(path), { ...options, headers });
  if (response.status === 401 && auth?.currentUser) {
    const retryHeaders = { ...(options.headers || {}), ...(await getAuthHeaders(true)) };
    response = await fetch(backendUrl(path), { ...options, headers: retryHeaders });
  }
  if (response.status === 401) {
    clearExpiredSession();
    if (window.location.hash !== '#login') window.location.hash = '#login';
  }
  return response;
}

const managedUsersCache = new Map();
const chatDirectoryCache = { at: 0, promise: null, data: null };
const MANAGED_USERS_TTL_MS = 60000;
const CHAT_DIRECTORY_TTL_MS = 300000;

export async function getManagedUsers(role = '', kelasId = '') {
  const cacheKey = `${role || 'all'}|${kelasId || ''}`;
  const cached = managedUsersCache.get(cacheKey);
  // Panggilan yang sedang berjalan: kembalikan promise bersama (hindari race yang
  // sebelumnya mengembalikan cached.data === undefined saat cache hanya berisi promise).
  if (cached?.promise) return cached.promise;
  if (cached && Array.isArray(cached.data) && Date.now() - cached.at < MANAGED_USERS_TTL_MS) return cached.data;

  const promise = (async () => {
    const users = [];
    let after = '';
    do {
      const params = new URLSearchParams({ limit: '100' });
      if (role) params.set('role', role);
      if (kelasId) params.set('kelas', kelasId);
      if (after) params.set('after', after);
      const response = await authenticatedFetch(`/api/auth/users?${params.toString()}`);
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(response.status === 401
          ? 'Sesi admin berakhir. Silakan login kembali.'
          : (result.error || 'Data user tidak dapat dimuat.'));
      }
      const result = await response.json();
      users.push(...(Array.isArray(result.users) ? result.users : []));
      after = String(result.nextCursor || '');
    } while (after);
    managedUsersCache.set(cacheKey, { at: Date.now(), data: users });
    return users;
  })().catch((error) => {
    // Jangan simpan promise yang gagal agar percobaan berikutnya memuat ulang.
    managedUsersCache.delete(cacheKey);
    throw error;
  });
  managedUsersCache.set(cacheKey, { at: Date.now(), promise });
  return promise;
}

export async function getManagedUsersPage(role = '', kelasId = '', options = {}) {
  const params = new URLSearchParams({
    limit: String(Math.min(Math.max(Number(options.limit) || 10, 1), 100)),
    includeTotal: options.includeTotal ? 'true' : 'false',
  });
  if (role) params.set('role', role);
  if (kelasId) params.set('kelas', kelasId);
  if (options.after) params.set('after', options.after);
  const response = await authenticatedFetch(`/api/auth/users?${params.toString()}`);
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(response.status === 401
      ? 'Sesi admin berakhir. Silakan login kembali.'
      : (result.error || 'Data user tidak dapat dimuat.'));
  }
  return response.json();
}

export async function getChatDirectory() {
  if (chatDirectoryCache.data && Date.now() - chatDirectoryCache.at < CHAT_DIRECTORY_TTL_MS) {
    return chatDirectoryCache.data;
  }
  if (chatDirectoryCache.promise) return chatDirectoryCache.promise;

  chatDirectoryCache.promise = (async () => {
    const users = [];
    let after = '';
    do {
      const response = await authenticatedFetch(`/api/auth/contacts${after ? `?after=${encodeURIComponent(after)}` : ''}`);
      if (!response.ok) throw new Error('Daftar kontak tidak dapat dimuat.');
      const result = await response.json();
      users.push(...(Array.isArray(result.users) ? result.users : []));
      after = String(result.nextCursor || '');
    } while (after);
    chatDirectoryCache.at = Date.now();
    chatDirectoryCache.data = users;
    return users;
  })().finally(() => {
    chatDirectoryCache.promise = null;
  });
  return chatDirectoryCache.promise;
}

export async function saveManagedUser(userData, existingUsername = '') {
  const response = await authenticatedFetch('/api/auth/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...userData, existing_username: existingUsername || undefined }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Data user tidak dapat disimpan.');
  managedUsersCache.clear();
  chatDirectoryCache.at = 0;
  chatDirectoryCache.data = null;
  return result.user;
}

export async function deleteManagedUser(username) {
  const response = await authenticatedFetch(`/api/auth/users?username=${encodeURIComponent(username)}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Data user tidak dapat dihapus.');
  managedUsersCache.clear();
  chatDirectoryCache.at = 0;
  chatDirectoryCache.data = null;
}

export async function changePassword(password) {
  const response = await authenticatedFetch('/api/auth/account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: normalizePassword(password) }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Password tidak dapat diperbarui.');
  return true;
}

export async function getAiAdminConfig() {
  const response = await authenticatedFetch('/api/ai/config');
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Konfigurasi AI tidak dapat dimuat.');
  return result;
}

export async function saveAiAdminConfig(config) {
  const response = await authenticatedFetch('/api/ai/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Konfigurasi AI tidak dapat disimpan.');
  return result;
}

export async function testAiAdminConfig(config) {
  const response = await authenticatedFetch('/api/ai/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...config, action: 'test' }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Koneksi AI tidak dapat diuji.');
  return result;
}

// ---------------------------------------------------------------------------
// Backup Google Drive
// ---------------------------------------------------------------------------

/** Baca konfigurasi Drive + URL persetujuan Google (khusus admin). */
export async function getDriveBackupConfig() {
  const response = await authenticatedFetch('/api/admin/backup-config');
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Konfigurasi Google Drive tidak dapat dimuat.');
  return result;
}

/** Simpan Client ID/Secret/nama folder Drive (khusus admin). */
export async function saveDriveBackupConfig(config) {
  const response = await authenticatedFetch('/api/admin/backup-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Konfigurasi Google Drive tidak dapat disimpan.');
  return result;
}

/** Putuskan koneksi Drive tanpa menghapus Client ID/Secret. */
export async function disconnectDriveBackup() {
  const response = await authenticatedFetch('/api/admin/backup-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'disconnect' }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Koneksi Google Drive tidak dapat diputus.');
  return result;
}

/**
 * Enkripsi ulang kredensial Drive memakai kunci utama lingkungan server.
 *
 * Diperlukan ketika aplikasi web (yang menulis kredensial) dan proses backup
 * otomatis (yang membacanya) berjalan di lingkungan berbeda dengan variabel
 * lingkungan berbeda, sehingga kunci enkripsinya tidak sama. Tidak ada rahasia
 * yang dikirim ke atau dari peramban; seluruh proses terjadi di server.
 */
export async function reencryptDriveSecrets() {
  const response = await authenticatedFetch('/api/admin/backup-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reencrypt' }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(result.reason || result.error || 'Kunci enkripsi tidak dapat diselaraskan.');
  }
  return result;
}

/**
 * Ambil access token Drive berumur pendek untuk unggahan langsung dari browser.
 * Mengembalikan `{ available:false, reason }` bila Drive belum siap, agar
 * pemanggil dapat melanjutkan backup lokal tanpa memunculkan error keras.
 */
export async function getDriveUploadToken() {
  const response = await authenticatedFetch('/api/admin/backup-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'token' }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) {
    return { available: false, reason: result.error || 'Google Drive belum siap.' };
  }
  return { available: true, ...result };
}

/** Catat metadata unggahan Drive yang sudah selesai. */
export async function recordDriveUpload(meta) {
  try {
    await authenticatedFetch('/api/admin/backup-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(meta || {}), action: 'record-upload' }),
    });
  } catch (error) {
    // Pencatatan bersifat opsional; kegagalan tidak membatalkan unggahan.
    console.warn('Metadata unggahan Drive gagal dicatat:', error);
  }
}

/** Simpan pengaturan jadwal backup otomatis (khusus admin). */
export async function saveBackupSchedule(schedule) {
  const response = await authenticatedFetch('/api/admin/backup-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'schedule', schedule }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Jadwal backup tidak dapat disimpan.');
  return result;
}

/** Simpan pengaturan pengingat backup untuk guru (khusus admin). */
export async function saveBackupReminder(reminder) {
  const response = await authenticatedFetch('/api/admin/backup-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reminder', reminder }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Pengingat backup tidak dapat disimpan.');
  return result;
}

/** Baca pengaturan pengingat backup (guru & admin). Best-effort. */
export async function getBackupReminder() {
  try {
    const response = await authenticatedFetch('/api/admin/backup-config?reminder=1');
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok !== true) return null;
    return result.reminder || null;
  } catch (error) {
    console.warn('Pengaturan pengingat backup gagal dimuat:', error);
    return null;
  }
}

/**
 * Tambahkan entri ke riwayat backup di server (mis. untuk backup otomatis atau
 * kegagalan yang tidak menghasilkan unggahan). Bersifat best-effort.
 */
export async function appendBackupLog(entry) {
  try {
    const response = await authenticatedFetch('/api/admin/backup-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(entry || {}), action: 'log' }),
    });
    const result = await response.json().catch(() => ({}));
    return result;
  } catch (error) {
    console.warn('Riwayat backup gagal dicatat:', error);
    return { ok: false };
  }
}

export async function loginUser(username, password) {
  try {
    const response = await fetch(backendUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: normalizeUsername(username), password: normalizePassword(password) }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      if (response.status === 503) throw new Error(result.error || 'Layanan database sedang tidak tersedia.');
      if (response.status === 401) return null;
      throw new Error(result.error || 'Layanan autentikasi belum siap.');
    }
    const result = await response.json();
    if (!result?.token || !result?.user || !auth) return null;
    await auth.signInWithCustomToken(result.token);
    return upsertLocalUser(result.user);
  } catch (error) {
    console.warn('Login gagal:', error);
    if (error?.message?.includes('Kuota database') || error?.message?.includes('database sedang')) {
      markFirestoreReadQuotaStatus('login');
      throw error;
    }
    if (error instanceof Error && error.message) throw error;
    throw new Error('Layanan login sedang tidak tersedia.');
  }
}

export async function saveSession(userData, context) {
  const session = {
    user: {
      id: userData.id,
      username: userData.username,
      role: userData.role,
      nama: userData.nama,
      kelas_id: userData.kelas_id || userData.kelas || '',
      kelas_nama: userData.kelas_nama || userData.kelas || '',
      kelas: userData.kelas || userData.kelas_nama || userData.kelas_id || '',
      nis: userData.nis || '',
      nisn: userData.nisn || '',
      previous_usernames: Array.isArray(userData.previous_usernames) ? userData.previous_usernames : [],
    },
    firebase_uid: auth?.currentUser?.uid || '',
    emergency_local: Boolean(userData.emergency_local),
    emergency_reason: userData.emergency_reason || '',
    logged_in_at: new Date().toISOString(),
  };

  upsertLocalUser(userData);

  localStorage.setItem('simguru_session', JSON.stringify(session));
  localStorage.setItem('simguru_context', JSON.stringify(context));
  return session;
}
