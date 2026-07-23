import { auth } from './firebase-config.js';

function getBackendBase() {
  const base = typeof window !== 'undefined' ? window.__SIM_BACKEND_URL__ : '';
  return String(base || '').replace(/\/+$/, '');
}

function backendUrl(path) {
  return `${getBackendBase()}${path}`;
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
  if (cached && Date.now() - cached.at < MANAGED_USERS_TTL_MS) return cached.data;
  if (cached?.promise) return cached.promise;

  const params = new URLSearchParams();
  if (role) params.set('role', role);
  if (kelasId) params.set('kelas', kelasId);
  const query = params.size ? `?${params.toString()}` : '';
  const promise = (async () => {
    const response = await authenticatedFetch(`/api/auth/users${query}`);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(response.status === 401
        ? 'Sesi admin berakhir. Silakan login kembali.'
        : (result.error || 'Data user tidak dapat dimuat.'));
    }
    const result = await response.json();
    const users = Array.isArray(result.users) ? result.users : [];
    managedUsersCache.set(cacheKey, { at: Date.now(), data: users });
    return users;
  })().finally(() => {
    const current = managedUsersCache.get(cacheKey);
    if (current?.promise) managedUsersCache.set(cacheKey, { at: current.at || Date.now(), data: current.data || [] });
  });
  managedUsersCache.set(cacheKey, { at: Date.now(), promise });
  return promise;
}

export async function getChatDirectory() {
  if (chatDirectoryCache.data && Date.now() - chatDirectoryCache.at < CHAT_DIRECTORY_TTL_MS) {
    return chatDirectoryCache.data;
  }
  if (chatDirectoryCache.promise) return chatDirectoryCache.promise;

  chatDirectoryCache.promise = (async () => {
    const response = await authenticatedFetch('/api/auth/contacts');
    if (!response.ok) throw new Error('Daftar kontak tidak dapat dimuat.');
    const result = await response.json();
    const users = Array.isArray(result.users) ? result.users : [];
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
    if (error?.message?.includes('Kuota database') || error?.message?.includes('database sedang')) throw error;
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
