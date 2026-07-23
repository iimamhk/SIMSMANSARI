export function cleanText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function generateUsername(name) {
  const cleaned = cleanText(name).toLowerCase().replace(/\s+/g, '');
  return cleaned.replace(/[^a-z0-9]/g, '');
}

export function getInitials(name) {
  return String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function getDefaultContext() {
  return {
    tahun_ajaran_aktif: '2026_2027',
    tahun_ajaran_aktif_nama: '2026/2027',
    semester_aktif: '2026_2027_1',
    semester_aktif_nama: 'Semester 1 (Ganjil)',
    user_logged_in: '',
    role: 'guest',
    nama_lengkap: '',
    updated_at: new Date().toISOString(),
  };
}

export function getStoredContext() {
  try {
    const raw = localStorage.getItem('simguru_context');
    return raw ? JSON.parse(raw) : getDefaultContext();
  } catch {
    return getDefaultContext();
  }
}

export function normalizeUserKey(value) {
  return String(value || '').trim().toLowerCase();
}

export function getSessionUserKeys(session = {}, context = {}) {
  const keys = [
    session?.user?.username,
    session?.user?.id,
    session?.user?.nis,
    session?.user?.nisn,
    context?.user_logged_in,
    ...(Array.isArray(session?.user?.previous_usernames) ? session.user.previous_usernames : []),
  ]
    .map((value) => normalizeUserKey(value))
    .filter(Boolean);

  return Array.from(new Set(keys));
}
