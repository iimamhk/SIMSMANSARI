import { db } from './firebase-config.js';

export function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

export function normalizePassword(value) {
  return String(value || '').trim();
}

function getLocalUsers() {
  try {
    return JSON.parse(localStorage.getItem('simguru_users') || '[]');
  } catch {
    return [];
  }
}

function saveLocalUsers(users) {
  localStorage.setItem('simguru_users', JSON.stringify(users));
}

export function upsertLocalUser(userData) {
  const users = getLocalUsers();
  const username = String(userData.username || '').trim();
  const normalizedUser = {
    ...userData,
    username,
    username_lower: normalizeUsername(username),
    password: normalizePassword(userData.password),
  };
  const existingIndex = users.findIndex((item) => normalizeUsername(item.username) === normalizeUsername(normalizedUser.username));
  if (existingIndex >= 0) {
    users[existingIndex] = normalizedUser;
  } else {
    users.push(normalizedUser);
  }
  saveLocalUsers(users);
}

export function removeLocalUser(username) {
  const normalizedUsername = normalizeUsername(username);
  const users = getLocalUsers().filter((item) => normalizeUsername(item.username) !== normalizedUsername);
  saveLocalUsers(users);
}

export async function loginUser(username, password) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedPassword = normalizePassword(password);
  const localUsers = getLocalUsers();
  const cachedUser = localUsers.find((item) => normalizeUsername(item.username) === normalizedUsername && normalizePassword(item.password) === normalizedPassword);
  if (cachedUser) {
    return cachedUser;
  }

  if (!db) {
    return null;
  }

  try {
    const snapshot = await db.collection('users').get();
    const userDoc = snapshot.docs.find((doc) => {
      const userData = doc.data();
      return normalizeUsername(userData.username) === normalizedUsername && normalizePassword(userData.password) === normalizedPassword;
    });

    if (!userDoc) {
      return null;
    }

    const userData = userDoc.data();
    const normalizedUser = {
      id: userDoc.id,
      ...userData,
      username: String(userData.username || '').trim(),
      username_lower: normalizeUsername(userData.username),
      password: normalizePassword(userData.password),
    };

    upsertLocalUser(normalizedUser);
    return normalizedUser;
  } catch (error) {
    console.warn('Login gagal saat membaca Firestore:', error);
    return null;
  }
}

export async function saveSession(userData, context) {
  const existingLocalUser = getLocalUsers().find((item) => normalizeUsername(item.username) === normalizeUsername(userData.username));
  const session = {
    user: {
      id: userData.id,
      username: userData.username,
      role: userData.role,
      nama: userData.nama,
    },
    logged_in_at: new Date().toISOString(),
  };

  upsertLocalUser({
    ...(existingLocalUser || {}),
    ...userData,
    id: userData.id,
    username: userData.username,
    role: userData.role,
    nama: userData.nama,
  });

  localStorage.setItem('simguru_session', JSON.stringify(session));
  localStorage.setItem('simguru_context', JSON.stringify(context));
  return session;
}
