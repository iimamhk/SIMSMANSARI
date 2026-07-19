import { db } from './firebase-config.js';
import { getChatDirectory, getManagedUsers } from './auth-service.js';

const MATERIAL_PUBLISHED_KEY = 'simguru_material_html_published';
const MATERIAL_PUBLISHED_COLLECTION = 'materi_publish';
const MATERIAL_READS_KEY = 'simguru_material_reads';
const MATERIAL_READS_COLLECTION = 'materi_reads';

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

async function getDocsFromCollection(collectionName) {
  if (!db) {
    return [];
  }

  try {
    const snapshot = await db.collection(collectionName).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.warn(`Gagal membaca koleksi ${collectionName}:`, error);
    return [];
  }
}

export async function getCollectionDocs(collectionName) {
  return getDocsFromCollection(collectionName);
}

export async function getDocumentsWhere(collectionName, filters = []) {
  if (!db) {
    return [];
  }

  try {
    let query = db.collection(collectionName);
    filters.forEach(({ field, operator = '==', value }) => {
      query = query.where(field, operator, value);
    });
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.warn(`Gagal query dokumen dari koleksi ${collectionName}:`, error);
    return [];
  }
}

export async function saveDocument(collectionName, payload, id = null) {
  if (!db) {
    return null;
  }

  const safePayload = sanitizeForFirestore(payload);
  const ref = id ? db.collection(collectionName).doc(id) : db.collection(collectionName).doc();
  await ref.set(safePayload, { merge: true });
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
    const absensiData = await getDocsFromCollection('absensi');
    return absensiData
      .filter((item) => item.tahun_ajaran_id === year && item.semester_id === semester && (!pengajaranId || item.pengajaran_id === pengajaranId))
      .map((item) => ({ id: item.id, ...item }));
  } catch (error) {
    console.warn('Gagal mengambil data absensi dari Firestore, memakai data cadangan:', error);
    return [];
  }
}

export async function deleteDocument(collectionName, id) {
  if (!db) {
    return false;
  }

  await db.collection(collectionName).doc(id).delete();
  return true;
}

export function subscribeCollection(collectionName, filters = [], callback) {
  if (typeof callback !== 'function') {
    return () => {};
  }

  if (!db) {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      const data = await getDocumentsWhere(collectionName, filters);
      callback(data);
      if (!cancelled) {
        setTimeout(poll, 3000);
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

export async function getActiveTeachingAssignments(context) {
  const { year, semester } = getActivePeriod(context);
  if (!year || !semester) {
    return [];
  }

  if (!db) {
    return getDemoTeachingAssignments(context);
  }

  try {
    const [pengajaranData, pembelajaranData] = await Promise.all([
      getDocsFromCollection('pengajaran'),
      getDocsFromCollection('pembelajaran'),
    ]);

    const combined = [...pengajaranData, ...pembelajaranData]
      .filter((item) => item.tahun_ajaran_id === year && item.semester_id === semester)
      .map((item) => ({ id: item.id, ...item }))
      .filter((item, index, arr) => arr.findIndex((entry) => entry.id === item.id) === index);

    return combined.length ? combined : getDemoTeachingAssignments(context);
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
    const [pengajaranData, pembelajaranData] = await Promise.all([
      getDocsFromCollection('pengajaran'),
      getDocsFromCollection('pembelajaran'),
    ]);

    const combined = [...pengajaranData, ...pembelajaranData]
      .filter((item) => item.tahun_ajaran_id === year && item.semester_id === semester && normalizeUserKey(item.guru_id) === normalizedUserId)
      .map((item) => ({ id: item.id, ...item }))
      .filter((item, index, arr) => arr.findIndex((entry) => entry.id === item.id) === index);

    return combined;
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

export async function getPublishedMaterials() {
  if (!db) {
    return readLocalPublishedMaterials();
  }

  try {
    const snapshot = await db.collection(MATERIAL_PUBLISHED_COLLECTION).get();
    const firestoreMaterials = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    // Firestore adalah sumber kebenaran utama saat online.
    // Ini mencegah materi yang sudah dihapus di Firestore hidup lagi dari cache lokal.
    const materials = mergeMaterialsById(firestoreMaterials, []);
    writeLocalPublishedMaterials(materials);
    return materials;
  } catch (error) {
    console.warn('Gagal mengambil materi publish dari Firestore:', error);
    return readLocalPublishedMaterials();
  }
}

export async function getPublishedMaterialsForTeacher(guruId) {
  const normalizedGuruId = String(guruId || '').trim().toLowerCase();
  const materials = await getPublishedMaterials();
  return materials
    .filter((item) => String(item.guru_id || '').trim().toLowerCase() === normalizedGuruId)
    .sort((a, b) => String(b.published_at || b.updated_at || '').localeCompare(String(a.published_at || a.updated_at || '')));
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
    try {
      const ref = db.collection(MATERIAL_READS_COLLECTION).doc(readId);
      const snapshot = await ref.get();
      const existingRemoteRead = snapshot.exists ? snapshot.data() : null;
      const remoteReadCount = Number(existingRemoteRead?.read_count || existingLocalRead.read_count || 0) + (shouldIncrementRead ? 1 : 0);
      const remoteTotalDuration = Number(existingRemoteRead?.total_duration_seconds || existingLocalRead.total_duration_seconds || 0) + durationSeconds;
      const remoteCompleted = payload?.completed === true || eventType === 'complete' || Boolean(existingRemoteRead?.completed_at) || Boolean(existingLocalRead.completed_at);
      const remotePayload = {
        ...(existingRemoteRead || {}),
        ...nextPayload,
        read_count: remoteReadCount,
        first_read_at: existingRemoteRead?.first_read_at || existingLocalRead.first_read_at || nowIso,
        last_read_at: nowIso,
        last_duration_seconds: durationSeconds,
        total_duration_seconds: remoteTotalDuration,
        completed_at: remoteCompleted ? (existingRemoteRead?.completed_at || existingLocalRead.completed_at || nowIso) : '',
        completion_status: remoteCompleted ? 'completed' : (remoteReadCount > 0 ? 'opened' : 'unopened'),
      };
      await ref.set(remotePayload, { merge: true });
      const nextLocalReads = localReads.filter((item) => item.id !== readId);
      nextLocalReads.push(remotePayload);
      writeLocalMaterialReads(nextLocalReads);
      return remotePayload;
    } catch (error) {
      console.warn('Gagal mencatat baca materi ke Firestore:', error);
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
    const snapshot = await db.collection(MATERIAL_READS_COLLECTION).get();
    const remoteReads = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const localReads = readLocalMaterialReads();
    const mergedReads = mergeMaterialsById(remoteReads, localReads)
      .filter((item) => String(item.guru_id || '').trim().toLowerCase() === normalizedGuruId)
      .sort((a, b) => {
        const countDiff = Number(b.read_count || 0) - Number(a.read_count || 0);
        if (countDiff !== 0) {
          return countDiff;
        }
        return String(b.last_read_at || '').localeCompare(String(a.last_read_at || ''));
      });
    writeLocalMaterialReads(mergeMaterialsById(remoteReads, localReads));
    return mergedReads;
  } catch (error) {
    console.warn('Gagal membaca statistik baca materi:', error);
    return readLocalMaterialReads()
      .filter((item) => String(item.guru_id || '').trim().toLowerCase() === normalizedGuruId)
      .sort((a, b) => Number(b.read_count || 0) - Number(a.read_count || 0));
  }
}

export async function getClassMembers(context, kelasId) {
  const { year } = getActivePeriod(context);
  if (!year || !kelasId) {
    return [];
  }

  try {
    const [anggotaKelasData, pembelajaranData, usersData] = await Promise.all([
      getDocsFromCollection('anggota_kelas'),
      getDocsFromCollection('pembelajaran'),
      getDocsFromCollection('users'),
    ]);

    const normalizedKelasId = normalizeClassKey(kelasId);

    const classMemberDocs = anggotaKelasData
      .filter((item) => item.tahun_ajaran_id === year && normalizeClassKey(item.kelas_id) === normalizedKelasId)
      .sort((a, b) => Number(a.nomor_absen || 9999) - Number(b.nomor_absen || 9999));

    if (classMemberDocs.length) {
      return classMemberDocs;
    }

    const pembelajaranDoc = pembelajaranData.find((item) => item.tahun_ajaran_id === year && normalizeClassKey(item.kelas_id) === normalizedKelasId);
    if (pembelajaranDoc?.siswa?.length) {
      return pembelajaranDoc.siswa
        .map((student) => ({
          id: student.siswa_id || student.id,
          siswa_id: student.siswa_id || student.id,
          siswa_nama: student.siswa_nama || student.nama || '-',
          nomor_absen: student.nomor_absen || 0,
          kelas_id: pembelajaranDoc.kelas_id,
          kelas_nama: pembelajaranDoc.kelas_nama,
        }))
        .sort((a, b) => Number(a.nomor_absen || 9999) - Number(b.nomor_absen || 9999));
    }

    const fireStoreUsers = usersData.filter((item) => item.role === 'siswa');
    const classSpecificUsers = fireStoreUsers.filter((item) => normalizeClassKey(item.kelas_id) === normalizedKelasId || normalizeClassKey(item.kelas_nama) === normalizedKelasId);
    const userMembers = classSpecificUsers
      .map(mapStudentToMember)
      .sort((a, b) => Number(a.nomor_absen || 9999) - Number(b.nomor_absen || 9999));

    if (userMembers.length) {
      return userMembers;
    }

    const cachedUsers = getCachedUsers()
      .filter((item) => item.role === 'siswa')
      .filter((item) => normalizeClassKey(item.kelas_id) === normalizedKelasId || normalizeClassKey(item.kelas_nama) === normalizedKelasId)
      .map(mapStudentToMember)
      .sort((a, b) => Number(a.nomor_absen || 9999) - Number(b.nomor_absen || 9999));

    if (cachedUsers.length) {
      return cachedUsers;
    }

    const fallbackStudents = getFallbackClassMembersFor(kelasId);
    return fallbackStudents.length ? fallbackStudents : getDemoClassMembers(context, kelasId);
  } catch (error) {
    console.warn('Gagal mengambil anggota kelas dari Firestore, memakai data cadangan:', error);
    return getDemoClassMembers(context, kelasId);
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
    const snapshot = await db.collection(PENGUMUMAN_COLLECTION).get();
    const firestoreItems = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    // Firestore is authoritative. Do not resurrect deleted announcements from local cache.
    writeLocalPengumuman(firestoreItems);
    return firestoreItems;
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
  const items = await getAllPengumuman();
  return items
    .filter((item) => String(item.guru_id || '').trim().toLowerCase() === normalizedGuruId)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

export async function getPengumumanForSiswa(context, kelasId) {
  const normalizedKelas = normalizeClassKey(kelasId);
  if (!normalizedKelas) {
    return [];
  }
  const items = await getAllPengumuman();
  return items
    .filter((item) => getPengumumanKelasIds(item).includes(normalizedKelas))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
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
    const batch = db.batch();
    batch.delete(db.collection(PENGUMUMAN_COLLECTION).doc(pengumumanId));
    readsSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
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
    const snapshot = await db.collection('chat_rooms').where('participants', 'array-contains', uid).get();
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
