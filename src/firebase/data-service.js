import { db } from './firebase-config.js';

function normalizeClassKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getCachedUsers() {
  try {
    return JSON.parse(localStorage.getItem('simguru_users') || '[]');
  } catch {
    return [];
  }
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

export async function saveDocument(collectionName, payload, id = null) {
  if (!db) {
    return null;
  }

  const ref = id ? db.collection(collectionName).doc(id) : db.collection(collectionName).doc();
  await ref.set(payload, { merge: true });
  return { id: ref.id, ...payload };
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

export async function getDocumentsWhere(collectionName, filters = []) {
  if (!db || !filters.length) {
    return [];
  }

  try {
    let query = db.collection(collectionName);
    
    filters.forEach(({ field, operator = '==', value }) => {
      query = query.where(field, operator, value);
    });

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({
      ...doc.data(), // Put the data fields first
      firestoreId: doc.id, // Explicitly safe firestore document ID so it doesn't get overwritten
      id: doc.id // Add the standard id (will overwrite data.id if it exists, matching typical patterns)
    }));
  } catch (error) {
    console.warn(`Gagal query dokumen dari koleksi ${collectionName}:`, error);
    return [];
  }
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

function getActivePeriod(context) {
  return {
    year: context?.tahun_ajaran_aktif || context?.tahun_ajaran_aktif_id || '',
    semester: context?.semester_aktif || context?.semester_aktif_id || '',
  };
}

function getDemoTeachingAssignments(context) {
  const { year, semester } = getActivePeriod(context);
  const demoAssignments = [
    {
      id: 'demo-pengajaran-1',
      tahun_ajaran_id: '2026_2027',
      semester_id: '2026_2027_1',
      guru_id: 'imambudiharto',
      guru_nama: 'Imam Budiharto, S.Pd.',
      mapel_id: 'MTK',
      mapel_nama: 'MATEMATIKA UMUM',
      kelas_id: 'X_1',
      kelas_nama: 'X.1',
      hari: 'Senin',
      jam_ke: '1-3',
    },
    {
      id: 'demo-pengajaran-2',
      tahun_ajaran_id: '2026_2027',
      semester_id: '2026_2027_1',
      guru_id: 'tatimmatulianah',
      guru_nama: 'Tatimmatul Ianah, S.Pd.',
      mapel_id: 'BIND',
      mapel_nama: 'BAHASA INDONESIA',
      kelas_id: 'X_2',
      kelas_nama: 'X.2',
      hari: 'Selasa',
      jam_ke: '4-5',
    },
  ];

  return demoAssignments.filter((item) => item.tahun_ajaran_id === year && item.semester_id === semester);
}

function getDemoClassMembers(context, kelasId) {
  const { year } = getActivePeriod(context);
  const demoMembers = {
    X_1: [
      { id: 'demo-member-1', tahun_ajaran_id: year, kelas_id: 'X_1', kelas_nama: 'X.1', siswa_id: 'adityabayupremana', siswa_nama: 'ADITYA BAYU PERMANA', nomor_absen: 1 },
      { id: 'demo-member-2', tahun_ajaran_id: year, kelas_id: 'X_1', kelas_nama: 'X.1', siswa_id: 'budi', siswa_nama: 'BUDI SANTOSO', nomor_absen: 2 },
    ],
    X_2: [
      { id: 'demo-member-3', tahun_ajaran_id: year, kelas_id: 'X_2', kelas_nama: 'X.2', siswa_id: 'citra', siswa_nama: 'CITRA LESTARI', nomor_absen: 1 },
    ],
  };

  return (demoMembers[kelasId] || []).filter((item) => item.tahun_ajaran_id === year);
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

  if (!db) {
    return getDemoTeachingAssignments(context).filter((item) => item.guru_id === userId);
  }

  try {
    const [pengajaranData, pembelajaranData] = await Promise.all([
      getDocsFromCollection('pengajaran'),
      getDocsFromCollection('pembelajaran'),
    ]);

    const combined = [...pengajaranData, ...pembelajaranData]
      .filter((item) => item.tahun_ajaran_id === year && item.semester_id === semester && item.guru_id === userId)
      .map((item) => ({ id: item.id, ...item }))
      .filter((item, index, arr) => arr.findIndex((entry) => entry.id === item.id) === index);

    return combined.length ? combined : getDemoTeachingAssignments(context).filter((item) => item.guru_id === userId);
  } catch (error) {
    console.warn('Gagal mengambil relasi guru dari Firestore, memakai data cadangan:', error);
    return getDemoTeachingAssignments(context).filter((item) => item.guru_id === userId);
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
