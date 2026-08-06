const bcrypt = require('bcryptjs');
const { getAuth, getFirestore } = require('./firebase-admin');
const admin = require('firebase-admin');

const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function normalizePassword(value) {
  return String(value || '').trim();
}

function safeUser(data, id) {
  return {
    id: id || data.id || data.username,
    username: String(data.username || id || '').trim(),
    username_lower: normalizeUsername(data.username || id),
    role: data.role || 'siswa',
    nama: data.nama || '',
    status: data.status || 'active',
    kelas_id: data.kelas_id || data.kelas || '',
    kelas_nama: data.kelas_nama || data.kelas || '',
    kelas: data.kelas || data.kelas_nama || data.kelas_id || '',
    nis: data.nis || '',
    nisn: data.nisn || '',
    mapel: data.mapel || '',
    previous_usernames: Array.isArray(data.previous_usernames) ? data.previous_usernames : [],
  };
}

function validateUserInput(input) {
  const username = normalizeUsername(input.username);
  const password = normalizePassword(input.password);
  if (!USERNAME_PATTERN.test(username)) throw new Error('Username tidak valid.');
  if (!password || password.length > 200) throw new Error('Password tidak valid.');
  return { username, password };
}

async function verifyPassword(userData, password) {
  if (userData.password_hash) return bcrypt.compare(password, userData.password_hash);
  // One-time compatibility path for existing legacy records. The plaintext field
  // is removed immediately after a successful login.
  return Boolean(userData.password) && userData.password === password;
}

async function migrateLegacyPassword(ref, userData, password) {
  if (userData.password_hash || !userData.password) return;
  const passwordHash = await bcrypt.hash(password, 12);
  await ref.update({ password_hash: passwordHash, password: admin.firestore.FieldValue.delete(), updated_at: new Date().toISOString() });
}

async function login(usernameInput, passwordInput) {
  const { username, password } = validateUserInput({ username: usernameInput, password: passwordInput });
  const db = getFirestore();
  let ref = db.collection('users').doc(username);
  let snapshot = await ref.get();
  if (snapshot.exists && normalizeUsername(snapshot.data()?.username || snapshot.id) !== username) {
    snapshot = null;
  }
  if (!snapshot?.exists) {
    const byLower = await db.collection('users').where('username_lower', '==', username).limit(1).get();
    const byUsername = byLower.empty
      ? await db.collection('users').where('username', '==', username).limit(1).get()
      : byLower;
    if (byUsername.empty) return null;
    snapshot = byUsername.docs[0];
    ref = snapshot.ref;
  }
  const data = snapshot.data() || {};
  if (data.status && data.status !== 'active') return null;
  if (!(await verifyPassword(data, password))) return null;
  await migrateLegacyPassword(ref, data, password);

  const user = safeUser(data, snapshot.id);
  const token = await getAuth().createCustomToken(user.id, { role: user.role, username: user.username });
  return { token, user };
}

async function listUsers(role, kelasId = '', options = {}) {
  let query = getFirestore().collection('users');
  if (role) query = query.where('role', '==', role);
  if (kelasId) query = query.where('kelas_id', '==', kelasId);
  const maxResults = Math.min(Math.max(Number(options.limit) || 100, 1), 200);
  let total = null;
  if (options.includeTotal && typeof query.count === 'function') {
    const countSnapshot = await query.count().get();
    total = Number(countSnapshot.data()?.count || 0);
  }
  query = query.orderBy(admin.firestore.FieldPath.documentId()).limit(maxResults);
  if (options.after) query = query.startAfter(String(options.after));
  const snapshot = await query.get();
  const users = snapshot.docs
    .map((doc) => safeUser(doc.data() || {}, doc.id))
    .filter((user) => !role || user.role === role);
  return {
    users,
    total,
    nextCursor: snapshot.size === maxResults ? snapshot.docs[snapshot.docs.length - 1]?.id || null : null,
  };
}

async function saveUser(input, existingUsername) {
  const username = normalizeUsername(input.username);
  if (!USERNAME_PATTERN.test(username)) throw new Error('Username tidak valid.');
  const password = input.password ? normalizePassword(input.password) : '';
  if (password && (password.length < 6 || password.length > 200)) throw new Error('Password harus 6-200 karakter.');
  const db = getFirestore();
  const accountId = normalizeUsername(existingUsername || username);
  const ref = db.collection('users').doc(accountId);
  const initialSnapshot = await ref.get();
  if (!existingUsername && initialSnapshot.exists) throw new Error('Username sudah digunakan oleh akun lain.');
  const initialData = initialSnapshot.exists ? initialSnapshot.data() || {} : {};
  const oldUsername = normalizeUsername(initialData.username || accountId);
  const usernameMatches = await db.collection('users').where('username_lower', '==', username).get();
  if (usernameMatches.docs.some((doc) => doc.id !== accountId)) {
    throw new Error('Username sudah digunakan oleh akun lain.');
  }
  const { password: ignoredPassword, password_hash: ignoredPasswordHash, existing_username: ignoredExistingUsername, ...profile } = input;
  const passwordHash = password ? await bcrypt.hash(password, 12) : '';
  let payload = null;
  await db.runTransaction(async (transaction) => {
    const usernameRef = db.collection('usernames').doc(username);
    const [latestSnapshot, usernameSnapshot] = await Promise.all([
      transaction.get(ref),
      transaction.get(usernameRef),
    ]);
    if (!existingUsername && latestSnapshot.exists) throw new Error('Username sudah digunakan oleh akun lain.');
    const latestData = latestSnapshot.exists ? latestSnapshot.data() || {} : {};
    if (usernameSnapshot.exists && usernameSnapshot.data()?.account_id !== accountId) {
      throw new Error('Username sudah digunakan oleh akun lain.');
    }
    payload = {
      ...latestData,
      ...profile,
      ...safeUser({ ...profile, username }, accountId),
      username,
      username_lower: username,
      updated_at: new Date().toISOString(),
    };
    if (oldUsername !== username || accountId !== username) {
      payload.previous_usernames = Array.from(new Set([
        ...(Array.isArray(latestData.previous_usernames) ? latestData.previous_usernames : []),
        oldUsername,
        accountId,
      ].map(normalizeUsername).filter((item) => item && item !== username)));
    }
    delete payload.id;
    delete payload.password;
    delete payload.password_hash;
    if (passwordHash) payload.password_hash = passwordHash;
    else if (latestData.password_hash) payload.password_hash = latestData.password_hash;
    else if (latestData.password) payload.password_hash = await bcrypt.hash(latestData.password, 12);
    else throw new Error('Password wajib diisi untuk akun baru.');
    transaction.set(ref, payload, { merge: true });
    transaction.set(usernameRef, { account_id: accountId, username, updated_at: new Date().toISOString() });
    if (oldUsername && oldUsername !== username) {
      transaction.set(db.collection('usernames').doc(oldUsername), {
        account_id: accountId,
        username: oldUsername,
        reserved: true,
        updated_at: new Date().toISOString(),
      });
    }
  });
  return safeUser(payload, accountId);
}

async function commitInChunks(db, refs, mutate) {
  for (let index = 0; index < refs.length; index += 400) {
    const batch = db.batch();
    refs.slice(index, index + 400).forEach((ref) => mutate(batch, ref));
    await batch.commit();
  }
}

/**
 * Hapus akun user beserta jejak yang membuatnya masih "hidup" di aplikasi:
 * - dokumen users/{username}
 * - pemetaan login usernames/{username} (termasuk username lama)
 * - keanggotaan kelas anggota_kelas (siswa_id == username) — INI yang membuat
 *   siswa terhapus tetap muncul di daftar kelas guru (absensi/nilai/keaktifan),
 *   karena halaman guru membaca daftar siswa dari anggota_kelas, bukan users.
 *
 * Data historis bernilai arsip (nilai_tugas, nilai_ujian, absensi, keaktifan_siswa)
 * sengaja TIDAK dihapus agar rekap lampau tetap utuh.
 * @returns {Promise<{ users:number, usernames:number, anggota_kelas:number }>}
 */
async function deleteUser(usernameInput) {
  const username = normalizeUsername(usernameInput);
  if (!username) throw new Error('Username wajib diisi.');
  const db = getFirestore();

  const userRef = db.collection('users').doc(username);
  const snapshot = await userRef.get();
  const data = snapshot.exists ? snapshot.data() || {} : {};

  // Semua varian username (utama + sebelumnya) agar dokumen turunan ikut bersih.
  const usernameVariants = Array.from(new Set([
    username,
    normalizeUsername(data.username),
    ...(Array.isArray(data.previous_usernames) ? data.previous_usernames : []),
  ].map(normalizeUsername).filter(Boolean)));

  // Nilai yang mungkin dipakai sebagai siswa_id pada anggota_kelas. Sebagian
  // dokumen lama di-key dengan NIS/NISN (bukan username), jadi kita cocokkan
  // keduanya agar keanggotaan tetap terhapus. Tidak dinormalisasi lowercase
  // karena NIS/NISN berupa angka dan disimpan apa adanya.
  const membershipKeys = Array.from(new Set([
    ...usernameVariants,
    String(data.nis || '').trim(),
    String(data.nisn || '').trim(),
  ].filter(Boolean)));

  // Kumpulkan keanggotaan kelas berdasar siswa_id (operator "in" maks 10 nilai).
  const membershipRefs = [];
  const seenMembershipIds = new Set();
  for (let index = 0; index < membershipKeys.length; index += 10) {
    const chunk = membershipKeys.slice(index, index + 10);
    // eslint-disable-next-line no-await-in-loop
    const membershipSnapshot = await db.collection('anggota_kelas')
      .where('siswa_id', 'in', chunk)
      .get();
    membershipSnapshot.docs.forEach((doc) => {
      if (seenMembershipIds.has(doc.id)) return;
      seenMembershipIds.add(doc.id);
      membershipRefs.push(doc.ref);
    });
  }

  await commitInChunks(db, membershipRefs, (batch, ref) => batch.delete(ref));

  const identityRefs = [
    userRef,
    ...usernameVariants.map((value) => db.collection('usernames').doc(value)),
  ];
  await commitInChunks(db, identityRefs, (batch, ref) => batch.delete(ref));

  return {
    users: 1,
    usernames: usernameVariants.length,
    anggota_kelas: membershipRefs.length,
  };
}

module.exports = { login, listUsers, saveUser, safeUser, normalizeUsername, deleteUser };
