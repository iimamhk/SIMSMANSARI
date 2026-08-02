import { db } from './firebase-config.js';
import { getChatDirectory, getManagedUsers } from './auth-service.js';

const MATERIAL_PUBLISHED_KEY = 'simguru_material_html_published';
const MATERIAL_PUBLISHED_COLLECTION = 'materi_publish';
const MATERIAL_WORKSPACE_DRAFTS_COLLECTION = 'materi_workspace_drafts';
const MATERIAL_READS_KEY = 'simguru_material_reads';
const MATERIAL_READS_COLLECTION = 'materi_reads';
const QUERY_CACHE_TTL_MS = 60000;
const COLLECTION_CACHE_TTL_MS = 300000;
// Optimasi #2: koleksi statis (settings, mata_pelajaran, kelas, tahun_ajaran,
// pengajaran, pembelajaran, wali_kelas) nyaris tak berubah harian dan setiap
// penulisan sudah meng-invalidasi cache-nya, jadi TTL dinaikkan dari 30 menit
// menjadi 12 jam untuk memangkas read berulang antar sesi/cold start.
const STATIC_COLLECTION_CACHE_TTL_MS = 43200000;
function getFirestoreReadStatusKey() {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage?.getItem('simguru_session') : null;
    const session = raw ? JSON.parse(raw) : null;
    const uid = session?.user?.id || session?.user?.username || '';
    return `simguru_firestore_read_status_${uid}`;
  } catch { return 'simguru_firestore_read_status'; }
}
const queryCache = new Map();
const PERSISTENT_CACHE_PREFIX = 'simguru_pcache_';
const PERSISTENT_CACHE_TTL_MS = 7200000;
// Optimasi #1: TTL default cache localStorage untuk HASIL QUERY (getDocumentsWhere
// dengan opsi persist). Bertahan melintasi cold start sehingga membuka ulang
// aplikasi tidak selalu membaca ulang dari server. Penulisan pada koleksi terkait
// akan meng-invalidasi entri ini (lihat invalidatePersistentQueryCache).
const PERSISTENT_QUERY_CACHE_TTL_MS = 21600000; // 6 jam
const MATERIAL_QUERY_PERSIST_TTL_MS = 1800000; // 30 menit (materi bisa terbit kapan saja)
const FIRESTORE_QUOTA_COOLDOWN_MS = 120000;

const STATIC_COLLECTIONS = new Set([
  'settings',
  'mata_pelajaran',
  'kelas',
  'tahun_ajaran',
  'pengajaran',
  'pembelajaran',
  'wali_kelas',
]);

function isFirestoreReadQuotaError(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code === 'resource-exhausted'
    || message.includes('quota')
    || message.includes('resource exhausted');
}

function setFirestoreReadStatus(status) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (!status) {
      localStorage.removeItem(getFirestoreReadStatusKey());
      return;
    }
    localStorage.setItem(getFirestoreReadStatusKey(), JSON.stringify(status));
  } catch {
    // Ignore localStorage issues.
  }
}

function markFirestoreReadQuotaExceeded(source = '', error = null) {
  setFirestoreReadStatus({
    state: 'exhausted',
    source: String(source || ''),
    message: String(error?.message || 'Firestore read quota exceeded'),
    detected_at: new Date().toISOString(),
  });
}

function clearFirestoreReadQuotaStatus() {
  const current = (() => {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
      return JSON.parse(localStorage.getItem(getFirestoreReadStatusKey()) || 'null');
    } catch {
      return null;
    }
  })();
  if (current?.state === 'exhausted') {
    setFirestoreReadStatus({
      state: 'ok',
      source: '',
      message: '',
      detected_at: '',
      recovered_at: new Date().toISOString(),
    });
  }
}

function isReadQuotaExhausted() {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    const raw = localStorage.getItem(getFirestoreReadStatusKey());
    if (!raw) return false;
    const status = JSON.parse(raw);
    if (status?.state !== 'exhausted') return false;
    const detectedAt = new Date(status.detected_at || 0).getTime();
    if (!Number.isFinite(detectedAt) || Date.now() - detectedAt >= FIRESTORE_QUOTA_COOLDOWN_MS) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function withQueryCache(key, loader, ttlMs = QUERY_CACHE_TTL_MS) {
  const now = Date.now();
  const cached = queryCache.get(key);

  if (cached) {
    const isExpired = now - cached.createdAt >= ttlMs;
    if (!isExpired) {
      return cached.promise;
    }
    if (isReadQuotaExhausted()) {
      return cached.promise;
    }
    queryCache.delete(key);
  }

  if (isReadQuotaExhausted()) {
    const error = new Error('Kuota baca Firestore sedang dalam masa pemulihan.');
    error.code = 'resource-exhausted';
    return Promise.reject(error);
  }

  const promise = Promise.resolve()
    .then(loader)
    .catch((error) => {
      queryCache.delete(key);
      throw error;
    });
  queryCache.set(key, { createdAt: now, promise });
  return promise;
}

function invalidateQueryCache(collectionName = '') {
  if (!collectionName) {
    queryCache.clear();
    return;
  }
  const target = String(collectionName || '');
  for (const key of queryCache.keys()) {
    const segments = key.split(':');
    const isStandardKey = segments.length >= 2
      && ['persistent', 'collection', 'query'].includes(segments[0])
      && segments[1] === target;
    const isScopedCollectionKey = key.startsWith(`${target}:`);
    if (isStandardKey || isScopedCollectionKey) {
      queryCache.delete(key);
    }
  }
}

function updatePersistentCache(collectionName, updatedDoc) {
  const cached = getPersistentCache(collectionName);
  if (!cached || !Array.isArray(cached)) return;
  const index = cached.findIndex((doc) => doc.id === updatedDoc.id);
  if (index >= 0) {
    cached[index] = { ...cached[index], ...updatedDoc };
  } else {
    cached.push(updatedDoc);
  }
  setPersistentCache(collectionName, cached);
}

function getPersistentCache(key) {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = localStorage.getItem(PERSISTENT_CACHE_PREFIX + key);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.at < cached.ttl) return cached.data;
    localStorage.removeItem(PERSISTENT_CACHE_PREFIX + key);
    return null;
  } catch { return null; }
}

function setPersistentCache(key, data, ttlMs = PERSISTENT_CACHE_TTL_MS) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(PERSISTENT_CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), ttl: ttlMs, data }));
  } catch { /* localStorage full or disabled */ }
}

function clearPersistentCache(key) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (key) { localStorage.removeItem(PERSISTENT_CACHE_PREFIX + key); return; }
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PERSISTENT_CACHE_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

// Optimasi #1: hapus cache localStorage hasil query (kunci `query:<koleksi>:...`)
// untuk satu koleksi. Dipanggil setiap kali ada penulisan agar data yang
// dipersist tidak basi setelah create/update/delete pada koleksi tersebut.
function invalidatePersistentQueryCache(collectionName = '') {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const target = String(collectionName || '');
    const prefix = target
      ? `${PERSISTENT_CACHE_PREFIX}query:${target}:`
      : `${PERSISTENT_CACHE_PREFIX}query:`;
    Object.keys(localStorage)
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Abaikan kegagalan localStorage.
  }
}

function normalizeClassKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Firestore menolak field bernilai undefined. Bersihkan payload agar aman
// disimpan ke Firestore (undefined dihilangkan, null tetap diizinkan).
function sanitizeForFirestore(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForFirestore(item));
  }
  if (value && typeof value === 'object') {
    const cleaned = {};
    Object.keys(value).forEach((key) => {
      const nested = value[key];
      if (nested === undefined) {
        return;
      }
      cleaned[key] = sanitizeForFirestore(nested);
    });
    return cleaned;
  }
  return value;
}

function getActivePeriod(context) {
  return {
    year: context?.tahun_ajaran_aktif || '',
    semester: context?.semester_aktif || '',
  };
}

function getCachedUsers() {
  // User directory data is intentionally not cached as a collection in the browser.
  // Demo assignments are available only when explicitly supplied by the application.
  return [];
}

function getDemoTeachingAssignments(context) {
  const { year, semester } = getActivePeriod(context);
  const users = getCachedUsers();
  const teachers = users.filter((item) => item?.role === 'guru');
  const students = users.filter((item) => item?.role === 'siswa');

  const classesMap = new Map();
  students.forEach((student) => {
    const kelasId = String(student.kelas_id || student.kelas_nama || '').trim();
    const kelasNama = String(student.kelas_nama || student.kelas_id || '').trim();
    if (!kelasId && !kelasNama) return;
    const key = kelasId || kelasNama;
    if (!classesMap.has(key)) {
      classesMap.set(key, {
        kelas_id: kelasId || kelasNama,
        kelas_nama: kelasNama || kelasId,
      });
    }
  });

  const classes = Array.from(classesMap.values());
  if (!teachers.length || !classes.length || !year || !semester) {
    return [];
  }

  return classes.flatMap((kelas, classIndex) => {
    const teacher = teachers[classIndex % teachers.length];
    const mapelNama = String(teacher?.mapel || teacher?.mapel_nama || 'Mata Pelajaran').trim() || 'Mata Pelajaran';
    const mapelId = normalizeClassKey(mapelNama) || `mapel_${classIndex + 1}`;
    const kelasMembers = students
      .filter((student) => String(student.kelas_id || student.kelas_nama || '').trim() === (kelas.kelas_id || kelas.kelas_nama))
      .map(mapStudentToMember)
      .sort((a, b) => Number(a.nomor_absen || 9999) - Number(b.nomor_absen || 9999));

    return [{
      id: `${year}_${semester}_${teacher.username || teacher.id || `guru_${classIndex + 1}`}_${kelas.kelas_id}_${mapelId}`,
      tahun_ajaran_id: year,
      semester_id: semester,
      guru_id: teacher.username || teacher.id || '',
      guru_nama: teacher.nama || 'Guru',
      mapel_id: mapelId,
      mapel_nama: mapelNama,
      kelas_id: kelas.kelas_id,
      kelas_nama: kelas.kelas_nama,
      hari: '',
      jam_ke: '',
      siswa: kelasMembers,
      is_demo: true,
    }];
  });
}

function readLocalPublishedMaterials() {
  try {
    return JSON.parse(localStorage.getItem(MATERIAL_PUBLISHED_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeLocalPublishedMaterials(materials) {
  localStorage.setItem(MATERIAL_PUBLISHED_KEY, JSON.stringify(materials));
}

function readLocalMaterialReads() {
  try {
    return JSON.parse(localStorage.getItem(MATERIAL_READS_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeLocalMaterialReads(reads) {
  localStorage.setItem(MATERIAL_READS_KEY, JSON.stringify(reads));
}

function normalizeTrackingToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeUserKey(value) {
  return String(value || '').trim().toLowerCase();
}

function mergeMaterialsById(primaryMaterials = [], secondaryMaterials = []) {
  const mergedMap = new Map();
  [...secondaryMaterials, ...primaryMaterials].forEach((item) => {
    const materialId = String(item?.id || '').trim();
    if (!materialId) {
      return;
    }
    mergedMap.set(materialId, { ...mergedMap.get(materialId), ...item, id: materialId });
  });
  return Array.from(mergedMap.values());
}

/**
 * Token kelas untuk array `kelas_ids` pada koleksi materi publish.
 * Sama bentuknya dengan normalisasi kelas di modul lain: huruf kecil, non-alfanumerik → "_".
 */
export function normalizeMaterialClassToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getFallbackClassMembersFor(kelasId) {
  const normalizedKelas = normalizeClassKey(kelasId);
  const fallbackMap = {
    x_1: [
      { id: 'adityabayupremana', siswa_id: 'adityabayupremana', siswa_nama: 'ADITYA BAYU PERMANA', nomor_absen: 1 },
      { id: 'budi', siswa_id: 'budi', siswa_nama: 'BUDI SANTOSO', nomor_absen: 2 },
    ],
    x_2: [
      { id: 'citra', siswa_id: 'citra', siswa_nama: 'CITRA LESTARI', nomor_absen: 1 },
    ],
    xi_1: [
      { id: 'dina', siswa_id: 'dina', siswa_nama: 'DINA AYU', nomor_absen: 1 },
      { id: 'eka', siswa_id: 'eka', siswa_nama: 'EKA PRATAMA', nomor_absen: 2 },
    ],
    xii_1: [
      { id: 'fajar', siswa_id: 'fajar', siswa_nama: 'FAJAR HIDAYAT', nomor_absen: 1 },
    ],
    xii_2: [
      { id: 'gita', siswa_id: 'gita', siswa_nama: 'GITA NURMALA', nomor_absen: 1 },
      { id: 'hadi', siswa_id: 'hadi', siswa_nama: 'HADI SAPUTRA', nomor_absen: 2 },
    ],
    xii_2_2: [
      { id: 'gita', siswa_id: 'gita', siswa_nama: 'GITA NURMALA', nomor_absen: 1 },
      { id: 'hadi', siswa_id: 'hadi', siswa_nama: 'HADI SAPUTRA', nomor_absen: 2 },
    ],
    kelas_xii_2: [
      { id: 'gita', siswa_id: 'gita', siswa_nama: 'GITA NURMALA', nomor_absen: 1 },
      { id: 'hadi', siswa_id: 'hadi', siswa_nama: 'HADI SAPUTRA', nomor_absen: 2 },
    ],
  };

  return (fallbackMap[normalizedKelas] || fallbackMap[normalizeClassKey(String(kelasId).replace(/\./g, '_'))] || []).map((student) => ({ ...student, kelas_id: kelasId, kelas_nama: kelasId }));
}

function mapStudentToMember(student) {
  return {
    id: student.username || student.id || student.siswa_id,
    siswa_id: student.username || student.id || student.siswa_id,
    siswa_nama: student.nama || student.siswa_nama || student.name || '-',
    nomor_absen: student.nomor_absen || 0,
    kelas_id: student.kelas_id || '',
    kelas_nama: student.kelas_nama || '',
  };
}

function deduplicateClassMembers(members = []) {
  const membersById = new Map();
  members.forEach((member) => {
    const studentId = normalizeUserKey(member?.siswa_id || member?.id);
    if (!studentId) return;
    const existing = membersById.get(studentId);
    const existingUpdatedAt = String(existing?.updated_at || existing?.created_at || '');
    const nextUpdatedAt = String(member?.updated_at || member?.created_at || '');
    if (!existing || nextUpdatedAt >= existingUpdatedAt) {
      membersById.set(studentId, {
        ...member,
        id: member.siswa_id || member.id,
        siswa_id: member.siswa_id || member.id,
      });
    }
  });
  return Array.from(membersById.values())
    .sort((a, b) => Number(a.nomor_absen || 9999) - Number(b.nomor_absen || 9999));
}

async function getDocsFromCollection(collectionName) {
  if (!db) {
    return [];
  }

  try {
    const snapshot = await db.collection(collectionName).get();
    clearFirestoreReadQuotaStatus();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    if (isFirestoreReadQuotaError(error)) {
      markFirestoreReadQuotaExceeded(`collection:${collectionName}`, error);
    }
    console.warn(`Gagal membaca koleksi ${collectionName}:`, error);
    throw error;
  }
}

export async function getCollectionDocs(collectionName, options = {}) {
  const defaultCacheMs = STATIC_COLLECTIONS.has(collectionName)
    ? STATIC_COLLECTION_CACHE_TTL_MS
    : COLLECTION_CACHE_TTL_MS;
  const cacheMs = Number(options.cacheMs || defaultCacheMs);
  const loadFromFirestore = async () => {
    const data = await getDocsFromCollection(collectionName);
    if (STATIC_COLLECTIONS.has(collectionName)) {
      setPersistentCache(collectionName, data, STATIC_COLLECTION_CACHE_TTL_MS);
    }
    return data;
  };
  try {
    if (STATIC_COLLECTIONS.has(collectionName)) {
      return await withQueryCache(`persistent:${collectionName}`, async () => {
        const persistent = getPersistentCache(collectionName);
        if (persistent) return persistent;
        return loadFromFirestore();
      }, cacheMs);
    }
    return await withQueryCache(`collection:${collectionName}`, loadFromFirestore, cacheMs);
  } catch (error) {
    if (options.throwOnError) throw error;
    const persistent = STATIC_COLLECTIONS.has(collectionName) ? getPersistentCache(collectionName) : null;
    return Array.isArray(persistent) ? persistent : [];
  }
}

export async function deleteDocumentsBatch(collectionName, ids = []) {
  if (!db || !ids.length) return 0;
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  let deleted = 0;
  for (let i = 0; i < uniqueIds.length; i += 400) {
    const chunk = uniqueIds.slice(i, i + 400);
    const batch = db.batch();
    chunk.forEach((id) => {
      batch.delete(db.collection(collectionName).doc(id));
    });
    await batch.commit();
    deleted += chunk.length;
  }
  invalidateQueryCache(collectionName);
  invalidatePersistentQueryCache(collectionName);
  if (STATIC_COLLECTIONS.has(collectionName)) {
    const cached = getPersistentCache(collectionName);
    if (Array.isArray(cached)) {
      const remaining = cached.filter((doc) => !uniqueIds.includes(doc.id));
      setPersistentCache(collectionName, remaining);
    }
  }
  return deleted;
}

export async function batchWrite(operations = []) {
  if (!db || !operations.length) return 0;
  let written = 0;
  for (let i = 0; i < operations.length; i += 400) {
    const chunk = operations.slice(i, i + 400);
    const batch = db.batch();
    chunk.forEach((op) => {
      const ref = db.collection(op.collection).doc(op.id);
      if (op.type === 'delete') {
        batch.delete(ref);
      } else if (op.type === 'set') {
        batch.set(ref, sanitizeForFirestore(op.payload), { merge: op.merge !== false });
      } else if (op.type === 'update') {
        batch.update(ref, sanitizeForFirestore(op.payload));
      }
    });
    await batch.commit();
    written += chunk.length;
  }
  // Optimasi #1: batch bisa menyentuh banyak koleksi sekaligus. Invalidasi cache
  // (in-memory + localStorage query) tiap koleksi agar pembacaan berikutnya segar.
  const touchedCollections = new Set(
    operations.map((op) => op && op.collection).filter(Boolean)
  );
  touchedCollections.forEach((coll) => {
    invalidateQueryCache(coll);
    invalidatePersistentQueryCache(coll);
  });
  return written;
}

export async function getDocumentsWhere(collectionName, filters = [], options = {}) {
  if (!db) {
    return [];
  }

  const load = async () => {
    let query = db.collection(collectionName);
    filters.forEach(({ field, operator = '==', value }) => {
      query = query.where(field, operator, value);
    });
    if (options.orderBy) {
      query = query.orderBy(options.orderBy, options.orderDirection || 'desc');
    }
    const resultLimit = Number(options.limit || 0);
    if (resultLimit > 0) {
      query = query.limit(resultLimit);
    }
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  };

  try {
    const cacheMs = Number(options.cacheMs || 0);
    if (isReadQuotaExhausted() && cacheMs <= 0) {
      const error = new Error('Kuota baca Firestore sedang dalam masa pemulihan.');
      error.code = 'resource-exhausted';
      throw error;
    }
    if (cacheMs > 0) {
      const queryOptions = {
        orderBy: options.orderBy || '',
        orderDirection: options.orderDirection || 'desc',
        limit: Number(options.limit || 0),
      };
      const queryKey = `query:${collectionName}:${JSON.stringify(filters)}:${JSON.stringify(queryOptions)}`;
      // Optimasi #1: bila persist aktif, layani dari cache localStorage lebih dulu
      // (0 read) dan simpan hasil server agar bertahan melintasi cold start.
      const persist = Boolean(options.persist);
      const persistTtlMs = Number(options.persistTtlMs || PERSISTENT_QUERY_CACHE_TTL_MS);
      return withQueryCache(queryKey, async () => {
        if (persist) {
          const cachedPersistent = getPersistentCache(queryKey);
          if (Array.isArray(cachedPersistent)) {
            return cachedPersistent;
          }
        }
        const data = await load();
        clearFirestoreReadQuotaStatus();
        if (persist) {
          setPersistentCache(queryKey, data, persistTtlMs);
        }
        return data;
      }, cacheMs);
    }
    const data = await load();
    clearFirestoreReadQuotaStatus();
    return data;
  } catch (error) {
    if (isFirestoreReadQuotaError(error)) {
      markFirestoreReadQuotaExceeded(`query:${collectionName}`, error);
    }
    console.warn(`Gagal query dokumen dari koleksi ${collectionName}:`, error);
    if (options.throwOnError) throw error;
    return [];
  }
}

export async function getDashboardCounts(context) {
  const { year, semester } = getActivePeriod(context);
  if (!year || !semester || !db) return null;
  try {
    const doc = await db.collection('dashboard_counts').doc(`${year}_${semester}`).get();
    if (doc.exists) {
      const data = doc.data();
      if (Date.now() - new Date(data.updated_at || 0).getTime() < 300000) {
        return { id: doc.id, ...data };
      }
    }
  } catch { /* fallback ke perhitungan manual */ }
  return null;
}

export async function recalculateDashboardCounts(context) {
  const { year, semester } = getActivePeriod(context);
  if (!year || !semester || !db) return null;
  try {
    const countQuery = async (query) => {
      if (typeof query.count === 'function') {
        const snapshot = await query.count().get();
        return Number(snapshot.data()?.count || 0);
      }
      const snapshot = await query.get();
      return snapshot.size;
    };
    const [jumlahMapel, jumlahKelas, jumlahPengajaran, jumlahGuru, jumlahSiswa] = await Promise.all([
      countQuery(db.collection('mata_pelajaran')),
      countQuery(db.collection('kelas')),
      countQuery(db.collection('pengajaran')
        .where('tahun_ajaran_id', '==', year)
        .where('semester_id', '==', semester)),
      countQuery(db.collection('users').where('role', '==', 'guru')),
      countQuery(db.collection('users').where('role', '==', 'siswa')),
    ]);
    const counts = {
      jumlah_guru: jumlahGuru,
      jumlah_siswa: jumlahSiswa,
      jumlah_mapel: jumlahMapel,
      jumlah_kelas: jumlahKelas,
      jumlah_pengajaran: jumlahPengajaran,
      updated_at: new Date().toISOString(),
    };
    const docId = `${year}_${semester}`;
    try {
      await db.collection('dashboard_counts').doc(docId).set(counts, { merge: true });
    } catch (error) {
      console.warn('Statistik berhasil dihitung tetapi cache dashboard gagal disimpan:', error);
    }
    return counts;
  } catch (error) {
    console.warn('Gagal menghitung statistik dashboard:', error);
    return null;
  }
}

export async function saveDocument(collectionName, payload, id = null) {
  if (!db) {
    return null;
  }

  const safePayload = sanitizeForFirestore(payload);
  const ref = id ? db.collection(collectionName).doc(id) : db.collection(collectionName).doc();
  await ref.set(safePayload, { merge: true });
  invalidateQueryCache(collectionName);
  invalidatePersistentQueryCache(collectionName);
  if (STATIC_COLLECTIONS.has(collectionName)) {
    updatePersistentCache(collectionName, { id: ref.id, ...safePayload });
  } else {
    const cached = getPersistentCache(collectionName);
    if (Array.isArray(cached)) {
      const index = cached.findIndex((doc) => doc.id === (id || ref.id));
      if (index >= 0) {
        cached[index] = { ...cached[index], ...safePayload, id: id || ref.id };
      } else {
        cached.push({ id: id || ref.id, ...safePayload });
      }
      setPersistentCache(collectionName, cached);
    }
  }
  return { id: ref.id, ...safePayload };
}

export async function getAppConfig() {
  try {
    if (!db) {
      return JSON.parse(localStorage.getItem('simguru_settings') || '{}');
    }

    const snapshot = await db.collection('settings').doc('app_config').get();
    return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : JSON.parse(localStorage.getItem('simguru_settings') || '{}');
  } catch (error) {
    console.warn('Gagal membaca konfigurasi aplikasi:', error);
    return JSON.parse(localStorage.getItem('simguru_settings') || '{}');
  }
}

export async function saveAppConfig(payload) {
  const normalizedPayload = {
    ...payload,
    updated_at: new Date().toISOString(),
  };

  try {
    if (db) {
      await saveDocument('settings', normalizedPayload, 'app_config');
    }
    localStorage.setItem('simguru_settings', JSON.stringify(normalizedPayload));
    return normalizedPayload;
  } catch (error) {
    console.warn('Gagal menyimpan konfigurasi aplikasi:', error);
    localStorage.setItem('simguru_settings', JSON.stringify(normalizedPayload));
    return normalizedPayload;
  }
}

export async function getAttendanceRecords(context, pengajaranId = '') {
  const { year, semester } = getActivePeriod(context);
  if (!year || !semester) {
    return [];
  }

  try {
    const filters = [
      { field: 'tahun_ajaran_id', value: year },
      { field: 'semester_id', value: semester },
    ];
    if (pengajaranId) filters.push({ field: 'pengajaran_id', value: pengajaranId });
    return await getDocumentsWhere('absensi', filters);
  } catch (error) {
    console.warn('Gagal mengambil data absensi dari Firestore, memakai data cadangan:', error);
    return [];
  }
}

function isFirestoreIndexError(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code.includes('failed-precondition') && message.includes('requires an index');
}

export async function getAttendanceRecordsByDate(context, pengajaranId = '', date = '') {
  const { year, semester } = getActivePeriod(context);
  const targetDate = String(date || '').trim();
  if (!year || !semester || !targetDate) {
    return [];
  }

  try {
    const filters = [
      { field: 'tahun_ajaran_id', value: year },
      { field: 'semester_id', value: semester },
      { field: 'tanggal', value: targetDate },
    ];
    if (pengajaranId) filters.push({ field: 'pengajaran_id', value: pengajaranId });
    return await getDocumentsWhere('absensi', filters, { cacheMs: 20000, throwOnError: true });
  } catch (error) {
    if (isFirestoreIndexError(error) && pengajaranId) {
      try {
        // Fallback tanpa composite index: query 1 field lalu filter di client.
        const docs = await getDocumentsWhere('absensi', [{ field: 'pengajaran_id', value: pengajaranId }], { cacheMs: 15000 });
        return docs.filter((item) => String(item.tahun_ajaran_id || '') === String(year)
          && String(item.semester_id || '') === String(semester)
          && String(item.tanggal || '') === targetDate);
      } catch (fallbackError) {
        console.warn('Fallback absensi harian juga gagal:', fallbackError);
      }
    }
    console.warn('Gagal mengambil data absensi harian dari Firestore, memakai data cadangan:', error);
    return [];
  }
}

export async function getAttendanceRecordsByDateRange(context, pengajaranId = '', startDate = '', endDate = '') {
  const { year, semester } = getActivePeriod(context);
  const start = String(startDate || '').trim();
  const end = String(endDate || '').trim();
  if (!year || !semester || !start || !end) {
    return [];
  }

  try {
    const filters = [
      { field: 'tahun_ajaran_id', value: year },
      { field: 'semester_id', value: semester },
      { field: 'tanggal', operator: '>=', value: start },
      { field: 'tanggal', operator: '<=', value: end },
    ];
    if (pengajaranId) filters.push({ field: 'pengajaran_id', value: pengajaranId });
    return await getDocumentsWhere('absensi', filters, { cacheMs: 30000, throwOnError: true });
  } catch (error) {
    if (isFirestoreIndexError(error) && pengajaranId) {
      try {
        // Fallback tanpa composite index: query 1 field lalu filter di client.
        const docs = await getDocumentsWhere('absensi', [{ field: 'pengajaran_id', value: pengajaranId }], { cacheMs: 20000 });
        return docs.filter((item) => {
          const tanggal = String(item.tanggal || '');
          return String(item.tahun_ajaran_id || '') === String(year)
            && String(item.semester_id || '') === String(semester)
            && tanggal >= start
            && tanggal <= end;
        });
      } catch (fallbackError) {
        console.warn('Fallback absensi rentang tanggal juga gagal:', fallbackError);
      }
    }
    console.warn('Gagal mengambil data absensi rentang tanggal dari Firestore, memakai data cadangan:', error);
    return [];
  }
}

export async function deleteDocument(collectionName, id) {
  if (!db) {
    return false;
  }

  await db.collection(collectionName).doc(id).delete();
  invalidateQueryCache(collectionName);
  invalidatePersistentQueryCache(collectionName);
  if (STATIC_COLLECTIONS.has(collectionName)) {
    const cached = getPersistentCache(collectionName);
    if (Array.isArray(cached)) {
      const remaining = cached.filter((doc) => doc.id !== id);
      setPersistentCache(collectionName, remaining);
    }
  }
  return true;
}

function buildAttendanceSummaryId(context, siswaId) {
  const { year, semester } = getActivePeriod(context);
  return `${year}__${semester}__${normalizeUserKey(siswaId)}`;
}

function attendanceCounterField(status) {
  return ({ H: 'total_hadir', S: 'total_sakit', I: 'total_izin', A: 'total_alpa', K: 'total_keluar_kelas' })[status] || '';
}

function buildAttendanceCounts(records = []) {
  const counts = { total_hadir: 0, total_sakit: 0, total_izin: 0, total_alpa: 0, total_keluar_kelas: 0, total_catatan: 0 };
  records.forEach((record) => {
    const field = attendanceCounterField(record.status);
    if (field) counts[field] += 1;
    counts.total_catatan += 1;
  });
  return counts;
}

export async function saveAttendanceRecord(payload) {
  if (!db || !payload?.id || !payload?.siswa_id) return null;
  const context = { tahun_ajaran_aktif: payload.tahun_ajaran_id, semester_aktif: payload.semester_id };
  const attendanceRef = db.collection('absensi').doc(payload.id);
  const summaryRef = db.collection('absensi_ringkasan_siswa').doc(buildAttendanceSummaryId(context, payload.siswa_id));
  const safePayload = sanitizeForFirestore(payload);

  try {
    await db.runTransaction(async (transaction) => {
      const [previousSnapshot, summarySnapshot] = await Promise.all([
        transaction.get(attendanceRef),
        transaction.get(summaryRef),
      ]);
    const previous = previousSnapshot.exists ? previousSnapshot.data() : null;
    const summary = summarySnapshot.exists ? summarySnapshot.data() : {};
    const counts = {
      total_hadir: Number(summary.total_hadir || 0),
      total_sakit: Number(summary.total_sakit || 0),
      total_izin: Number(summary.total_izin || 0),
      total_alpa: Number(summary.total_alpa || 0),
      total_keluar_kelas: Number(summary.total_keluar_kelas || 0),
      total_catatan: Number(summary.total_catatan || 0),
    };
    const previousField = attendanceCounterField(previous?.status);
    const nextField = attendanceCounterField(safePayload.status);
    if (previousField && previousField !== nextField) counts[previousField] = Math.max(0, counts[previousField] - 1);
    if (nextField && previousField !== nextField) counts[nextField] += 1;
    if (!previous) counts.total_catatan += 1;

      transaction.set(attendanceRef, safePayload, { merge: true });
      transaction.set(summaryRef, {
        id: summaryRef.id,
        tahun_ajaran_id: payload.tahun_ajaran_id,
        semester_id: payload.semester_id,
        siswa_id: normalizeUserKey(payload.siswa_id),
        siswa_nama: payload.siswa_nama || summary.siswa_nama || '',
        kelas_id: payload.kelas_id || summary.kelas_id || '',
        kelas_nama: payload.kelas_nama || summary.kelas_nama || '',
        ...counts,
        complete: true,
        last_attendance_date: payload.tanggal || summary.last_attendance_date || '',
        updated_at: new Date().toISOString(),
      }, { merge: true });
    });
  } catch (error) {
    // Allow attendance to keep working while older deployed Rules do not yet
    // know the new summary collection. The summary will be backfilled later.
    if (error?.code !== 'permission-denied') throw error;
    console.warn('Ringkasan absensi belum diizinkan Rules; menyimpan absensi detail saja.');
    await saveDocument('absensi', safePayload, payload.id);
  }
  invalidateQueryCache('absensi');
  return { id: payload.id, ...safePayload };
}

export async function saveAttendanceRecordsBatch(payloads = []) {
  if (!db || !Array.isArray(payloads) || !payloads.length) return [];
  const items = Array.from(new Map(
    payloads
      .filter((item) => item?.id && item?.siswa_id)
      .map((item) => [item.id, item])
  ).values());
  if (!items.length) return [];

  try {
    // Read previous attendance + summary docs once, then batch-write changes.
    const attendanceRefs = items.map((item) => db.collection('absensi').doc(item.id));
    const summaryIds = Array.from(new Set(items.map((item) => {
      const context = { tahun_ajaran_aktif: item.tahun_ajaran_id, semester_aktif: item.semester_id };
      return buildAttendanceSummaryId(context, item.siswa_id);
    })));
    const summaryRefs = summaryIds.map((id) => db.collection('absensi_ringkasan_siswa').doc(id));

    const [attendanceSnaps, summarySnaps] = await Promise.all([
      Promise.all(attendanceRefs.map((ref) => ref.get())),
      Promise.all(summaryRefs.map((ref) => ref.get())),
    ]);

    const previousById = new Map();
    attendanceSnaps.forEach((snap) => {
      if (snap.exists) previousById.set(snap.id, snap.data());
    });

    const summaryState = new Map();
    summarySnaps.forEach((snap) => {
      const data = snap.exists ? snap.data() : {};
      summaryState.set(snap.id, {
        total_hadir: Number(data.total_hadir || 0),
        total_sakit: Number(data.total_sakit || 0),
        total_izin: Number(data.total_izin || 0),
        total_alpa: Number(data.total_alpa || 0),
        total_keluar_kelas: Number(data.total_keluar_kelas || 0),
        total_catatan: Number(data.total_catatan || 0),
        complete: data.complete === true,
        siswa_nama: data.siswa_nama || '',
        kelas_id: data.kelas_id || '',
        kelas_nama: data.kelas_nama || '',
        last_attendance_date: data.last_attendance_date || '',
      });
    });

    const safeItems = items.map((item) => sanitizeForFirestore(item));
    safeItems.forEach((item) => {
      const context = { tahun_ajaran_aktif: item.tahun_ajaran_id, semester_aktif: item.semester_id };
      const summaryId = buildAttendanceSummaryId(context, item.siswa_id);
      if (!summaryState.has(summaryId)) {
        summaryState.set(summaryId, {
          total_hadir: 0, total_sakit: 0, total_izin: 0, total_alpa: 0, total_keluar_kelas: 0, total_catatan: 0,
          complete: false, siswa_nama: '', kelas_id: '', kelas_nama: '', last_attendance_date: '',
        });
      }
      const counts = summaryState.get(summaryId);
      const previous = previousById.get(item.id);
      const previousField = attendanceCounterField(previous?.status);
      const nextField = attendanceCounterField(item.status);
      if (previousField && previousField !== nextField) counts[previousField] = Math.max(0, counts[previousField] - 1);
      if (nextField && previousField !== nextField) counts[nextField] += 1;
      if (!previous) counts.total_catatan += 1;
      counts.siswa_nama = item.siswa_nama || counts.siswa_nama || '';
      counts.kelas_id = item.kelas_id || counts.kelas_id || '';
      counts.kelas_nama = item.kelas_nama || counts.kelas_nama || '';
      counts.last_attendance_date = item.tanggal || counts.last_attendance_date || '';
    });

    for (let i = 0; i < safeItems.length; i += 200) {
      const chunk = safeItems.slice(i, i + 200);
      const batch = db.batch();
      chunk.forEach((item) => {
        const context = { tahun_ajaran_aktif: item.tahun_ajaran_id, semester_aktif: item.semester_id };
        const summaryId = buildAttendanceSummaryId(context, item.siswa_id);
        const counts = summaryState.get(summaryId);
        batch.set(db.collection('absensi').doc(item.id), item, { merge: true });
        batch.set(db.collection('absensi_ringkasan_siswa').doc(summaryId), {
          id: summaryId,
          tahun_ajaran_id: item.tahun_ajaran_id,
          semester_id: item.semester_id,
          siswa_id: normalizeUserKey(item.siswa_id),
          siswa_nama: counts.siswa_nama,
          kelas_id: counts.kelas_id,
          kelas_nama: counts.kelas_nama,
          total_hadir: counts.total_hadir,
          total_sakit: counts.total_sakit,
          total_izin: counts.total_izin,
          total_alpa: counts.total_alpa,
          total_keluar_kelas: counts.total_keluar_kelas,
          total_catatan: counts.total_catatan,
          complete: true,
          last_attendance_date: counts.last_attendance_date,
          updated_at: new Date().toISOString(),
        }, { merge: true });
      });
      await batch.commit();
    }
    invalidateQueryCache('absensi');
    invalidateQueryCache('absensi_ringkasan_siswa');
    return safeItems;
  } catch (error) {
    // Fallback to sequential path so attendance still works under older Rules.
    if (error?.code === 'permission-denied') {
      console.warn('Batch absensi fallback ke simpan per-siswa.');
      return Promise.all(items.map((item) => saveAttendanceRecord(item)));
    }
    if (isFirestoreReadQuotaError(error)) {
      console.warn('Batch absensi fallback ke simpan per-siswa (quota exhausted).');
      return Promise.all(items.map((item) => saveDocument('absensi', sanitizeForFirestore(item), item.id)));
    }
    throw error;
  }
}

export async function getAttendanceSummary(context, siswaId, aliases = []) {
  if (!db || !siswaId) return null;
  const { year, semester } = getActivePeriod(context);
  if (!year || !semester) return null;
  const summaryRef = db.collection('absensi_ringkasan_siswa').doc(buildAttendanceSummaryId(context, siswaId));
  let snapshot = null;
  try {
    snapshot = await summaryRef.get();
    if (snapshot.exists && snapshot.data()?.complete === true) return { id: snapshot.id, ...snapshot.data() };
  } catch (error) {
    if (error?.code !== 'permission-denied') throw error;
    console.warn('Ringkasan absensi belum diizinkan Rules; memakai data absensi detail.');
  }

  const siswaKeys = Array.from(new Set([siswaId, ...aliases].map(normalizeUserKey).filter(Boolean))).slice(0, 10);
  const filters = [
    { field: 'siswa_id', operator: 'in', value: siswaKeys },
    { field: 'tahun_ajaran_id', value: year },
    { field: 'semester_id', value: semester },
  ];
  const records = siswaKeys.length
    ? await getDocumentsWhere('absensi', filters, { cacheMs: 120000 })
    : [];
  const counts = buildAttendanceCounts(records);
  const latest = records.slice().sort((a, b) => String(b.tanggal || '').localeCompare(String(a.tanggal || '')))[0] || {};
  const summary = {
    id: summaryRef.id,
    tahun_ajaran_id: year,
    semester_id: semester,
    siswa_id: normalizeUserKey(siswaId),
    siswa_nama: latest.siswa_nama || '',
    kelas_id: latest.kelas_id || '',
    kelas_nama: latest.kelas_nama || '',
    ...counts,
    complete: true,
    last_attendance_date: latest.tanggal || '',
    updated_at: new Date().toISOString(),
  };
  try {
    await summaryRef.set(summary, { merge: true });
  } catch (error) {
    if (error?.code !== 'permission-denied') throw error;
  }
  return summary;
}

export function subscribeCollection(collectionName, filters = [], callback, options = {}) {
  if (typeof callback !== 'function') {
    return () => {};
  }
  const limit = Number(options.limit || 0);
  const orderByField = options.orderBy || '';
  const orderDirection = options.orderDirection || 'desc';

  if (!db) {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      let data = await getDocumentsWhere(collectionName, filters);
      if (orderByField) {
        data = data.slice().sort((a, b) => String(b[orderByField] || '').localeCompare(String(a[orderByField] || '')));
      }
      if (limit > 0) data = data.slice(0, limit);
      callback(data);
      if (!cancelled) {
        setTimeout(poll, 5000);
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }

   try {
     let query = db.collection(collectionName);
     filters.forEach(({ field, operator = '==', value }) => {
       query = query.where(field, operator, value);
     });
     if (orderByField) query = query.orderBy(orderByField, orderDirection);
     if (limit > 0) query = query.limit(limit);
     const unsubscribe = query.onSnapshot(
       (snapshot) => {
         const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
         callback(data);
       },
       (error) => {
         console.warn(`Gagal memantau koleksi ${collectionName}:`, error);
       }
     );
     return unsubscribe;
   } catch (error) {
     console.warn(`Gagal memantau koleksi ${collectionName}:`, error);
     return () => {};
  }
}

export async function getActiveTeachingAssignments(context, options = {}) {
  const { year, semester } = getActivePeriod(context);
  if (!year || !semester) {
    return [];
  }

  if (!db) {
    return getDemoTeachingAssignments(context);
  }

  // Muat ulang paksa: buang cache pengajaran/pembelajaran agar relasi mengajar
  // yang baru dibuat guru langsung dikenali (memengaruhi materi yang tampil).
  if (options.forceRefresh) {
    invalidateQueryCache('assignments');
    invalidateQueryCache('pengajaran');
    invalidateQueryCache('pembelajaran');
    invalidatePersistentQueryCache('pengajaran');
    invalidatePersistentQueryCache('pembelajaran');
  }

  try {
    return withQueryCache(`assignments:${year}:${semester}`, async () => {
      const filters = [
        { field: 'tahun_ajaran_id', value: year },
        { field: 'semester_id', value: semester },
      ];
      const pengajaranData = await getDocumentsWhere('pengajaran', filters, {
        cacheMs: STATIC_COLLECTION_CACHE_TTL_MS,
        persist: true,
        persistTtlMs: STATIC_COLLECTION_CACHE_TTL_MS,
      });

      if (!pengajaranData.length) {
        const pembelajaranData = await getDocumentsWhere('pembelajaran', filters, {
          cacheMs: STATIC_COLLECTION_CACHE_TTL_MS,
          persist: true,
          persistTtlMs: STATIC_COLLECTION_CACHE_TTL_MS,
        });
        const combined = [...pengajaranData, ...pembelajaranData]
          .map((item) => ({ id: item.id, ...item }))
          .filter((item, index, arr) => arr.findIndex((entry) => entry.id === item.id) === index);
        return combined.length ? combined : getDemoTeachingAssignments(context);
      }

      return pengajaranData.length ? pengajaranData : getDemoTeachingAssignments(context);
    });
  } catch (error) {
    console.warn('Gagal mengambil pengajaran dari Firestore, memakai data cadangan:', error);
    return getDemoTeachingAssignments(context);
  }
}

export async function getTeachingAssignmentsForUser(context, userId) {
  const { year, semester } = getActivePeriod(context);
  if (!year || !semester || !userId) {
    return [];
  }

  const normalizedUserId = normalizeUserKey(userId);

  if (!db) {
    return getDemoTeachingAssignments(context).filter((item) => normalizeUserKey(item.guru_id) === normalizedUserId);
  }

  try {
    return withQueryCache(`assignments:${year}:${semester}:${normalizedUserId}`, async () => {
      const filters = [
        { field: 'tahun_ajaran_id', value: year },
        { field: 'semester_id', value: semester },
        { field: 'guru_id', value: userId },
      ];
      const pengajaranData = await getDocumentsWhere('pengajaran', filters);

      if (!pengajaranData.length) {
        const pembelajaranData = await getDocumentsWhere('pembelajaran', filters);
        return [...pengajaranData, ...pembelajaranData]
          .filter((item) => normalizeUserKey(item.guru_id) === normalizedUserId)
          .map((item) => ({ id: item.id, ...item }))
          .filter((item, index, arr) => arr.findIndex((entry) => entry.id === item.id) === index);
      }

      return pengajaranData
        .filter((item) => normalizeUserKey(item.guru_id) === normalizedUserId)
        .map((item) => ({ id: item.id, ...item }))
        .filter((item, index, arr) => arr.findIndex((entry) => entry.id === item.id) === index);
    });
  } catch (error) {
    console.warn('Gagal mengambil relasi guru dari Firestore, memakai data cadangan:', error);
    return getDemoTeachingAssignments(context).filter((item) => normalizeUserKey(item.guru_id) === normalizedUserId);
  }
}

export async function createPembelajaranFromPlotting(payload, context) {
  const siswaList = await getManagedUsers('siswa', payload.kelas_id || '');
  const siswaUntukKelas = siswaList
    .filter((item) => {
      const kelasNama = String(item.kelas_nama || item.kelas_id || '').toLowerCase();
      const targetNama = String(payload.kelas_nama || payload.kelas_id || '').toLowerCase();
      return !targetNama || kelasNama === targetNama;
    })
    .map((item) => ({
      siswa_id: item.username,
      siswa_nama: item.nama,
      kelas_id: item.kelas_id || payload.kelas_id,
      kelas_nama: item.kelas_nama || payload.kelas_nama,
      nomor_absen: item.nomor_absen || 0,
    }))
    .sort((a, b) => Number(a.nomor_absen || 9999) - Number(b.nomor_absen || 9999));

  const learningPayload = {
    id: `${payload.tahun_ajaran_id}_${payload.semester_id}_${payload.guru_id}_${payload.kelas_id}_${payload.mapel_id}`,
    tahun_ajaran_id: payload.tahun_ajaran_id,
    semester_id: payload.semester_id,
    guru_id: payload.guru_id,
    guru_nama: payload.guru_nama,
    mapel_id: payload.mapel_id,
    mapel_nama: payload.mapel_nama,
    kelas_id: payload.kelas_id,
    kelas_nama: payload.kelas_nama,
    hari: payload.hari,
    jam_ke: payload.jam_ke,
    siswa: siswaUntukKelas,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await saveDocument('pembelajaran', learningPayload, learningPayload.id);

  await Promise.all(
    siswaUntukKelas.map((student, index) => {
      const membershipId = `${payload.tahun_ajaran_id}_${payload.semester_id}_${payload.kelas_id}_${student.siswa_id}`;
      return saveDocument('anggota_kelas', {
        id: membershipId,
        tahun_ajaran_id: payload.tahun_ajaran_id,
        semester_id: payload.semester_id,
        kelas_id: payload.kelas_id,
        kelas_nama: payload.kelas_nama,
        siswa_id: student.siswa_id,
        siswa_nama: student.siswa_nama,
        nomor_absen: student.nomor_absen || index + 1,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, membershipId);
    })
  );

  return learningPayload;
}

export async function synchronizeCurrentClassMemberships(context, students = []) {
  if (!db) return { deleted: 0, saved: 0 };
  const { year, semester } = getActivePeriod(context);
  if (!year || !semester || !Array.isArray(students)) {
    return { deleted: 0, saved: 0 };
  }

  const studentsById = new Map();
  students
    .filter((student) => student?.role === 'siswa' && student.username)
    .forEach((student) => studentsById.set(normalizeUserKey(student.username), student));
  const managedStudents = Array.from(studentsById.values());
  if (!managedStudents.length) return { deleted: 0, saved: 0 };

  const studentKeys = Array.from(new Set(managedStudents.flatMap((student) => [
    student.username,
    ...(Array.isArray(student.previous_usernames) ? student.previous_usernames : []),
  ]).map(normalizeUserKey).filter(Boolean)));
  const membershipDocs = [];
  for (let index = 0; index < studentKeys.length; index += 10) {
    const keys = studentKeys.slice(index, index + 10);
    const snapshot = await db.collection('anggota_kelas')
      .where('siswa_id', 'in', keys)
      .get();
    snapshot.docs.forEach((doc) => membershipDocs.push({ id: doc.id, ...doc.data() }));
  }
  const currentMemberships = membershipDocs.filter((item) => item.semester_id === semester);
  const membershipsByStudent = new Map();
  const deleteIds = [];

  currentMemberships.forEach((membership) => {
    const studentId = normalizeUserKey(membership.siswa_id || membership.id);
    if (!membershipsByStudent.has(studentId)) membershipsByStudent.set(studentId, []);
    membershipsByStudent.get(studentId).push(membership);
  });

  const membershipWrites = [];
  const classSequence = new Map();
  managedStudents.forEach((student) => {
    const studentId = normalizeUserKey(student.username);
    const studentMemberships = (membershipsByStudent.get(studentId) || [])
      .slice()
      .sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));
    const isActive = String(student.status || 'active').toLowerCase() === 'active';
    if (!isActive || !student.kelas_id) {
      studentMemberships.forEach((membership) => deleteIds.push(membership.id));
      return;
    }

    const classKey = normalizeClassKey(student.kelas_id);
    const classNumber = (classSequence.get(classKey) || 0) + 1;
    classSequence.set(classKey, classNumber);
    const expectedId = `${year}_${semester}_${student.kelas_id}_${student.username}`;
    const matchingMemberships = studentMemberships
      .filter((membership) => normalizeClassKey(membership.kelas_id) === normalizeClassKey(student.kelas_id));
    const canonicalMembership = matchingMemberships.find((membership) => membership.id === expectedId)
      || matchingMemberships[0];
    studentMemberships
      .filter((membership) => membership.id !== canonicalMembership?.id)
      .forEach((membership) => deleteIds.push(membership.id));

    const nextMembership = {
      id: expectedId,
      tahun_ajaran_id: year,
      semester_id: semester,
      kelas_id: student.kelas_id,
      kelas_nama: student.kelas_nama || student.kelas_id,
      siswa_id: student.username,
      siswa_nama: student.nama || '-',
      nomor_absen: student.nomor_absen || canonicalMembership?.nomor_absen || classNumber,
      status: 'active',
      created_at: canonicalMembership?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const membershipChanged = !canonicalMembership
      || canonicalMembership.id !== expectedId
      || canonicalMembership.kelas_id !== nextMembership.kelas_id
      || canonicalMembership.kelas_nama !== nextMembership.kelas_nama
      || canonicalMembership.siswa_nama !== nextMembership.siswa_nama
      || Number(canonicalMembership.nomor_absen || 0) !== Number(nextMembership.nomor_absen || 0)
      || String(canonicalMembership.status || 'active').toLowerCase() !== 'active';
    if (canonicalMembership?.id && canonicalMembership.id !== expectedId) {
      deleteIds.push(canonicalMembership.id);
    }
    if (membershipChanged) membershipWrites.push(nextMembership);
  });

  const writtenMembershipIds = new Set(membershipWrites.map((payload) => payload.id));
  const uniqueDeleteIds = Array.from(new Set(deleteIds.filter(Boolean)))
    .filter((id) => !writtenMembershipIds.has(id));
  const operations = [
    ...membershipWrites.map((payload) => ({ type: 'set', collection: 'anggota_kelas', id: payload.id, payload })),
    ...uniqueDeleteIds.map((id) => ({ type: 'delete', collection: 'anggota_kelas', id })),
  ];

  for (let index = 0; index < operations.length; index += 400) {
    const batch = db.batch();
    operations.slice(index, index + 400).forEach((operation) => {
      const ref = db.collection(operation.collection).doc(operation.id);
      if (operation.type === 'delete') batch.delete(ref);
      else batch.set(ref, sanitizeForFirestore(operation.payload), { merge: true });
    });
    await batch.commit();
  }
  if (operations.length) invalidateQueryCache('anggota_kelas');
  return {
    deleted: uniqueDeleteIds.length,
    saved: membershipWrites.length,
  };
}

export async function synchronizeRenamedUserReferences(context, role, oldUsername, user) {
  if (!db) return { updated: 0, deleted: 0 };
  const previousId = normalizeUserKey(oldUsername);
  const nextId = normalizeUserKey(user?.username);
  const { year, semester } = getActivePeriod(context);
  if (!previousId || !nextId || previousId === nextId || !year || !semester) {
    return { updated: 0, deleted: 0 };
  }

  if (role === 'siswa') {
    const allIds = Array.from(new Set([
      previousId,
      ...(Array.isArray(user.previous_usernames) ? user.previous_usernames.map(normalizeUserKey) : []),
    ].filter(Boolean))).slice(0, 10);
    const snapshot = await db.collection('anggota_kelas')
      .where('tahun_ajaran_id', '==', year)
      .where('semester_id', '==', semester)
      .where('siswa_id', 'in', allIds)
      .get();
    const oldMembershipIds = snapshot.docs.map((doc) => doc.id);
    await synchronizeCurrentClassMemberships(context, [user]);
    await deleteDocumentsBatch('anggota_kelas', oldMembershipIds);
    return { updated: 1, deleted: oldMembershipIds.length };
  }

  if (role === 'guru') {
    const collections = ['pengajaran', 'pembelajaran', 'wali_kelas'];
    const docs = [];
    for (const collectionName of collections) {
      const snapshot = await db.collection(collectionName)
        .where('guru_id', '==', oldUsername)
        .get();
      snapshot.docs.forEach((doc) => {
        const data = doc.data() || {};
        const samePeriod = collectionName === 'wali_kelas'
          ? (!data.tahun_ajaran_id || data.tahun_ajaran_id === year)
          : data.tahun_ajaran_id === year;
        if (samePeriod) docs.push({ ref: doc.ref, data });
      });
    }

    for (let index = 0; index < docs.length; index += 400) {
      const batch = db.batch();
      docs.slice(index, index + 400).forEach(({ ref, data }) => {
        batch.set(ref, {
          guru_id: user.username,
          guru_nama: user.nama || data.guru_nama || '',
          updated_at: new Date().toISOString(),
        }, { merge: true });
      });
      await batch.commit();
    }
    if (docs.length) {
      invalidateQueryCache('pengajaran');
      invalidateQueryCache('pembelajaran');
      invalidateQueryCache('wali_kelas');
    }
    return { updated: docs.length, deleted: 0 };
  }

  return { updated: 0, deleted: 0 };
}

export async function getMaterialWorkspaceDrafts(guruId) {
  const normalizedGuruId = String(guruId || '').trim();
  if (!normalizedGuruId) return [];
  try {
    const docs = await getDocumentsWhere(MATERIAL_WORKSPACE_DRAFTS_COLLECTION, [
      { field: 'guru_id', value: normalizedGuruId },
    ], { cacheMs: 15000, limit: 50 });
    return docs
      .filter((item) => String(item.guru_id || '').trim() === normalizedGuruId)
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  } catch (error) {
    console.warn('Gagal mengambil draft workspace materi:', error);
    return [];
  }
}

export async function saveMaterialWorkspaceDraft(draft) {
  const id = String(draft?.id || '').trim();
  const guruId = String(draft?.guru_id || '').trim();
  if (!id || !guruId) throw new Error('Draft materi membutuhkan ID dan guru.');
  const source = ['manual', 'ai', 'import'].includes(String(draft.source || '').trim())
    ? String(draft.source).trim()
    : 'manual';
  const htmlSource = String(draft.html_source || '');
  // Firestore membatasi satu dokumen ~1 MB. Beri pesan jelas sebelum ditolak server.
  if (htmlSource.length > 900000) {
    throw new Error('HTML materi terlalu besar untuk disimpan (maksimal ±900 KB). Kurangi isi atau publikasikan langsung.');
  }
  const payload = {
    id,
    guru_id: guruId,
    guru_nama: String(draft.guru_nama || '').slice(0, 120),
    title: String(draft.title || 'Materi Baru').slice(0, 200),
    subject: String(draft.subject || '').slice(0, 120),
    class_name: String(draft.class_name || '').slice(0, 80),
    duration: String(draft.duration || '2 JP').slice(0, 20),
    chapter: String(draft.chapter || '').slice(0, 200),
    gaya: String(draft.gaya || '').slice(0, 32),
    note: String(draft.note || '').slice(0, 500),
    // Penanda asal draft: manual (editor blok), ai (generate), import (paste HTML).
    source,
    schema_version: Number(draft.schema_version || 1),
    // Draft manual menyimpan struktur blok; draft AI/import menyimpan HTML jadi.
    document_json: draft.document_json ?? null,
    html_source: htmlSource,
    tahun_ajaran_id: String(draft.tahun_ajaran_id || ''),
    semester_id: String(draft.semester_id || ''),
    updated_at: String(draft.updated_at || new Date().toISOString()),
    created_at: String(draft.created_at || new Date().toISOString()),
  };
  const saved = await saveDocument(MATERIAL_WORKSPACE_DRAFTS_COLLECTION, payload, id);
  if (!saved) throw new Error('Firestore belum siap menyimpan draft.');
  return saved;
}

export async function deleteMaterialWorkspaceDraft(id, guruId) {
  const draftId = String(id || '').trim();
  const ownerId = String(guruId || '').trim();
  if (!draftId || !ownerId) return false;
  const docs = await getDocumentsWhere(MATERIAL_WORKSPACE_DRAFTS_COLLECTION, [
    { field: 'id', value: draftId },
    { field: 'guru_id', value: ownerId },
  ], { limit: 1 });
  if (!docs.length) return false;
  return deleteDocument(MATERIAL_WORKSPACE_DRAFTS_COLLECTION, draftId);
}

export async function getPublishedMaterials(options = {}) {
  if (!db) {
    return readLocalPublishedMaterials();
  }

  // Muat ulang paksa: buang cache (in-memory + localStorage) agar materi yang baru
  // diunggah guru langsung terbaca dari server pada permintaan berikutnya.
  if (options.forceRefresh) {
    invalidateQueryCache(MATERIAL_PUBLISHED_COLLECTION);
    invalidatePersistentQueryCache(MATERIAL_PUBLISHED_COLLECTION);
  }

  const kelasId = String(options.kelasId || '').trim();
  const kelasNama = String(options.kelasNama || '').trim();
  const year = String(options.tahunAjaranId || '').trim();
  const semester = String(options.semesterId || '').trim();
  const cacheKey = `materi_publish:${kelasId || 'all'}:${kelasNama || '-'}:${year || '-'}:${semester || '-'}`;

  try {
    return withQueryCache(cacheKey, async () => {
      // Optimasi #1: materi terbit adalah data read-mostly. Persist hasil query ke
      // localStorage (30 menit) agar membuka ulang aplikasi tidak selalu membaca
      // ulang. Guru yang menerbitkan materi meng-invalidasi cache di perangkatnya.
      const queryOptions = {
        cacheMs: QUERY_CACHE_TTL_MS,
        persist: true,
        persistTtlMs: MATERIAL_QUERY_PERSIST_TTL_MS,
      };
      // Token kelas yang mungkin dipakai pada array kelas_ids.
      const tokens = [...new Set([
        normalizeMaterialClassToken(kelasId),
        normalizeMaterialClassToken(kelasNama),
      ].filter(Boolean))];

      const requests = [];
      // 1) Struktur baru: satu dokumen per materi, banyak kelas di kelas_ids.
      tokens.forEach((token) => {
        requests.push(getDocumentsWhere(MATERIAL_PUBLISHED_COLLECTION, [
          { field: 'kelas_ids', operator: 'array-contains', value: token },
        ], queryOptions));
      });
      // 2) Struktur lama: satu dokumen per kelas (kelas_id tunggal).
      if (kelasId) {
        requests.push(getDocumentsWhere(MATERIAL_PUBLISHED_COLLECTION, [
          { field: 'kelas_id', value: kelasId },
        ], queryOptions));
      }
      if (!requests.length) return [];

      const results = await Promise.all(requests.map((request) => request.catch(() => [])));
      const docs = mergeMaterialsById(results.flat(), []);
      const materials = docs
        .filter((item) => !year || !item.tahun_ajaran_id || item.tahun_ajaran_id === year)
        .filter((item) => !semester || !item.semester_id || item.semester_id === semester)
        .sort((a, b) => String(b.updated_at || b.published_at || '').localeCompare(String(a.updated_at || a.published_at || '')))
        .slice(0, 300);
      writeLocalPublishedMaterials(materials);
      return materials;
    }, QUERY_CACHE_TTL_MS);
  } catch (error) {
    console.warn('Gagal mengambil materi publish dari Firestore:', error);
    return readLocalPublishedMaterials();
  }
}

export async function getPublishedMaterialsForTeacher(guruId) {
  const normalizedGuruId = String(guruId || '').trim().toLowerCase();
  if (!normalizedGuruId) return [];

  if (!db) {
    return readLocalPublishedMaterials()
      .filter((item) => String(item.guru_id || '').trim().toLowerCase() === normalizedGuruId)
      .sort((a, b) => String(b.published_at || b.updated_at || '').localeCompare(String(a.published_at || a.updated_at || '')));
  }

  try {
    return withQueryCache(`materi_publish:guru:${normalizedGuruId}`, async () => {
      const docs = await getDocumentsWhere(MATERIAL_PUBLISHED_COLLECTION, [
        { field: 'guru_id', value: guruId },
      ]);
      const materials = docs
        .filter((item) => String(item.guru_id || '').trim().toLowerCase() === normalizedGuruId)
        .sort((a, b) => String(b.published_at || b.updated_at || '').localeCompare(String(a.published_at || a.updated_at || '')));
      return materials;
    }, QUERY_CACHE_TTL_MS);
  } catch (error) {
    console.warn('Gagal mengambil materi guru dari Firestore:', error);
    return readLocalPublishedMaterials()
      .filter((item) => String(item.guru_id || '').trim().toLowerCase() === normalizedGuruId)
      .sort((a, b) => String(b.published_at || b.updated_at || '').localeCompare(String(a.published_at || a.updated_at || '')));
  }
}

export async function savePublishedMaterial(material) {
  const nowIso = new Date().toISOString();
  const nextVisibility = material?.visible_to_students !== false;
  const payload = {
    ...material,
    created_at: material?.created_at || material?.published_at || material?.updated_at || nowIso,
    updated_at: nowIso,
    visible_to_students: nextVisibility,
    status: nextVisibility ? 'published' : 'unpublished',
  };

  if (!db) {
    const localMaterials = readLocalPublishedMaterials();
    const existingIndex = localMaterials.findIndex((item) => item.id === payload.id);
    if (existingIndex >= 0) {
      localMaterials[existingIndex] = { ...localMaterials[existingIndex], ...payload };
    } else {
      localMaterials.push(payload);
    }
    writeLocalPublishedMaterials(localMaterials);
    return payload;
  }

  await saveDocument(MATERIAL_PUBLISHED_COLLECTION, payload, payload.id);
  const localMaterials = readLocalPublishedMaterials();
  const existingIndex = localMaterials.findIndex((item) => item.id === payload.id);
  if (existingIndex >= 0) {
    localMaterials[existingIndex] = { ...localMaterials[existingIndex], ...payload };
  } else {
    localMaterials.push(payload);
  }
  writeLocalPublishedMaterials(localMaterials);
  return payload;
}

/**
 * Simpan SATU dokumen materi untuk banyak kelas sekaligus.
 *
 * Struktur baru: `kelas_ids` berisi token semua kelas tujuan sehingga tidak perlu
 * menduplikasi `html_source` per kelas. Field tunggal (`kelas_id`, `kelas_nama`,
 * `pengajaran_id`) tetap diisi dengan kelas pertama agar pembaca versi lama
 * masih dapat menampilkan materi selama masa transisi.
 *
 * @param {object} material Data materi tanpa informasi kelas.
 * @param {Array<{id?:string,kelas_id?:string,kelas_nama?:string,mapel_id?:string,mapel_nama?:string}>} targets Kelas tujuan.
 */
export async function savePublishedMaterialForClasses(material, targets = []) {
  const list = (Array.isArray(targets) ? targets : []).filter(Boolean);
  if (!list.length) throw new Error('Pilih minimal satu kelas tujuan.');

  const classNames = [];
  const classTokens = [];
  const assignmentIds = [];
  list.forEach((target) => {
    const name = String(target.kelas_nama || target.kelas_id || target.id || '').trim();
    const rawId = String(target.kelas_id || target.id || '').trim();
    const assignmentId = String(target.id || target.pengajaran_id || rawId).trim();
    if (name && !classNames.includes(name)) classNames.push(name);
    if (assignmentId && !assignmentIds.includes(assignmentId)) assignmentIds.push(assignmentId);
    // Simpan beberapa varian token agar kelas tetap cocok baik dicari lewat
    // kelas_id maupun kelas_nama pada sisi siswa.
    [rawId, name].forEach((value) => {
      const token = normalizeMaterialClassToken(value);
      if (token && !classTokens.includes(token)) classTokens.push(token);
    });
  });
  if (!classTokens.length) throw new Error('Kelas tujuan tidak memiliki identitas yang valid.');

  const first = list[0] || {};
  const baseId = String(material?.source_id || material?.id || '').trim();
  if (!baseId) throw new Error('Materi membutuhkan ID.');

  return savePublishedMaterial({
    ...material,
    id: baseId,
    source_id: baseId,
    kelas_ids: classTokens,
    kelas_nama_csv: classNames.join(', '),
    pengajaran_ids: assignmentIds,
    // Kompatibilitas pembaca lama.
    kelas_id: String(first.kelas_id || first.id || '').trim(),
    kelas_nama: classNames[0] || '',
    kelas_token: classTokens[0] || '',
    pengajaran_id: assignmentIds[0] || '',
    mapel_id: String(material?.mapel_id || first.mapel_id || '').trim(),
    mapel_nama: String(material?.mapel_nama || first.mapel_nama || 'Mata Pelajaran').trim(),
  });
}

/**
 * Gabungkan dokumen materi lama (satu dokumen per kelas, id berpola `base__kelas`)
 * menjadi satu dokumen per materi dengan array `kelas_ids`.
 *
 * Dijalankan atas permintaan guru, sekali saja per akun. Mengembalikan ringkasan
 * jumlah materi yang digabung dan dokumen lama yang dihapus.
 */
export async function migratePublishedMaterialsToMultiClass(guruId) {
  const normalizedGuruId = String(guruId || '').trim();
  if (!normalizedGuruId) throw new Error('Migrasi membutuhkan ID guru.');
  if (!db) throw new Error('Firestore tidak tersedia.');

  const docs = await getDocumentsWhere(MATERIAL_PUBLISHED_COLLECTION, [
    { field: 'guru_id', value: normalizedGuruId },
  ]);

  // Hanya dokumen lama: punya suffix "__" pada id dan belum punya kelas_ids.
  const legacy = docs.filter((item) => {
    const id = String(item?.id || '');
    return id.includes('__') && !Array.isArray(item?.kelas_ids);
  });
  if (!legacy.length) return { merged: 0, removed: 0, skipped: docs.length };

  const groups = new Map();
  legacy.forEach((item) => {
    const baseId = String(item.source_id || String(item.id).split('__')[0] || '').trim();
    if (!baseId) return;
    const group = groups.get(baseId) || { baseId, items: [] };
    group.items.push(item);
    groups.set(baseId, group);
  });

  let merged = 0;
  let removed = 0;
  for (const group of groups.values()) {
    // Ambil dokumen terbaru sebagai sumber isi materi.
    const sorted = [...group.items].sort((a, b) => String(b.published_at || b.updated_at || '').localeCompare(String(a.published_at || a.updated_at || '')));
    const representative = sorted[0];
    const targets = group.items.map((item) => ({
      id: item.pengajaran_id || item.kelas_id || '',
      kelas_id: item.kelas_id || '',
      kelas_nama: item.kelas_nama || item.kelas_id || '',
      mapel_id: item.mapel_id || '',
      mapel_nama: item.mapel_nama || '',
    }));
    try {
      await savePublishedMaterialForClasses({
        ...representative,
        id: group.baseId,
        source_id: group.baseId,
        // Materi dianggap terbit bila ada satu saja kelas yang masih terbit.
        visible_to_students: group.items.some((item) => item.visible_to_students !== false),
      }, targets);
      merged += 1;
      for (const item of group.items) {
        if (String(item.id) === group.baseId) continue;
        try { await db.collection(MATERIAL_PUBLISHED_COLLECTION).doc(String(item.id)).delete(); removed += 1; }
        catch (error) { console.warn('Dokumen materi lama gagal dihapus:', item.id, error); }
      }
    } catch (error) {
      console.warn('Materi gagal digabung:', group.baseId, error);
    }
  }

  invalidateQueryCache('materi_publish');
  return { merged, removed, skipped: docs.length - legacy.length };
}

export async function deletePublishedMaterial(id) {
  const materialId = String(id || '').trim();
  if (!materialId) {
    return false;
  }

  if (db) {
    await db.collection(MATERIAL_PUBLISHED_COLLECTION).doc(materialId).delete();

    // Bersihkan jejak baca yang terkait materi agar penghapusan benar-benar bersih.
    try {
      const relatedReads = await getDocumentsWhere(MATERIAL_READS_COLLECTION, [
        { field: 'material_id', operator: '==', value: materialId },
      ]);
      if (relatedReads.length) {
        await Promise.all(
          relatedReads
            .map((item) => String(item.id || '').trim())
            .filter(Boolean)
            .map((readId) => db.collection(MATERIAL_READS_COLLECTION).doc(readId).delete())
        );
      }
    } catch (error) {
      console.warn('Gagal menghapus jejak baca materi dari Firestore:', error);
    }
  }

  const localMaterials = readLocalPublishedMaterials().filter((item) => item.id !== materialId);
  writeLocalPublishedMaterials(localMaterials);

  const localReads = readLocalMaterialReads().filter((item) => String(item.material_id || '').trim() !== materialId);
  writeLocalMaterialReads(localReads);
  invalidateQueryCache(MATERIAL_PUBLISHED_COLLECTION);
  invalidatePersistentQueryCache(MATERIAL_PUBLISHED_COLLECTION);
  return true;
}

export async function recordMaterialRead(payload) {
  const materialId = String(payload?.material_id || '').trim();
  const studentId = String(payload?.siswa_id || '').trim();
  if (!materialId || !studentId) {
    return null;
  }

  const readId = `${normalizeTrackingToken(materialId)}__${normalizeTrackingToken(studentId)}`;
  const localReads = readLocalMaterialReads();
  const existingLocalRead = localReads.find((item) => item.id === readId) || {};
  const eventType = String(payload?.event_type || 'open').trim().toLowerCase();
  const shouldIncrementRead = payload?.increment_read_count === true || eventType === 'open';
  const durationSeconds = Math.max(0, Number(payload?.duration_seconds || 0));
  const nowIso = new Date().toISOString();
  const isCompleted = payload?.completed === true || eventType === 'complete' || Boolean(existingLocalRead.completed_at);
  const nextPayload = {
    ...existingLocalRead,
    ...payload,
    id: readId,
    material_id: materialId,
    siswa_id: studentId,
    event_type: eventType,
    read_count: Number(existingLocalRead.read_count || 0) + (shouldIncrementRead ? 1 : 0),
    first_read_at: existingLocalRead.first_read_at || nowIso,
    last_read_at: nowIso,
    last_duration_seconds: durationSeconds,
    total_duration_seconds: Number(existingLocalRead.total_duration_seconds || 0) + durationSeconds,
    completed_at: isCompleted ? (existingLocalRead.completed_at || nowIso) : '',
    completion_status: isCompleted
      ? 'completed'
      : (Number(existingLocalRead.read_count || 0) + (shouldIncrementRead ? 1 : 0) > 0 ? 'opened' : 'unopened'),
  };

  if (db) {
    const ref = db.collection(MATERIAL_READS_COLLECTION).doc(readId);
    const increment = window.firebase?.firestore?.FieldValue?.increment;
    const explicitlyCompleted = payload?.completed === true || eventType === 'complete';
    const remoteUpdate = {
      ...payload,
      id: readId,
      material_id: materialId,
      siswa_id: studentId,
      event_type: eventType,
      read_count: increment ? increment(shouldIncrementRead ? 1 : 0) : nextPayload.read_count,
      last_read_at: nowIso,
      last_duration_seconds: durationSeconds,
      total_duration_seconds: increment ? increment(durationSeconds) : nextPayload.total_duration_seconds,
    };
    delete remoteUpdate.first_read_at;
    delete remoteUpdate.completed_at;
    delete remoteUpdate.completion_status;
    if (explicitlyCompleted) {
      remoteUpdate.completed_at = nowIso;
      remoteUpdate.completion_status = 'completed';
    }

    try {
      await ref.update(remoteUpdate);
      const nextLocalReads = localReads.filter((item) => item.id !== readId);
      nextLocalReads.push(nextPayload);
      writeLocalMaterialReads(nextLocalReads);
      return nextPayload;
    } catch (writeError) {
      if (String(writeError?.code || '').includes('not-found')) {
        try {
          await ref.set(nextPayload);
          const nextLocalReads = localReads.filter((item) => item.id !== readId);
          nextLocalReads.push(nextPayload);
          writeLocalMaterialReads(nextLocalReads);
          return nextPayload;
        } catch (createError) {
          console.warn('Gagal membuat catatan bacaan materi di Firestore:', createError);
        }
      } else {
        console.warn('Gagal mencatat bacaan materi ke Firestore:', writeError);
      }
    }
  }

  const nextLocalReads = localReads.filter((item) => item.id !== readId);
  nextLocalReads.push(nextPayload);
  writeLocalMaterialReads(nextLocalReads);
  return nextPayload;
}

export async function getMaterialReadStatsForTeacher(guruId) {
  const normalizedGuruId = String(guruId || '').trim().toLowerCase();
  if (!normalizedGuruId) {
    return [];
  }

  if (!db) {
    return readLocalMaterialReads()
      .filter((item) => String(item.guru_id || '').trim().toLowerCase() === normalizedGuruId)
      .sort((a, b) => Number(b.read_count || 0) - Number(a.read_count || 0));
  }

  try {
    return withQueryCache(`materi_reads:guru:${normalizedGuruId}`, async () => {
      const remoteReads = await getDocumentsWhere(MATERIAL_READS_COLLECTION, [
        { field: 'guru_id', value: guruId },
      ]);
      const localReads = readLocalMaterialReads();
      const mergedReads = mergeMaterialsById(remoteReads, localReads)
        .filter((item) => String(item.guru_id || '').trim().toLowerCase() === normalizedGuruId)
        .sort((a, b) => {
          const countDiff = Number(b.read_count || 0) - Number(a.read_count || 0);
          if (countDiff !== 0) return countDiff;
          return String(b.last_read_at || '').localeCompare(String(a.last_read_at || ''));
        });
      return mergedReads;
    }, QUERY_CACHE_TTL_MS);
  } catch (error) {
    console.warn('Gagal membaca statistik baca materi:', error);
    return readLocalMaterialReads()
      .filter((item) => String(item.guru_id || '').trim().toLowerCase() === normalizedGuruId)
      .sort((a, b) => Number(b.read_count || 0) - Number(a.read_count || 0));
  }
}

export async function getClassMembers(context, kelasId) {
  const { year, semester } = getActivePeriod(context);
  if (!year || !semester || !kelasId) {
    return [];
  }

  if (!db) return getFallbackClassMembersFor(kelasId);

  try {
    const normalizedKelasId = normalizeClassKey(kelasId);
    return withQueryCache(`class-members:${year}:${semester}:${normalizedKelasId}`, async () => {
      const anggotaKelasData = await getDocumentsWhere('anggota_kelas', [
        { field: 'tahun_ajaran_id', value: year },
        { field: 'semester_id', value: semester },
        { field: 'kelas_id', value: kelasId },
      ]);
      const classMemberDocs = deduplicateClassMembers(anggotaKelasData
        .filter((item) => item.semester_id === semester)
        .filter((item) => String(item.status || 'active').toLowerCase() === 'active')
        .filter((item) => normalizeClassKey(item.kelas_id) === normalizedKelasId)
      );
      if (classMemberDocs.length) return classMemberDocs;

      return [];
    });
  } catch (error) {
    console.warn('Gagal mengambil anggota kelas dari Firestore:', error);
    return [];
  }
}

/* =========================================================================
   PENGUMUMAN (Announcements)
   Pola: mirror materi/materi_reads — Firestore + fallback localStorage demo.
   Dokumen pengumuman:
     { id, judul, isi, guru_id, guru_nama,
       kelas_ids: ["x_1", ...], kelas_nama_csv: "X.1, ...",
       created_at, updated_at, tahun_ajaran_id, semester_id }
   Dokumen pengumuman_reads (id deterministik `${pengumuman_id}__${siswa_id}`):
     { id, pengumuman_id, siswa_id, siswa_nama, first_read_at, last_read_at }
   ========================================================================= */

const PENGUMUMAN_KEY = 'simguru_pengumuman';
const PENGUMUMAN_COLLECTION = 'pengumuman';
const PENGUMUMAN_READS_KEY = 'simguru_pengumuman_reads';
const PENGUMUMAN_READS_COLLECTION = 'pengumuman_reads';

function readLocalPengumuman() {
  try {
    return JSON.parse(localStorage.getItem(PENGUMUMAN_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeLocalPengumuman(items) {
  localStorage.setItem(PENGUMUMAN_KEY, JSON.stringify(items));
}

function readLocalPengumumanReads() {
  try {
    return JSON.parse(localStorage.getItem(PENGUMUMAN_READS_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeLocalPengumumanReads(reads) {
  localStorage.setItem(PENGUMUMAN_READS_KEY, JSON.stringify(reads));
}

function getPengumumanKelasIds(item) {
  if (Array.isArray(item?.kelas_ids) && item.kelas_ids.length) {
    return item.kelas_ids.map((id) => normalizeClassKey(id)).filter(Boolean);
  }
  // Cadangan: fallback ke kelas_id tunggal lama
  return item?.kelas_id ? [normalizeClassKey(item.kelas_id)] : [];
}

export async function getAllPengumuman() {
  if (!db) {
    return readLocalPengumuman();
  }

  try {
    return withQueryCache('pengumuman:all', async () => {
      // Avoid full scans; fetch recent announcements only.
      const firestoreItems = await getDocumentsWhere(PENGUMUMAN_COLLECTION, [], {
        cacheMs: QUERY_CACHE_TTL_MS,
        orderBy: 'created_at',
        orderDirection: 'desc',
        limit: 300,
      });
      // Firestore is authoritative. Do not resurrect deleted announcements from local cache.
      writeLocalPengumuman(firestoreItems);
      return firestoreItems;
    }, QUERY_CACHE_TTL_MS);
  } catch (error) {
    console.warn('Gagal mengambil pengumuman dari Firestore, memakai data cadangan:', error);
    return readLocalPengumuman();
  }
}

export async function getPengumumanForGuru(context, guruId) {
  const normalizedGuruId = String(guruId || '').trim().toLowerCase();
  if (!normalizedGuruId) {
    return [];
  }

  if (!db) {
    return readLocalPengumuman()
      .filter((item) => String(item.guru_id || '').trim().toLowerCase() === normalizedGuruId)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }

  try {
    return withQueryCache(`pengumuman:guru:${normalizedGuruId}`, async () => {
      const items = await getDocumentsWhere(PENGUMUMAN_COLLECTION, [
        { field: 'guru_id', value: guruId },
      ]);
      return items
        .filter((item) => String(item.guru_id || '').trim().toLowerCase() === normalizedGuruId)
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    }, QUERY_CACHE_TTL_MS);
  } catch (error) {
    console.warn('Gagal mengambil pengumuman guru:', error);
    return readLocalPengumuman()
      .filter((item) => String(item.guru_id || '').trim().toLowerCase() === normalizedGuruId)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }
}

export async function getPengumumanForSiswa(context, kelasId) {
  const normalizedKelas = normalizeClassKey(kelasId);
  const { year, semester } = getActivePeriod(context);
  if (!normalizedKelas || !year || !semester) {
    return [];
  }

  const filterCurrentPeriod = (items) => items
    .filter((item) => getPengumumanKelasIds(item).includes(normalizedKelas))
    .filter((item) => item.tahun_ajaran_id === year && item.semester_id === semester)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, 20);

  if (!db) {
    return filterCurrentPeriod(readLocalPengumuman());
  }

  try {
    return withQueryCache(`pengumuman:siswa:${normalizedKelas}:${year}:${semester}:20`, async () => {
      const queryOptions = {
        orderBy: 'created_at',
        orderDirection: 'desc',
        limit: 20,
      };
      // Prefer array-contains for multi-class announcements.
      let items = await getDocumentsWhere(PENGUMUMAN_COLLECTION, [
        { field: 'kelas_ids', operator: 'array-contains', value: normalizedKelas },
        { field: 'tahun_ajaran_id', value: year },
        { field: 'semester_id', value: semester },
      ], queryOptions);
      if (!items.length) {
        // Legacy documents use a single kelas_id, but remain bounded to the
        // same class, active period, and 20 newest records.
        items = await getDocumentsWhere(PENGUMUMAN_COLLECTION, [
          { field: 'kelas_id', value: kelasId },
          { field: 'tahun_ajaran_id', value: year },
          { field: 'semester_id', value: semester },
        ], queryOptions);
      }
      return filterCurrentPeriod(items);
    }, QUERY_CACHE_TTL_MS);
  } catch (error) {
    console.warn('Gagal mengambil pengumuman siswa:', error);
    return filterCurrentPeriod(readLocalPengumuman());
  }
}

export async function savePengumuman(payload, id = null) {
  const nowIso = new Date().toISOString();
  const cleaned = {
    judul: String(payload?.judul || '').trim(),
    isi: String(payload?.isi || '').trim(),
    guru_id: String(payload?.guru_id || '').trim(),
    guru_nama: String(payload?.guru_nama || '').trim(),
    kelas_ids: Array.isArray(payload?.kelas_ids) ? payload.kelas_ids.map((id) => normalizeClassKey(id)).filter(Boolean) : [],
    kelas_nama_csv: String(payload?.kelas_nama_csv || '').trim(),
    tahun_ajaran_id: String(payload?.tahun_ajaran_id || '').trim(),
    semester_id: String(payload?.semester_id || '').trim(),
  };

  if (id) {
    const existing = readLocalPengumuman().find((item) => item.id === id);
    cleaned.created_at = existing?.created_at || payload?.created_at || nowIso;
    cleaned.updated_at = nowIso;
  } else {
    cleaned.created_at = payload?.created_at || nowIso;
    cleaned.updated_at = nowIso;
  }

  if (!db) {
    const localItems = readLocalPengumuman();
    const docId = id || `pengumuman_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fullPayload = { ...cleaned, id: docId };
    const existingIndex = localItems.findIndex((item) => item.id === docId);
    if (existingIndex >= 0) {
      localItems[existingIndex] = { ...localItems[existingIndex], ...fullPayload };
    } else {
      localItems.push(fullPayload);
    }
    writeLocalPengumuman(localItems);
    return fullPayload;
  }

  const saved = await saveDocument(PENGUMUMAN_COLLECTION, cleaned, id || undefined);
  const localItems = readLocalPengumuman();
  const fullPayload = { ...cleaned, id: saved.id };
  const existingIndex = localItems.findIndex((item) => item.id === saved.id);
  if (existingIndex >= 0) {
    localItems[existingIndex] = { ...localItems[existingIndex], ...fullPayload };
  } else {
    localItems.push(fullPayload);
  }
  writeLocalPengumuman(localItems);
  return fullPayload;
}

export async function deletePengumuman(id) {
  const pengumumanId = String(id || '').trim();
  if (!pengumumanId) {
    return false;
  }

  if (db) {
    const readsSnapshot = await db.collection(PENGUMUMAN_READS_COLLECTION)
      .where('pengumuman_id', '==', pengumumanId)
      .get();
    const refs = readsSnapshot.docs.map((doc) => doc.ref);
    for (let i = 0; i < refs.length; i += 400) {
      const batch = db.batch();
      refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
    await db.collection(PENGUMUMAN_COLLECTION).doc(pengumumanId).delete();
  }

  writeLocalPengumuman(readLocalPengumuman().filter((item) => item.id !== pengumumanId));

  // Hapus juga catatan baca terkait
  writeLocalPengumumanReads(
    readLocalPengumumanReads().filter((item) => String(item.pengumuman_id || '') !== pengumumanId)
  );

  return true;
}

export async function recordPengumumanRead(payload) {
  const pengumumanId = String(payload?.pengumuman_id || '').trim();
  const siswaId = String(payload?.siswa_id || '').trim();
  if (!pengumumanId || !siswaId) {
    return null;
  }

  const readId = `${normalizeTrackingToken(pengumumanId)}__${normalizeTrackingToken(siswaId)}`;
  const nowIso = new Date().toISOString();
  const localReads = readLocalPengumumanReads();
  const existing = localReads.find((item) => item.id === readId) || {};
  const nextPayload = {
    ...existing,
    ...payload,
    id: readId,
    pengumuman_id: pengumumanId,
    siswa_id: siswaId,
    first_read_at: existing.first_read_at || nowIso,
    last_read_at: nowIso,
  };

  if (db) {
    try {
      await db.collection(PENGUMUMAN_READS_COLLECTION).doc(readId).set(nextPayload, { merge: true });
    } catch (error) {
      console.warn('Gagal mencatat baca pengumuman ke Firestore:', error);
    }
  }

  const nextLocalReads = localReads.filter((item) => item.id !== readId);
  nextLocalReads.push(nextPayload);
  writeLocalPengumumanReads(nextLocalReads);
  return nextPayload;
}

export async function getPengumumanReadMap(siswaId) {
  const normalizedSiswa = normalizeTrackingToken(siswaId);
  const map = new Map();
  if (!normalizedSiswa) {
    return map;
  }
  readLocalPengumumanReads()
    .filter((item) => normalizeTrackingToken(item?.siswa_id) === normalizedSiswa)
    .forEach((item) => {
      map.set(`${normalizeTrackingToken(item.pengumuman_id)}__${normalizedSiswa}`, item);
    });
  return map;
}

export async function getPengumumanReadCounts() {
  // Mengembalikan { [pengumuman_id]: jumlah_pembaca_unik }
  const counts = {};
  readLocalPengumumanReads().forEach((item) => {
    const key = String(item?.pengumuman_id || '').trim();
    if (!key) return;
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

// ===================== FITUR PESAN (CHAT) =====================

function getChatRoomId(uidA, uidB) {
  return ['chat', ...[uidA, uidB].map((v) => String(v).trim().toLowerCase()).sort()].join('_');
}

export async function getChatContacts(excludeUid) {
  const filterFn = (u) => u && u.username && u.username !== excludeUid;
  try {
    return (await getChatDirectory()).filter(filterFn);
  } catch (error) {
    console.warn('Gagal memuat kontak chat:', error);
    return [];
  }
}

export async function getChatRoomsForUser(uid) {
  if (!db) return [];
  try {
    const snapshot = await db.collection('chat_rooms')
      .where('participants', 'array-contains', uid)
      .orderBy('last_at', 'desc')
      .limit(30)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.warn('Gagal memuat daftar chat:', error);
    return [];
  }
}

export function subscribeChatRooms(uid, callback) {
  if (typeof callback !== 'function') return () => {};
  if (!db) {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      const data = await getChatRoomsForUser(uid);
      callback(data);
      if (!cancelled) setTimeout(poll, 4000);
    };
    poll();
    return () => {
      cancelled = true;
    };
  }
  try {
    const unsubscribe = db
      .collection('chat_rooms')
      .where('participants', 'array-contains', uid)
      .orderBy('last_at', 'desc')
      .limit(30)
      .onSnapshot(
        (snapshot) => callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))),
        (error) => console.warn('Gagal memantau daftar chat:', error)
      );
    return unsubscribe;
  } catch (error) {
    return () => {};
  }
}

export async function deleteChatRoomForUser(roomId, uid) {
  if (!db || !roomId || !uid) return false;
  try {
    await db.collection('chat_rooms').doc(roomId).update({ [`deleted_for.${uid}`]: true });
    return true;
  } catch (error) {
    console.warn('Gagal menghapus percakapan:', error);
    return false;
  }
}

export async function findOrCreateChatRoom(myUid, myNama, otherUser) {
  const otherUid = String(otherUser?.username || otherUser?.id || '').trim();
  const otherNama = otherUser?.nama || otherUser?.username || '';
  if (!otherUid || otherUid === myUid) return null;
  const roomId = getChatRoomId(myUid, otherUid);
  const nowIso = new Date().toISOString();
  const participants = [myUid, otherUid];
  const participantNama = { [myUid]: myNama, [otherUid]: otherNama };
  const unread = { [myUid]: 0, [otherUid]: 0 };
  const payload = {
    id: roomId,
    participants,
    participant_nama: participantNama,
    tipe: 'private',
    last_message: '',
    last_sender_id: '',
    last_at: nowIso,
    created_at: nowIso,
    created_by: myUid,
    unread,
  };
  if (db) {
    try {
      await db.collection('chat_rooms').doc(roomId).set(payload, { merge: true });
    } catch (error) {
      console.warn('Gagal membuat ruang chat:', error);
    }
  }
  return { id: roomId, ...payload };
}

export async function sendChatMessage(roomId, senderId, senderNama, text) {
  const clean = String(text || '').trim();
  if (!clean || !db) return null;
  const nowIso = new Date().toISOString();
  const msgRef = db.collection('chat_rooms').doc(roomId).collection('messages').doc();
  const message = {
    id: msgRef.id,
    sender_id: senderId,
    sender_nama: senderNama,
    text: clean,
    created_at: nowIso,
    edited_at: '',
    type: 'text',
  };
  await msgRef.set(message);

  try {
    const roomSnap = await db.collection('chat_rooms').doc(roomId).get();
    const room = roomSnap.exists ? roomSnap.data() : {};
    const participants = Array.isArray(room.participants) ? room.participants : [];
    const unread = room.unread && typeof room.unread === 'object' ? { ...room.unread } : {};
    participants.forEach((p) => {
      if (p !== senderId) unread[p] = (unread[p] || 0) + 1;
    });
    await db.collection('chat_rooms').doc(roomId).update({
      last_message: clean,
      last_sender_id: senderId,
      last_at: nowIso,
      unread,
    });
  } catch (error) {
    console.warn('Gagal memperbarui metadata ruang chat:', error);
  }
  return message;
}

export async function deleteChatMessage(roomId, messageId) {
  if (!db || !roomId || !messageId) return false;
  try {
    await db.collection('chat_rooms').doc(roomId).collection('messages').doc(messageId).delete();
    return true;
  } catch (error) {
    console.warn('Gagal menghapus pesan:', error);
    return false;
  }
}

export function subscribeChatMessages(roomId, callback) {
  if (typeof callback !== 'function') return () => {};
  if (!db) return () => {};
  try {
    const fieldPath = window.firebase.firestore.FieldPath.documentId();
    const q = db
      .collection('chat_rooms').doc(roomId).collection('messages')
      .orderBy('created_at', 'desc')
      .orderBy(fieldPath, 'desc')
      .limit(30);
    const unsubscribe = q.onSnapshot(
      (snapshot) => callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))),
      (error) => console.warn('Gagal memantau pesan:', error)
    );
    return unsubscribe;
  } catch (error) {
    return () => {};
  }
}

export async function loadOlderChatMessages(roomId, oldestDoc, limit = 30) {
  if (!db || !oldestDoc) return [];
  try {
    const fieldPath = window.firebase.firestore.FieldPath.documentId();
    const q = db
      .collection('chat_rooms').doc(roomId).collection('messages')
      .orderBy('created_at', 'desc')
      .orderBy(fieldPath, 'desc')
      .startAfter(oldestDoc.created_at, oldestDoc.id)
      .limit(limit);
    const snapshot = await q.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.warn('Gagal memuat pesan lama:', error);
    return [];
  }
}

export async function markChatRoomRead(roomId, uid) {
  if (!db) return;
  try {
    await db.collection('chat_rooms').doc(roomId).update({ [`unread.${uid}`]: 0 });
  } catch (error) {
    console.warn('Gagal menandai chat dibaca:', error);
  }
}

export async function getChatRoom(roomId) {
  if (!db) return null;
  try {
    const snap = await db.collection('chat_rooms').doc(roomId).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    console.warn('Gagal memuat ruang chat:', error);
    return null;
  }
}

// ===================== FITUR RPM AI (Draft) =====================

export async function saveRpmDraft(uid, title, sections, formData, version = 1) {
  if (!db) return null;
  const now = new Date().toISOString();
  const docId = `${uid}_rpm_${Date.now()}`;
  const draft = {
    uid,
    title,
    sections,
    formData,
    version,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db.collection('rpm_drafts').doc(docId).set(draft);
    return { id: docId, ...draft };
  } catch (error) {
    console.warn('Gagal menyimpan draft RPM:', error);
    return null;
  }
}

export async function getRpmDrafts(uid, limit = 20) {
  if (!db) return [];
  try {
    const snapshot = await db
      .collection('rpm_drafts')
      .where('uid', '==', uid)
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.warn('Gagal mengambil draft RPM:', error);
    return [];
  }
}

export async function getRpmDraftById(id) {
  if (!db) return null;
  try {
    const snap = await db.collection('rpm_drafts').doc(id).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    console.warn('Gagal mengambil draft RPM oleh ID:', error);
    return null;
  }
}

export async function updateRpmDraft(id, updates) {
  if (!db) return false;
  try {
    const updatedAt = new Date().toISOString();
    await db.collection('rpm_drafts').doc(id).update({ ...updates, updatedAt });
    return true;
  } catch (error) {
    console.warn('Gagal mengupdate draft RPM:', error);
    return false;
  }
}
