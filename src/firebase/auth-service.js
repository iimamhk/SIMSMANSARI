import { auth } from './firebase-config.js';

function getBackendBase() {
  const base = typeof window !== 'undefined' ? window.__SIM_BACKEND_URL__ : '';
  return String(base || '').replace(/\/+$/, '');
}

function backendUrl(path) {
  return `${getBackendBase()}${path}`;
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

async function getAuthHeaders() {
  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getManagedUsers(role = '', kelasId = '') {
  const params = new URLSearchParams();
  if (role) params.set('role', role);
  if (kelasId) params.set('kelas', kelasId);
  const query = params.size ? `?${params.toString()}` : '';
  const response = await fetch(backendUrl(`/api/auth/users${query}`), { headers: await getAuthHeaders() });
  if (!response.ok) throw new Error('Data user tidak dapat dimuat.');
  const result = await response.json();
  return Array.isArray(result.users) ? result.users : [];
}

export async function getChatDirectory() {
  const response = await fetch(backendUrl('/api/auth/contacts'), { headers: await getAuthHeaders() });
  if (!response.ok) throw new Error('Daftar kontak tidak dapat dimuat.');
  const result = await response.json();
  return Array.isArray(result.users) ? result.users : [];
}

export async function saveManagedUser(userData, existingUsername = '') {
  const response = await fetch(backendUrl('/api/auth/users'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify({ ...userData, existing_username: existingUsername || undefined }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Data user tidak dapat disimpan.');
  return result.user;
}

export async function deleteManagedUser(username) {
  const response = await fetch(backendUrl(`/api/auth/users?username=${encodeURIComponent(username)}`), {
    method: 'DELETE',
    headers: await getAuthHeaders(),
  });
  if (!response.ok) throw new Error('Data user tidak dapat dihapus.');
}

export async function changePassword(password) {
  const response = await fetch(backendUrl('/api/auth/account'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
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
    if (!response.ok) return null;
    const result = await response.json();
    if (!result?.token || !result?.user || !auth) return null;
    await auth.signInWithCustomToken(result.token);
    return upsertLocalUser(result.user);
  } catch (error) {
    console.warn('Login gagal:', error);
    return null;
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
    },
    firebase_uid: auth?.currentUser?.uid || '',
    logged_in_at: new Date().toISOString(),
  };

  upsertLocalUser(userData);

  localStorage.setItem('simguru_session', JSON.stringify(session));
  localStorage.setItem('simguru_context', JSON.stringify(context));
  return session;
}
