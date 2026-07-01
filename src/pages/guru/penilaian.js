import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import {
  getTeachingAssignmentsForUser,
  getActiveTeachingAssignments,
  getClassMembers,
  saveDocument,
  getDocumentsWhere,
  deleteDocument,
} from '../../firebase/data-service.js';

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('simguru_session') || '{}');
  } catch {
    return {};
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateId(prefix = '') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getOrCreateCacheKey(context, assignment) {
  return `penilaian_${context.tahun_ajaran_aktif}_${context.semester_aktif}_${assignment.id}`;
}

function saveToCache(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function getFromCache(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}

function clearCache(key) {
  localStorage.removeItem(key);
}

function invalidateAllCaches() {
  // Clear all penilaian cache entries
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith('penilaian_')) {
      localStorage.removeItem(key);
    }
  });
}

// Show notification toast
function showNotification(message, type = 'success', duration = 3000) {
  // Remove existing notification
  const existing = document.getElementById('notification-toast');
  if (existing) existing.remove();

  const bgColor = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';
  const notification = document.createElement('div');
  notification.id = 'notification-toast';
  notification.className = `fixed top-4 right-4 ${bgColor} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 animate-in slide-in-from-right`;
  notification.innerHTML = `
    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
      ${type === 'success' ? '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>' : '<path fill-rule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2z" clip-rule="evenodd"></path>'}
    </svg>
    <span>${message}</span>
  `;
  document.body.appendChild(notification);

  setTimeout(() => notification.remove(), duration);
}

function sortMembersByName(members) {
  return [...members].sort((a, b) => {
    const nameA = (a.siswa_nama || a.nama || '').toLowerCase();
    const nameB = (b.siswa_nama || b.nama || '').toLowerCase();
    return nameA.localeCompare(nameB, 'id');
  });
}

function normalizeUlanganHarianColumns(columns) {
  const fromConfig = (columns || [])
    .map((col, index) => ({
      id: col.id || col.uh_id || `uh${index + 1}`,
      nama: col.nama || col.uh_nama || `UH ${index + 1}`,
      urutan: Number(col.urutan || index + 1),
      firestoreId: col.firestoreId || col.id,
    }))
    .filter((col) => !['murni', 'remidi'].includes(String(col.id || '').toLowerCase()))
    .filter((col) => !['murni', 'remidi'].includes(String(col.nama || '').trim().toLowerCase()))
    .sort((a, b) => a.urutan - b.urutan);

  return fromConfig;
}

function parseNilaiUhCacheKey(key) {
  const raw = String(key || '');
  if (!raw) return null;

  if (raw.endsWith('_murni') || raw.endsWith('_remidi')) {
    const suffix = raw.endsWith('_murni') ? '_murni' : '_remidi';
    const base = raw.slice(0, -suffix.length);
    // Split at the separator immediately before UH id marker (`_uh`).
    const splitIdx = base.lastIndexOf('_uh');
    if (splitIdx === -1) return null;
    const siswaId = base.slice(0, splitIdx);
    const uhBaseId = base.slice(splitIdx + 1);
    if (!siswaId || !uhBaseId) return null;
    return { siswaId, tipe: `${uhBaseId}${suffix}` };
  }

  const splitIdx = raw.lastIndexOf('_');
  if (splitIdx === -1) return null;
  const siswaId = raw.slice(0, splitIdx);
  const tipe = raw.slice(splitIdx + 1);
  if (!siswaId || !tipe) return null;
  return { siswaId, tipe };
}

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Gagal memuat script: ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.src = src;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Gagal memuat script: ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

async function ensureXlsxLoaded() {
  if (window.XLSX) return;
  await loadScriptOnce('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function extractUhBaseIdFromTipe(tipe) {
  const raw = String(tipe || '');
  if (!raw) return '';
  if (raw.endsWith('_murni')) return raw.slice(0, -7);
  if (raw.endsWith('_remidi')) return raw.slice(0, -8);
  return raw;
}

// ============================================================================
// LOAD DATA FROM FIRESTORE
// ============================================================================

async function loadBabsFromFirestore(context, assignment) {
  try {
    const docs = await getDocumentsWhere('bab', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
      { field: 'pengajaran_id', operator: '==', value: assignment.id },
    ]);
    return docs.map(doc => {
      return { 
        ...doc, 
        // Ensure UI IDs use appropriate names to avoid colliding with standard loops
        id: doc.bab_id || doc.id || doc.firestoreId, 
        bab_id: doc.bab_id || doc.id || doc.firestoreId,
        nama: doc.nama || doc.bab_nama || 'Tanpa Nama',
        bab_nama: doc.bab_nama || doc.nama || 'Tanpa Nama',
        // Pass up firestoreId explicitly
        firestoreId: doc.firestoreId
      };
    }).sort((a, b) => (a.urutan || 0) - (b.urutan || 0));
  } catch (e) {
    console.error('Error loading BAB:', e);
    return [];
  }
}

async function loadTugasFromFirestore(context, assignment) {
  try {
    const docs = await getDocumentsWhere('tugas_bab', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
      { field: 'pengajaran_id', operator: '==', value: assignment.id },
    ]);
    
    const tugasMap = {};
    docs.forEach(doc => {
      const normalizedBabId = doc.bab_id || doc.id || doc.firestoreId; // Map to the appropriate parent bab_id
      if (!tugasMap[normalizedBabId]) tugasMap[normalizedBabId] = [];
      tugasMap[normalizedBabId].push({ 
        ...doc,
        id: doc.tugas_id || doc.id || doc.firestoreId,
        tugas_id: doc.tugas_id || doc.id || doc.firestoreId,
        nama: doc.nama || doc.tugas_nama || 'Tanpa Nama',
        tugas_nama: doc.tugas_nama || doc.nama || 'Tanpa Nama',
        firestoreId: doc.firestoreId
      });
    });
    
    // Sort tugas dalam setiap BAB
    Object.keys(tugasMap).forEach(babId => {
      tugasMap[babId].sort((a, b) => (a.urutan || 0) - (b.urutan || 0));
    });
    
    return tugasMap;
  } catch (e) {
    console.error('Error loading Tugas:', e);
    return {};
  }
}

async function loadNilaiTugasFromFirestore(context, assignment) {
  try {
    const docs = await getDocumentsWhere('nilai_tugas', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
      { field: 'pengajaran_id', operator: '==', value: assignment.id },
    ]);
    
    const nilaiMap = {};
    docs.forEach(doc => {
      const key = `${doc.bab_id}_${doc.tugas_id}_${doc.siswa_id}`;
      nilaiMap[key] = doc.nilai;
    });
    
    return nilaiMap;
  } catch (e) {
    console.error('Error loading Nilai Tugas:', e);
    return {};
  }
}

async function loadNilaiUHFromFirestore(context, assignment) {
  try {
    const docs = await getDocumentsWhere('nilai_ujian', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
      { field: 'pengajaran_id', operator: '==', value: assignment.id },
      { field: 'jenis_nilai', operator: '==', value: 'ulangan_harian' },
    ]);
    
    const nilaiMap = {};
    docs.forEach(doc => {
      const tipe = doc.tipe || 'uh1'; // uh1, uh2, uh3, uh4
      const key = `${doc.siswa_id}_${tipe}`;
      nilaiMap[key] = doc.nilai;
    });
    
    return nilaiMap;
  } catch (e) {
    console.error('Error loading Nilai UH:', e);
    return {};
  }
}

async function loadUlanganHarianColumnsFromFirestore(context, assignment) {
  try {
    const docs = await getDocumentsWhere('ulangan_harian_kolom', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
      { field: 'pengajaran_id', operator: '==', value: assignment.id },
    ]);

    return docs
      .map((doc, index) => ({
        ...doc,
        id: doc.uh_id || doc.id || `uh${index + 1}`,
        nama: doc.uh_nama || doc.nama || `UH ${index + 1}`,
        urutan: Number(doc.urutan || index + 1),
        firestoreId: doc.firestoreId || doc.id,
      }))
      .filter((col) => !['murni', 'remidi'].includes(String(col.id || '').toLowerCase()))
      .filter((col) => !['murni', 'remidi'].includes(String(col.nama || '').trim().toLowerCase()))
      .sort((a, b) => a.urutan - b.urutan);
  } catch (e) {
    console.error('Error loading kolom UH:', e);
    return [];
  }
}

async function loadNilaiPTSFromFirestore(context, assignment) {
  try {
    const docs = await getDocumentsWhere('nilai_ujian', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
      { field: 'pengajaran_id', operator: '==', value: assignment.id },
      { field: 'jenis_nilai', operator: '==', value: 'pts' },
    ]);
    
    const nilaiMap = {};
    docs.forEach(doc => {
      const tipe = doc.tipe || 'murni';
      const key = `${doc.siswa_id}_${tipe}`;
      nilaiMap[key] = doc.nilai;
    });
    
    return nilaiMap;
  } catch (e) {
    console.error('Error loading Nilai PTS:', e);
    return {};
  }
}

async function loadNilaiPASFromFirestore(context, assignment) {
  try {
    const docs = await getDocumentsWhere('nilai_ujian', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
      { field: 'pengajaran_id', operator: '==', value: assignment.id },
      { field: 'jenis_nilai', operator: '==', value: 'pas' },
    ]);
    
    const nilaiMap = {};
    docs.forEach(doc => {
      const tipe = doc.tipe || 'murni';
      const key = `${doc.siswa_id}_${tipe}`;
      nilaiMap[key] = doc.nilai;
    });
    
    return nilaiMap;
  } catch (e) {
    console.error('Error loading Nilai PAS:', e);
    return {};
  }
}

// ============================================================================
// DELETE FUNCTIONS WITH CASCADE
// ============================================================================

async function deleteBabWithCascade(context, assignment, firestoreBabDocId) {
  try {
    // Get the BAB document to find its bab_id field
    const babDocs = await getDocumentsWhere('bab', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
      { field: 'pengajaran_id', operator: '==', value: assignment.id },
    ]);
    
    const babDoc = babDocs.find(doc => doc.id === firestoreBabDocId);
    if (!babDoc) {
      throw new Error('BAB document not found');
    }
    
    const babId = babDoc.bab_id || babDoc.id; // Get the bab_id field from the document
    
    // Step 1: Load and delete all nilai_tugas for this BAB
    const nilaiDocs = await getDocumentsWhere('nilai_tugas', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
      { field: 'pengajaran_id', operator: '==', value: assignment.id },
      { field: 'bab_id', operator: '==', value: babId },
    ]);
    
    for (const doc of nilaiDocs) {
      await deleteDocument('nilai_tugas', doc.id);
    }
    
    // Step 2: Load and delete all tugas_bab for this BAB
    const tugasDocs = await getDocumentsWhere('tugas_bab', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
      { field: 'pengajaran_id', operator: '==', value: assignment.id },
      { field: 'bab_id', operator: '==', value: babId },
    ]);
    
    for (const doc of tugasDocs) {
      await deleteDocument('tugas_bab', doc.id);
    }
    
    // Step 3: Delete the BAB itself using the Firestore document ID
    await deleteDocument('bab', firestoreBabDocId);
    
    return true;
  } catch (e) {
    console.error('Error in cascade delete BAB:', e);
    throw e;
  }
}

async function deleteTugasWithCascade(context, assignment, firestoreBabDocId, firestoreTugasDocId) {
  try {
    // Get the BAB document to find its bab_id field
    const babDocs = await getDocumentsWhere('bab', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
      { field: 'pengajaran_id', operator: '==', value: assignment.id },
    ]);
    
    const babDoc = babDocs.find(doc => doc.id === firestoreBabDocId);
    if (!babDoc) {
      throw new Error('BAB document not found');
    }
    
    const babId = babDoc.bab_id; // Get the bab_id field from the document
    
    // Get the TUGAS document to find its tugas_id field
    const tugasDocs = await getDocumentsWhere('tugas_bab', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
      { field: 'pengajaran_id', operator: '==', value: assignment.id },
      { field: 'bab_id', operator: '==', value: babId },
    ]);
    
    const tugasDoc = tugasDocs.find(doc => doc.id === firestoreTugasDocId);
    if (!tugasDoc) {
      throw new Error('TUGAS document not found');
    }
    
    const tugasId = tugasDoc.tugas_id; // Get the tugas_id field from the document
    
    // Step 1: Load and delete all nilai_tugas for this TUGAS
    const nilaiDocs = await getDocumentsWhere('nilai_tugas', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
      { field: 'pengajaran_id', operator: '==', value: assignment.id },
      { field: 'bab_id', operator: '==', value: babId },
      { field: 'tugas_id', operator: '==', value: tugasId },
    ]);
    
    for (const doc of nilaiDocs) {
      await deleteDocument('nilai_tugas', doc.id);
    }
    
    // Step 2: Delete the TUGAS itself using the Firestore document ID
    await deleteDocument('tugas_bab', firestoreTugasDocId);
    
    return true;
  } catch (e) {
    console.error('Error in cascade delete TUGAS:', e);
    throw e;
  }
}

async function deleteUlanganHarianColumnWithCascade(context, assignment, uhColumnId, firestoreDocId) {
  try {
    const nilaiDocs = await getDocumentsWhere('nilai_ujian', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
      { field: 'pengajaran_id', operator: '==', value: assignment.id },
      { field: 'jenis_nilai', operator: '==', value: 'ulangan_harian' },
    ]);

    for (const doc of nilaiDocs) {
      const tipe = String(doc.tipe || '');
      if (tipe === uhColumnId || tipe.startsWith(`${uhColumnId}_`)) {
        await deleteDocument('nilai_ujian', doc.id);
      }
    }

    if (firestoreDocId) {
      await deleteDocument('ulangan_harian_kolom', firestoreDocId);
    }

    return true;
  } catch (e) {
    console.error('Error deleting kolom UH:', e);
    throw e;
  }
}

async function cleanupInvalidUlanganHarianEntries(context, assignment) {
  try {
    const invalidLabels = new Set(['murni', 'remidi']);

    const uhColumnsDocs = await getDocumentsWhere('ulangan_harian_kolom', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
      { field: 'pengajaran_id', operator: '==', value: assignment.id },
    ]);

    for (const doc of uhColumnsDocs) {
      const idLabel = String(doc.uh_id || doc.id || '').trim().toLowerCase();
      const nameLabel = String(doc.uh_nama || doc.nama || '').trim().toLowerCase();
      if (invalidLabels.has(idLabel) || invalidLabels.has(nameLabel)) {
        await deleteDocument('ulangan_harian_kolom', doc.id);
      }
    }

    const freshCols = await getDocumentsWhere('ulangan_harian_kolom', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
      { field: 'pengajaran_id', operator: '==', value: assignment.id },
    ]);
    const allowedUhIds = new Set(
      freshCols
        .map((doc, index) => String(doc.uh_id || doc.id || `uh${index + 1}`).toLowerCase())
        .filter((id) => id && !invalidLabels.has(id))
    );

    const nilaiDocs = await getDocumentsWhere('nilai_ujian', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
      { field: 'pengajaran_id', operator: '==', value: assignment.id },
      { field: 'jenis_nilai', operator: '==', value: 'ulangan_harian' },
    ]);

    for (const doc of nilaiDocs) {
      const tipe = String(doc.tipe || '').trim().toLowerCase();
      const baseId = extractUhBaseIdFromTipe(tipe).toLowerCase();
      if (invalidLabels.has(tipe) || invalidLabels.has(baseId) || (allowedUhIds.size > 0 && !allowedUhIds.has(baseId))) {
        await deleteDocument('nilai_ujian', doc.id);
      }
    }
  } catch (e) {
    console.warn('Cleanup invalid UH entries skipped:', e);
  }
}

async function saveAllNilaiTugasToFirestore(context, assignment, cacheKey) {
  try {
    const cached = getFromCache(cacheKey);
    const nilai = cached.nilai || {};
    
    // Save all nilai_tugas to Firestore
    for (const [key, value] of Object.entries(nilai)) {
      const [babId, tugasId, siswaId] = key.split('_');
      if (value && value !== '') {
        const docId = `${assignment.id}_${babId}_${tugasId}_${siswaId}`;
        await saveDocument('nilai_tugas', {
          tahun_ajaran_id: context.tahun_ajaran_aktif,
          semester_id: context.semester_aktif,
          pengajaran_id: assignment.id,
          guru_id: context.user_logged_in,
          kelas_id: assignment.kelas_id,
          mapel_id: assignment.mapel_id,
          siswa_id: siswaId,
          bab_id: babId,
          tugas_id: tugasId,
          nilai: parseFloat(value),
          updated_at: new Date().toISOString(),
        }, docId);
      }
    }
    
    showNotification('✓ Data Nilai Tugas berhasil disimpan!', 'success');
    return true;
  } catch (e) {
    console.error('Error saving nilai tugas:', e);
    showNotification('Gagal menyimpan data nilai tugas', 'error');
    return false;
  }
}

async function saveAllNilaiUHToFirestore(context, assignment, cacheKey) {
  try {
    const cached = getFromCache(cacheKey);
    const nilaiUH = cached.nilaiUH || {};
    const uhColumns = normalizeUlanganHarianColumns(cached.uhColumns || []);
    const allowedUhIds = new Set(uhColumns.map((col) => String(col.id || '').toLowerCase()));
    
    // Save all nilai_ujian (UH) to Firestore
    for (const [key, value] of Object.entries(nilaiUH)) {
      const parsed = parseNilaiUhCacheKey(key);
      if (!parsed) continue;
      const { siswaId, tipe } = parsed;
      const baseId = extractUhBaseIdFromTipe(tipe).toLowerCase();
      if (!allowedUhIds.has(baseId)) continue;
      if (value !== '' && value !== null && value !== undefined) {
        const docId = `${assignment.id}_${siswaId}_ulangan_harian_${tipe}`;
        await saveDocument('nilai_ujian', {
          tahun_ajaran_id: context.tahun_ajaran_aktif,
          semester_id: context.semester_aktif,
          pengajaran_id: assignment.id,
          guru_id: context.user_logged_in,
          kelas_id: assignment.kelas_id,
          mapel_id: assignment.mapel_id,
          siswa_id: siswaId,
          jenis_nilai: 'ulangan_harian',
          tipe: tipe,
          nilai: parseFloat(value),
          updated_at: new Date().toISOString(),
        }, docId);
      }
    }
    
    showNotification('✓ Data Ulangan Harian berhasil disimpan!', 'success');
    return true;
  } catch (e) {
    console.error('Error saving nilai UH:', e);
    showNotification('Gagal menyimpan data ulangan harian', 'error');
    return false;
  }
}

async function saveAllNilaiExamToFirestore(context, assignment, cacheKey, jenisNilai) {
  try {
    const cached = getFromCache(cacheKey);
    const nilaiKey = jenisNilai === 'pts' ? 'nilaiPTS' : 'nilaiPAS';
    const nilaiData = cached[nilaiKey] || {};
    
    // Save all nilai_ujian (PTS/PAS) to Firestore
    for (const [siswaId, value] of Object.entries(nilaiData)) {
      if (value && value !== '') {
        await saveDocument('nilai_ujian', {
          tahun_ajaran_id: context.tahun_ajaran_aktif,
          semester_id: context.semester_aktif,
          pengajaran_id: assignment.id,
          guru_id: context.user_logged_in,
          kelas_id: assignment.kelas_id,
          mapel_id: assignment.mapel_id,
          siswa_id: siswaId,
          jenis_nilai: jenisNilai,
          nilai: parseFloat(value),
          updated_at: new Date().toISOString(),
        });
      }
    }
    
    const label = jenisNilai === 'pts' ? 'PTS' : 'PAS';
    showNotification(`✓ Data ${label} berhasil disimpan!`, 'success');
    return true;
  } catch (e) {
    console.error(`Error saving nilai ${jenisNilai}:`, e);
    showNotification(`Gagal menyimpan data ${jenisNilai}`, 'error');
    return false;
  }
}

// ============================================================================
// RENDER TAB: NILAI TUGAS (REBUILT)
// ============================================================================

async function renderTabNilaiTugas(context, assignment, members, container) {
  const cacheKey = getOrCreateCacheKey(context, assignment);
  
  // ALWAYS load fresh from Firestore to ensure sync across browsers
  const firestoreBabs = await loadBabsFromFirestore(context, assignment);
  const firestoreTugas = await loadTugasFromFirestore(context, assignment);
  const firestoreNilai = await loadNilaiTugasFromFirestore(context, assignment);
  
  // Save fresh data to cache
  const cached = {
    babs: firestoreBabs,
    tugas: firestoreTugas,
    nilai: firestoreNilai,
  };
  saveToCache(cacheKey, cached);
  
  const babs = firestoreBabs || [];
  const tugas = firestoreTugas || {};
  const nilai = firestoreNilai || {};
  const sortedMembers = sortMembersByName(members);
  
  // Ambil state selected bab dari elemen saat ini (jika dirender ulang lewat change event)
  const currentSelect = container.querySelector('#bab-select');
  let selectedBabId = currentSelect ? currentSelect.value : null;
  // Jika belum dipilih atau id tsb sdh tidak ada, gunakan default (bab pertama)
  if (!selectedBabId || !babs.find(b => b.id === selectedBabId)) {
      selectedBabId = babs.length > 0 ? babs[0].id : null;
  }
  
  const selectedBab = babs.find(b => b.id === selectedBabId);
  const tugasBab = selectedBab ? (tugas[selectedBabId] || []) : [];

  // Build options
  const babOptions = babs.map(b => `<option value="${b.id}" ${b.id === selectedBabId ? 'selected' : ''}>${b.nama}</option>`).join('');

  let html = `
    <div class="space-y-4">
      <!-- Control Section -->
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="mb-4">
          <label class="text-xs font-semibold text-slate-600">Pilih BAB</label>
          <div class="flex gap-2 mt-2">
            <select id="bab-select" class="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              ${babOptions || '<option value="">-- Pilih BAB --</option>'}
            </select>
            <button id="btn-tambah-bab" class="flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg> Tambah
            </button>
            <button id="btn-edit-bab" class="flex items-center gap-2 rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600 transition" ${babs.length ? '' : 'disabled style="opacity:0.5;cursor:not-allowed"'}>
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg> Edit
            </button>
            <button id="btn-hapus-bab" class="flex items-center gap-2 rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white hover:bg-red-600 transition" ${babs.length ? '' : 'disabled style="opacity:0.5;cursor:not-allowed"'}>
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg> Hapus
            </button>
          </div>
        </div>

        <!-- Task Management -->
        ${selectedBab ? `
          <div class="mb-4 pb-4 border-b border-slate-200">
            <label class="text-xs font-semibold text-slate-600">Tugas untuk ${selectedBab.nama}</label>
            <div class="mt-2 flex flex-wrap gap-2">
              ${tugasBab.map(t => `
                <div class="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
                  <span>${t.nama}</span>
                  <button class="btn-hapus-tugas text-red-500 hover:text-red-700 ml-1" data-bab="${selectedBab.id}" data-tugas="${t.id}" title="Hapus tugas">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
                </div>
              `).join('')}
              <button id="btn-tambah-tugas" class="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600 transition">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg> Tambah Tugas
              </button>
            </div>
          </div>
        ` : '<div class="text-center py-4 text-slate-500 text-sm">Silakan tambah BAB terlebih dahulu</div>'}

        <!-- Nilai Tugas Table -->
        <div id="nilai-tugas-container" class="mt-4 overflow-x-auto">
          ${renderTabelNilaiTugasRebuild(selectedBab, tugasBab, nilai, sortedMembers)}
        </div>
      </div>

      <!-- Summary Statistics -->
      <div id="summary-nilai-tugas" class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        ${renderSummaryNilaiTugasRebuild(babs, tugas, nilai, sortedMembers)}
      </div>

      <!-- Save Button -->
      <div class="flex justify-end gap-2">
        <button id="btn-simpan-nilai-tugas" class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V3"></path></svg>
          Simpan Semua
        </button>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Setup event listeners
  setupNilaiTugasEventsRebuild(container, context, assignment, members, cacheKey);
}

function renderTabelNilaiTugasRebuild(selectedBab, tugasBab, nilai, members) {
  if (!selectedBab || tugasBab.length === 0) {
    return '<div class="text-center py-8 text-slate-500 text-sm">Belum ada tugas di BAB ini. Tambah tugas terlebih dahulu.</div>';
  }

  let html = `
    <table class="w-full text-xs border-collapse">
      <thead>
        <tr class="bg-gradient-to-r from-slate-100 to-slate-200">
          <th class="border border-slate-300 px-2 py-2 text-left font-semibold text-slate-700">No</th>
          <th class="border border-slate-300 px-2 py-2 text-left font-semibold text-slate-700">Siswa</th>
          ${tugasBab.map(t => `<th class="border border-slate-300 px-2 py-2 text-center font-semibold text-slate-700 whitespace-nowrap" title="${t.nama}">
            <div class="flex items-center justify-center gap-1 group">
              <span>${t.nama}</span>
              <button class="btn-edit-tugas text-slate-400 hover:text-sky-500 opacity-0 group-hover:opacity-100 transition-opacity" data-bab="${selectedBab.id}" data-tugas="${t.id}" title="Edit tugas">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
              </button>
            </div>
          </th>`).join('')}
          <th class="border border-slate-300 px-2 py-2 text-center font-semibold bg-gradient-to-r from-emerald-400 to-teal-400 text-white">Rata-rata</th>
        </tr>
      </thead>
      <tbody>
        ${members.map((member, idx) => {
          const studentId = member.siswa_id || member.id;
          const scores = tugasBab.map(t => {
            const val = nilai[`${selectedBab.id}_${t.id}_${studentId}`];
            return val !== undefined && val !== '' ? Number(val) : 0;
          });
          const average = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '-';

          return `
            <tr class="hover:bg-slate-50 transition" data-student-id="${studentId}">
              <td class="border border-slate-300 px-2 py-1 text-slate-700 font-medium">${idx + 1}</td>
              <td class="border border-slate-300 px-2 py-1 text-slate-700 font-medium">${member.siswa_nama || member.nama}</td>
              ${tugasBab.map(t => {
                const val = nilai[`${selectedBab.id}_${t.id}_${studentId}`];
                return `
                  <td class="border border-slate-300 px-2 py-1 bg-slate-50">
                    <input 
                      type="number" 
                      min="0" 
                      max="100" 
                      class="nilai-input h-10 w-20 md:w-24 text-center border border-slate-200 rounded-lg px-2 text-sm bg-white focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                      data-bab="${selectedBab.id}" 
                      data-tugas="${t.id}" 
                      data-siswa="${studentId}" 
                      value="${val || '0'}"
                    />
                  </td>
                `;
              }).join('')}
              <td class="border border-slate-300 px-2 py-1 text-center font-bold bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-800 nilai-rata-rata" data-student-id="${studentId}">${average}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  return html;
}

function renderSummaryNilaiTugasRebuild(babs, tugas, nilai, members) {
  let summary = '<div class="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">';

  // Average per BAB
  babs.forEach(bab => {
    let totalPerBab = 0;
    let countPerBab = 0;

    members.forEach(member => {
      const studentId = member.siswa_id || member.id;
      const tugasBab = tugas[bab.id] || [];
      let studentScores = [];

      tugasBab.forEach(t => {
        const val = nilai[`${bab.id}_${t.id}_${studentId}`];
        if (val !== undefined && val !== '') {
          studentScores.push(Number(val));
        } else {
          studentScores.push(0);
        }
      });

      if (studentScores.length > 0) {
        const avg = studentScores.reduce((a, b) => a + b, 0) / studentScores.length;
        totalPerBab += avg;
        countPerBab++;
      }
    });

    const avgBab = countPerBab > 0 ? (totalPerBab / countPerBab).toFixed(1) : '-';
    summary += `
      <div class="rounded-lg bg-white border border-slate-200 p-3 shadow-sm">
        <p class="text-xs text-slate-600 font-medium truncate">${bab.nama}</p>
        <p class="text-lg font-bold text-emerald-600">${avgBab}</p>
      </div>
    `;
  });

  // Overall average
  let totalAll = 0;
  let countAll = 0;

  members.forEach(member => {
    const studentId = member.siswa_id || member.id;
    let studentAllScores = [];

    babs.forEach(bab => {
      const tugasBab = tugas[bab.id] || [];
      tugasBab.forEach(t => {
        const val = nilai[`${bab.id}_${t.id}_${studentId}`];
        if (val !== undefined && val !== '') {
          studentAllScores.push(Number(val));
        } else {
          studentAllScores.push(0);
        }
      });
    });

    if (studentAllScores.length > 0) {
      const avg = studentAllScores.reduce((a, b) => a + b, 0) / studentAllScores.length;
      totalAll += avg;
      countAll++;
    }
  });

  const avgAll = countAll > 0 ? (totalAll / countAll).toFixed(1) : '-';
  summary += `
    <div class="rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 p-3 shadow-md col-span-2 md:col-span-2">
      <p class="text-xs text-white font-medium">Rata-rata Keseluruhan</p>
      <p class="text-2xl font-bold text-white">${avgAll}</p>
    </div>
  `;

  summary += '</div>';
  return summary;
}

function setupNilaiTugasEventsRebuild(container, context, assignment, members, cacheKey) {
  const session = getSession();
  const tabContent = container.closest('[id="tab-content"]') || container;

  // Helper: Refresh averages without full re-render
  const updateAverages = () => {
    const cached = getFromCache(cacheKey);
    const babs = cached.babs || [];
    const tugas = cached.tugas || {};
    const nilai = cached.nilai || {};

    container.querySelectorAll('[data-student-id]').forEach(row => {
      const studentId = row.getAttribute('data-student-id');
      const inputs = row.querySelectorAll('.nilai-input');
      const scores = Array.from(inputs).map(inp => Number(inp.value) || 0);
      const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '-';
      const rataRata = row.querySelector('.nilai-rata-rata');
      if (rataRata) rataRata.textContent = avg;
    });

    // Update summary
    const summary = container.querySelector('#summary-nilai-tugas');
    if (summary) {
      summary.innerHTML = renderSummaryNilaiTugasRebuild(babs, tugas, nilai, members);
    }
  };

  // Tambah BAB
  container.querySelector('#btn-tambah-bab')?.addEventListener('click', async () => {
    const nama = prompt('Masukkan nama BAB:', '');
    if (!nama || !nama.trim()) return;

    const cached = getFromCache(cacheKey);
    const babs = cached.babs || [];
    
    const newBab = {
      id: generateId('bab'),
      nama: nama.trim(),
      urutan: babs.length + 1,
      created_at: new Date().toISOString(),
    };

    // Simpan ke Firestore
    try {
      await saveDocument('bab', {
        tahun_ajaran_id: context.tahun_ajaran_aktif,
        semester_id: context.semester_aktif,
        pengajaran_id: assignment.id,
        guru_id: context.user_logged_in || session.user?.username,
        bab_id: newBab.id,
        bab_nama: newBab.nama,
        urutan: newBab.urutan,
        created_at: newBab.created_at,
      });
      
      // Clear cache untuk force reload
      clearCache(cacheKey);
      
      showNotification('✓ BAB berhasil ditambahkan', 'success');
    } catch (e) {
      console.error('Error saving BAB:', e);
      showNotification('Gagal menyimpan BAB', 'error');
      return;
    }

    // Re-render dengan data fresh dari Firestore
    await renderTabNilaiTugas(context, assignment, members, tabContent);
  });

  // Edit BAB
  container.querySelector('#btn-edit-bab')?.addEventListener('click', async () => {
    const babSelect = container.querySelector('#bab-select');
    const selectedBabId = babSelect?.value;
    if (!selectedBabId) return;

    const cached = getFromCache(cacheKey);
    const selectedBab = (cached.babs || []).find(b => b.id === selectedBabId);
    if (!selectedBab) return;

    const newNama = prompt('Edit nama BAB:', selectedBab.nama);
    if (!newNama || !newNama.trim()) return;

    try {
      await saveDocument('bab', {
        tahun_ajaran_id: context.tahun_ajaran_aktif,
        semester_id: context.semester_aktif,
        pengajaran_id: assignment.id,
        guru_id: context.user_logged_in || session.user?.username,
        bab_id: selectedBab.id,
        bab_nama: newNama.trim(),
        urutan: selectedBab.urutan,
        created_at: selectedBab.created_at,
      }, selectedBab.firestoreId);
      
      // Clear cache untuk force reload
      clearCache(cacheKey);
      
      showNotification('✓ BAB berhasil diperbarui', 'success');
    } catch (e) {
      console.error('Error updating BAB:', e);
      showNotification('Gagal memperbarui BAB', 'error');
      return;
    }

    // Re-render dengan data fresh dari Firestore
    await renderTabNilaiTugas(context, assignment, members, tabContent);
  });

  // Hapus BAB
  container.querySelector('#btn-hapus-bab')?.addEventListener('click', async () => {
    const babSelect = container.querySelector('#bab-select');
    const selectedBabId = babSelect?.value;
    if (!selectedBabId) return;

    const cached = getFromCache(cacheKey);
    const selectedBabIdx = (cached.babs || []).findIndex(b => b.id === selectedBabId);
    if (selectedBabIdx === -1) return;

    if (!confirm('Hapus BAB ini?\n\nSemua tugas dan nilai di BAB ini akan dihapus juga!')) return;

    const deletedBab = cached.babs[selectedBabIdx];
    
    // Delete dari Firestore dengan cascade, we must pass the firestoreId not the logical id
    try {
      const docIdToDelete = deletedBab.firestoreId || deletedBab.id;
      await deleteBabWithCascade(context, assignment, docIdToDelete);
      
      // Clear cache untuk force reload dari Firestore
      clearCache(cacheKey);
      invalidateAllCaches();
      
      showNotification('✓ BAB dan semua data terkait berhasil dihapus', 'success');
    } catch (e) {
      console.error('Error deleting BAB:', e);
      showNotification('Gagal menghapus BAB', 'error');
      return;
    }

    await renderTabNilaiTugas(context, assignment, members, tabContent);
  });

  // Tambah Tugas
  container.querySelector('#btn-tambah-tugas')?.addEventListener('click', async () => {
    const babSelect = container.querySelector('#bab-select');
    const selectedBabId = babSelect?.value;
    if (!selectedBabId) {
      alert('Pilih BAB terlebih dahulu');
      return;
    }

    const nama = prompt('Masukkan nama Tugas:', '');
    if (!nama || !nama.trim()) return;

    const cached = getFromCache(cacheKey);
    if (!cached.tugas) cached.tugas = {};
    if (!cached.tugas[selectedBabId]) cached.tugas[selectedBabId] = [];

    const newTugas = {
      id: generateId('tugas'),
      nama: nama.trim(),
      urutan: cached.tugas[selectedBabId].length + 1,
      created_at: new Date().toISOString(),
    };

    try {
      await saveDocument('tugas_bab', {
        tahun_ajaran_id: context.tahun_ajaran_aktif,
        semester_id: context.semester_aktif,
        pengajaran_id: assignment.id,
        guru_id: context.user_logged_in || session.user?.username,
        bab_id: selectedBabId,
        tugas_id: newTugas.id,
        tugas_nama: newTugas.nama,
        urutan: newTugas.urutan,
        created_at: newTugas.created_at,
      });
      
      // Clear cache untuk force reload
      clearCache(cacheKey);
      
      showNotification('✓ Tugas berhasil ditambahkan', 'success');
    } catch (e) {
      console.error('Error saving Tugas:', e);
      showNotification('Gagal menyimpan Tugas', 'error');
      return;
    }

    // Re-render dengan data fresh dari Firestore
    await renderTabNilaiTugas(context, assignment, members, tabContent);
  });

  // Edit Tugas
  container.querySelectorAll('.btn-edit-tugas')?.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const babId = btn.getAttribute('data-bab');
      const tugasId = btn.getAttribute('data-tugas');
      
      const cached = getFromCache(cacheKey);
      const selectedTugas = (cached.tugas[babId] || []).find(t => t.id === tugasId);
      
      if (!selectedTugas) return;
      
      const newNama = prompt('Edit nama Tugas:', selectedTugas.nama);
      if (!newNama || !newNama.trim()) return;

      try {
        await saveDocument('tugas_bab', {
          tahun_ajaran_id: context.tahun_ajaran_aktif,
          semester_id: context.semester_aktif,
          pengajaran_id: assignment.id,
          guru_id: context.user_logged_in || session.user?.username,
          kelas_id: assignment.kelas_id,
          mapel_id: assignment.mapel_id,
          bab_id: babId,
          tugas_id: selectedTugas.id,
          tugas_nama: newNama.trim(),
          urutan: selectedTugas.urutan,
          created_at: selectedTugas.created_at,
        }, selectedTugas.firestoreId);
        
        // Clear cache untuk force reload
        clearCache(cacheKey);
        
        showNotification('✓ Tugas berhasil diperbarui', 'success');
      } catch (e) {
        console.error('Error updating Tugas:', e);
        showNotification('Gagal memperbarui Tugas', 'error');
        return;
      }

      // Re-render dengan data fresh dari Firestore
      await renderTabNilaiTugas(context, assignment, members, tabContent);
    });
  });

  // Hapus Tugas
  container.querySelectorAll('.btn-hapus-tugas')?.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const babId = btn.getAttribute('data-bab');
      const tugasId = btn.getAttribute('data-tugas');
      
      const cached = getFromCache(cacheKey);
      
      // Need to find the firestoreIds for these
      const selectedBab = (cached.babs || []).find(b => b.id === babId);
      const selectedTugas = (cached.tugas[babId] || []).find(t => t.id === tugasId);
      
      if (!selectedBab || !selectedTugas) return;
      
      const firestoreBabId = selectedBab.firestoreId || selectedBab.id;
      const firestoreTugasId = selectedTugas.firestoreId || selectedTugas.id;
      
      if (!confirm('Hapus tugas ini?\n\nSemua nilai untuk tugas ini akan dihapus!')) return;

      // Delete dari Firestore dengan cascade
      try {
        await deleteTugasWithCascade(context, assignment, firestoreBabId, firestoreTugasId);
        
        // Clear cache untuk force reload dari Firestore
        clearCache(cacheKey);
        invalidateAllCaches();
        
        showNotification('✓ Tugas dan semua nilai terkait berhasil dihapus', 'success');
      } catch (e) {
        console.error('Error deleting Tugas:', e);
        showNotification('Gagal menghapus Tugas', 'error');
        return;
      }

      await renderTabNilaiTugas(context, assignment, members, tabContent);
    });
  });

  // BAB Select Change
  container.querySelector('#bab-select')?.addEventListener('change', async () => {
    await renderTabNilaiTugas(context, assignment, members, tabContent);
  });

  // Input Nilai - Real-time update with debounce
  let saveTimeout;
  container.querySelectorAll('.nilai-input')?.forEach(input => {
    input.addEventListener('change', () => {
      const babId = input.getAttribute('data-bab');
      const tugasId = input.getAttribute('data-tugas');
      const siswaId = input.getAttribute('data-siswa');
      const val = Number(input.value) || 0;

      const cached = getFromCache(cacheKey);
      if (!cached.nilai) cached.nilai = {};
      cached.nilai[`${babId}_${tugasId}_${siswaId}`] = val;
      saveToCache(cacheKey, cached);

      // Immediate average update
      updateAverages();

      // Visual feedback
      input.classList.add('bg-green-100');
      setTimeout(() => input.classList.remove('bg-green-100'), 300);

      // Debounced Firestore save
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(async () => {
        try {
          const docId = `${assignment.id}_${babId}_${tugasId}_${siswaId}`;
          await saveDocument('nilai_tugas', {
            tahun_ajaran_id: context.tahun_ajaran_aktif,
            semester_id: context.semester_aktif,
            pengajaran_id: assignment.id,
            guru_id: context.user_logged_in || session.user?.username,
            kelas_id: assignment.kelas_id,
            mapel_id: assignment.mapel_id,
            siswa_id: siswaId,
            bab_id: babId,
            tugas_id: tugasId,
            nilai: val,
            updated_at: new Date().toISOString(),
          }, docId);
        } catch (e) {
          console.error('Error saving nilai:', e);
        }
      }, 1000);
    });
  });

  // Save Button
  container.querySelector('#btn-simpan-nilai-tugas')?.addEventListener('click', async () => {
    const btn = container.querySelector('#btn-simpan-nilai-tugas');
    btn.disabled = true;
    btn.innerHTML = '<svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4"></path></svg> Menyimpan...';

    const success = await saveAllNilaiTugasToFirestore(context, assignment, cacheKey);
    
    if (success) {
      // Clear cache untuk force reload data fresh dari Firestore
      clearCache(cacheKey);
    }

    btn.disabled = false;
    btn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V3"></path></svg> Simpan Semua';
  });
}

// ============================================================================
// RENDER TAB: ULANGAN HARIAN
// ============================================================================

async function renderTabUlanganHarian(context, assignment, members, container) {
  const cacheKey = getOrCreateCacheKey(context, assignment);

  await cleanupInvalidUlanganHarianEntries(context, assignment);
  
  // ALWAYS load fresh from Firestore
  const firestoreNilaiUH = await loadNilaiUHFromFirestore(context, assignment);
  const firestoreUhColumns = await loadUlanganHarianColumnsFromFirestore(context, assignment);
  const uhColumns = normalizeUlanganHarianColumns(firestoreUhColumns);
  const cached = { nilaiUH: firestoreNilaiUH, uhColumns };
  saveToCache(cacheKey, cached);
  
  const nilaiUH = firestoreNilaiUH || {};
  const sortedMembers = sortMembersByName(members);

  let html = `
    <div class="space-y-4">
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="mb-4 flex gap-2 items-end">
          <div class="flex-1">
            <label class="text-xs font-semibold text-slate-600">Nama Ulangan Harian</label>
            <input id="uh-nama" type="text" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Misal: UH Bab 1" />
          </div>
          <button id="btn-tambah-uh" class="rounded-lg bg-[#0EA5E9] px-4 py-2 text-xs font-semibold text-white hover:bg-sky-600">
            + Tambah Kolom
          </button>
        </div>

        <div class="mb-4 flex flex-wrap gap-2">
          ${uhColumns
            .map((col) => `
              <div class="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800">
                <span>${col.nama}</span>
                <button type="button" class="btn-hapus-uh text-rose-600 hover:text-rose-700" data-uh-id="${col.id}" data-uh-firestore-id="${col.firestoreId || ''}" title="Hapus kolom UH">
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
            `)
            .join('')}
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="bg-slate-200">
                <th class="border border-slate-300 px-2 py-1 text-left font-semibold" rowspan="2">No</th>
                <th class="border border-slate-300 px-2 py-1 text-left font-semibold" rowspan="2">Siswa</th>
                ${uhColumns
                  .map((col) => `<th class="border border-slate-300 px-2 py-1 text-center font-semibold bg-blue-100" colspan="3">${col.nama}</th>`)
                  .join('')}
                <th class="border border-slate-300 px-2 py-1 text-center font-semibold bg-[#10B981] text-white" rowspan="2">Rata-rata UH</th>
              </tr>
              <tr class="bg-slate-100 text-xs">
                ${uhColumns.map(() => `
                  <th class="border border-slate-300 px-1 py-1 text-center text-slate-600 font-medium">Murni</th>
                  <th class="border border-slate-300 px-1 py-1 text-center text-slate-600 font-medium">Remidi</th>
                  <th class="border border-slate-300 px-1 py-1 text-center text-emerald-600 font-medium tracking-tighter">Tertinggi</th>
                `).join('')}
              </tr>
            </thead>
            <tbody>
              ${sortedMembers
                .map((member, idx) => {
                  const siswa = member.siswa_id || member.id;
                  
                  const scores = uhColumns.map((col) => {
                    const murniRaw = nilaiUH[`${siswa}_${col.id}_murni`];
                    const remidiRaw = nilaiUH[`${siswa}_${col.id}_remidi`];
                    const legacyRaw = nilaiUH[`${siswa}_${col.id}`];
                    
                    let murni = null;
                    if (murniRaw !== undefined && murniRaw !== '') murni = Number(murniRaw);
                    else if (legacyRaw !== undefined && legacyRaw !== '') murni = Number(legacyRaw);
                    
                    let remidi = null;
                    if (remidiRaw !== undefined && remidiRaw !== '') remidi = Number(remidiRaw);
                    
                    let maxMurniRem = null;
                    if (murni !== null || remidi !== null) {
                       maxMurniRem = Math.max(murni || 0, remidi || 0);
                    }
                    return maxMurniRem;
                  });

                  const validScores = scores.filter(s => s !== null);
                  const avg = validScores.length > 0
                    ? (validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(1)
                    : '-';

                  return `
                    <tr class="hover:bg-slate-100">
                      <td class="border border-slate-300 px-2 py-1">${idx + 1}</td>
                      <td class="border border-slate-300 px-2 py-1">${member.siswa_nama || member.nama}</td>
                      ${uhColumns
                        .map((col) => {
                          const murniRaw = nilaiUH[`${siswa}_${col.id}_murni`];
                          const remidiRaw = nilaiUH[`${siswa}_${col.id}_remidi`];
                          const legacyRaw = nilaiUH[`${siswa}_${col.id}`];
                          
                          let murniVal = murniRaw !== undefined ? murniRaw : (legacyRaw !== undefined ? legacyRaw : '');
                          let remidiVal = remidiRaw !== undefined ? remidiRaw : '';
                          
                          let murni = murniVal !== '' ? Number(murniVal) : null;
                          let remidi = remidiVal !== '' ? Number(remidiVal) : null;
                          let maxVal = '-';
                          if (murni !== null || remidi !== null) {
                             maxVal = Math.max(murni || 0, remidi || 0);
                          }
                          
                          return `
                            <td class="border border-slate-300 px-1 py-1"><input type="number" min="0" max="100" class="nilai-uh h-10 w-16 md:w-20 text-center border border-slate-200 rounded-md px-2 text-sm" data-siswa="${siswa}" data-uh="${col.id}_murni" value="${murniVal}" /></td>
                            <td class="border border-slate-300 px-1 py-1"><input type="number" min="0" max="100" class="nilai-uh h-10 w-16 md:w-20 text-center border border-slate-200 rounded-md px-2 text-sm" data-siswa="${siswa}" data-uh="${col.id}_remidi" value="${remidiVal}" /></td>
                            <td class="border border-slate-300 px-1 py-1 text-center font-bold text-slate-500 bg-slate-50" data-max-uh="${col.id}">${maxVal}</td>
                          `;
                        })
                        .join('')}
                      <td class="border border-slate-300 px-2 py-1 text-center font-semibold bg-emerald-100 text-emerald-800" data-avg-uh="true">${avg}</td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>

        <button id="btn-simpan-uh" class="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-600 transition">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3v-6"></path></svg> Simpan Ulangan Harian
        </button>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Event Listeners
  const cached_ = getFromCache(cacheKey);
  const session = getSession();
  let saveTimeout;

  const updateUlanganHarianRow = (inputEl) => {
    const row = inputEl.closest('tr');
    if (!row) return;

    uhColumns.forEach((col) => {
      const murniEl = row.querySelector(`[data-uh="${col.id}_murni"]`);
      const remidiEl = row.querySelector(`[data-uh="${col.id}_remidi"]`);
      const maxEl = row.querySelector(`[data-max-uh="${col.id}"]`);

      const murni = murniEl && murniEl.value !== '' ? Number(murniEl.value) : null;
      const remidi = remidiEl && remidiEl.value !== '' ? Number(remidiEl.value) : null;

      if (maxEl) {
        if (murni === null && remidi === null) {
          maxEl.textContent = '-';
        } else {
          maxEl.textContent = String(Math.max(murni || 0, remidi || 0));
        }
      }
    });

    const avgEl = row.querySelector('[data-avg-uh="true"]');
    if (avgEl) {
      const maxValues = uhColumns
        .map((col) => row.querySelector(`[data-max-uh="${col.id}"]`)?.textContent || '-')
        .map((txt) => (txt !== '-' ? Number(txt) : null))
        .filter((num) => num !== null);

      avgEl.textContent = maxValues.length
        ? (maxValues.reduce((a, b) => a + b, 0) / maxValues.length).toFixed(1)
        : '-';
    }
  };

  container.querySelector('#btn-tambah-uh')?.addEventListener('click', async () => {
    const inputEl = container.querySelector('#uh-nama');
    const proposedName = String(inputEl?.value || '').trim();
    const colName = proposedName || `UH ${uhColumns.length + 1}`;
    const safeId = `uh${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    const newCol = {
      id: safeId,
      nama: colName,
      urutan: uhColumns.length + 1,
      created_at: new Date().toISOString(),
    };

    try {
      await saveDocument('ulangan_harian_kolom', {
        tahun_ajaran_id: context.tahun_ajaran_aktif,
        semester_id: context.semester_aktif,
        pengajaran_id: assignment.id,
        guru_id: context.user_logged_in || session.user?.username,
        kelas_id: assignment.kelas_id,
        mapel_id: assignment.mapel_id,
        uh_id: newCol.id,
        uh_nama: newCol.nama,
        urutan: newCol.urutan,
        created_at: newCol.created_at,
      }, newCol.id);

      clearCache(cacheKey);
      showNotification('✓ Kolom UH berhasil ditambahkan', 'success');
      await renderTabUlanganHarian(context, assignment, members, container);
    } catch (e) {
      console.error('Error adding kolom UH:', e);
      showNotification('Gagal menambah kolom UH', 'error');
    }
  });

  container.querySelectorAll('.btn-hapus-uh')?.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const uhId = btn.getAttribute('data-uh-id');
      const firestoreId = btn.getAttribute('data-uh-firestore-id') || '';
      if (!uhId) return;

      if (uhColumns.length <= 1) {
        alert('Minimal harus ada 1 kolom UH.');
        return;
      }

      if (!confirm('Hapus kolom UH ini?\n\nSemua nilai murni/remidi pada kolom ini akan ikut dihapus.')) return;

      try {
        await deleteUlanganHarianColumnWithCascade(context, assignment, uhId, firestoreId || null);
        clearCache(cacheKey);
        invalidateAllCaches();
        showNotification('✓ Kolom UH berhasil dihapus', 'success');
        await renderTabUlanganHarian(context, assignment, members, container);
      } catch (e) {
        console.error('Error deleting kolom UH:', e);
        showNotification('Gagal menghapus kolom UH', 'error');
      }
    });
  });

  container.querySelectorAll('.nilai-uh')?.forEach((input) => {
    input.addEventListener('change', () => {
      clearTimeout(saveTimeout);
      
      const siswa = input.getAttribute('data-siswa');
      const uh = input.getAttribute('data-uh'); // e.g. uh1_murni or uh1_remidi
      const val = Number(input.value) || 0;

      cached_.nilaiUH = cached_.nilaiUH || {};
      cached_.nilaiUH[`${siswa}_${uh}`] = val;
      saveToCache(cacheKey, cached_);

      // Update max/rata-rata locally without full tab rerender.
      updateUlanganHarianRow(input);

      input.classList.add('bg-green-100');
      setTimeout(() => input.classList.remove('bg-green-100'), 500);

      // Debounced real-time Firestore save
      saveTimeout = setTimeout(async () => {
        try {
          const docId = `${assignment.id}_${siswa}_ulangan_harian_${uh}`;
          await saveDocument('nilai_ujian', {
            tahun_ajaran_id: context.tahun_ajaran_aktif,
            semester_id: context.semester_aktif,
            pengajaran_id: assignment.id,
            guru_id: context.user_logged_in || session.user?.username,
            kelas_id: assignment.kelas_id,
            mapel_id: assignment.mapel_id,
            siswa_id: siswa,
            jenis_nilai: 'ulangan_harian',
            tipe: uh, // e.g. uh1_murni or uh1_remidi
            nilai: val,
            updated_at: new Date().toISOString(),
          }, docId);
        } catch (e) {
          console.error('Error saving nilai UH:', e);
        }
      }, 1000);
    });
  });

  container.querySelector('#btn-simpan-uh')?.addEventListener('click', async () => {
    const btn = container.querySelector('#btn-simpan-uh');
    btn.disabled = true;
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4"></path></svg> Menyimpan...';
    
    await saveAllNilaiUHToFirestore(context, assignment, cacheKey);
    
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  });
}

// ============================================================================
// RENDER TAB: PTS & PAS
// ============================================================================

async function renderTabPTSPAS(context, assignment, members, container) {
  const cacheKey = getOrCreateCacheKey(context, assignment);
  
  // ALWAYS load fresh from Firestore
  const firestoreNilaiPTS = await loadNilaiPTSFromFirestore(context, assignment);
  const firestoreNilaiPAS = await loadNilaiPASFromFirestore(context, assignment);
  const cached = { nilaiPTS: firestoreNilaiPTS, nilaiPAS: firestoreNilaiPAS };
  saveToCache(cacheKey, cached);
  
  const nilaiPTS = firestoreNilaiPTS || {};
  const nilaiPAS = firestoreNilaiPAS || {};
  const sortedMembers = sortMembersByName(members);

  let html = `
    <div class="space-y-4">
      <div class="grid gap-4 xl:grid-cols-2 xl:items-start">
      <!-- PTS -->
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 class="mb-4 text-sm font-bold text-slate-700 flex items-center gap-2"><svg class="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> Penilaian Tengah Semester (PTS)</h3>
        <div class="overflow-x-auto mb-4">
          <table class="w-full text-xs">
            <thead>
              <tr class="bg-gradient-to-r from-purple-100 to-purple-200">
                <th class="border border-slate-300 px-2 py-1 text-left font-semibold" rowspan="2">No</th>
                <th class="border border-slate-300 px-2 py-1 text-left font-semibold" rowspan="2">Siswa</th>
                <th class="border border-slate-300 px-2 py-1 text-center font-semibold" colspan="3">Nilai PTS</th>
              </tr>
              <tr class="bg-purple-50 text-xs">
                <th class="border border-slate-300 px-1 py-1 text-center text-slate-600 font-medium">Murni</th>
                <th class="border border-slate-300 px-1 py-1 text-center text-slate-600 font-medium">Remidi</th>
                <th class="border border-slate-300 px-1 py-1 text-center text-purple-700 font-medium tracking-tighter">Tertinggi</th>
              </tr>
            </thead>
            <tbody>
              ${sortedMembers
                .map(
                  (member, idx) => {
                    const siswa = member.siswa_id || member.id;
                    const legacyPTS = nilaiPTS[siswa];
                    const ptsMurniVal = nilaiPTS[`${siswa}_murni`] !== undefined ? nilaiPTS[`${siswa}_murni`] : (legacyPTS !== undefined ? legacyPTS : '');
                    const ptsRemidiVal = nilaiPTS[`${siswa}_remidi`] !== undefined ? nilaiPTS[`${siswa}_remidi`] : '';
                    
                    let ptsMurni = ptsMurniVal !== '' ? Number(ptsMurniVal) : null;
                    let ptsRemidi = ptsRemidiVal !== '' ? Number(ptsRemidiVal) : null;
                    let maxPTS = '-';
                    if (ptsMurni !== null || ptsRemidi !== null) maxPTS = Math.max(ptsMurni || 0, ptsRemidi || 0);

                    return `
                    <tr class="hover:bg-slate-100">
                      <td class="border border-slate-300 px-2 py-1">${idx + 1}</td>
                      <td class="border border-slate-300 px-2 py-1">${member.siswa_nama || member.nama}</td>
                      <td class="border border-slate-300 px-1 py-1"><input type="number" min="0" max="100" class="nilai-pts h-10 w-16 md:w-20 text-center border border-slate-200 rounded-md px-2 text-sm" data-siswa="${siswa}" data-tipe="murni" value="${ptsMurniVal}" /></td>
                      <td class="border border-slate-300 px-1 py-1"><input type="number" min="0" max="100" class="nilai-pts h-10 w-16 md:w-20 text-center border border-slate-200 rounded-md px-2 text-sm" data-siswa="${siswa}" data-tipe="remidi" value="${ptsRemidiVal}" /></td>
                      <td class="border border-slate-300 px-2 py-1 text-center font-bold text-slate-500 bg-slate-50">${maxPTS}</td>
                    </tr>
                    `;
                  }
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- PAS -->
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 class="mb-4 text-sm font-bold text-slate-700 flex items-center gap-2"><svg class="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> Penilaian Akhir Semester (PAS)</h3>
        <div class="overflow-x-auto mb-4">
          <table class="w-full text-xs">
            <thead>
              <tr class="bg-gradient-to-r from-orange-100 to-orange-200">
                <th class="border border-slate-300 px-2 py-1 text-left font-semibold" rowspan="2">No</th>
                <th class="border border-slate-300 px-2 py-1 text-left font-semibold" rowspan="2">Siswa</th>
                <th class="border border-slate-300 px-2 py-1 text-center font-semibold" colspan="3">Nilai PAS</th>
              </tr>
              <tr class="bg-orange-50 text-xs">
                <th class="border border-slate-300 px-1 py-1 text-center text-slate-600 font-medium">Murni</th>
                <th class="border border-slate-300 px-1 py-1 text-center text-slate-600 font-medium">Remidi</th>
                <th class="border border-slate-300 px-1 py-1 text-center text-orange-700 font-medium tracking-tighter">Tertinggi</th>
              </tr>
            </thead>
            <tbody>
              ${sortedMembers
                .map(
                  (member, idx) => {
                    const siswa = member.siswa_id || member.id;
                    const legacyPAS = nilaiPAS[siswa];
                    const pasMurniVal = nilaiPAS[`${siswa}_murni`] !== undefined ? nilaiPAS[`${siswa}_murni`] : (legacyPAS !== undefined ? legacyPAS : '');
                    const pasRemidiVal = nilaiPAS[`${siswa}_remidi`] !== undefined ? nilaiPAS[`${siswa}_remidi`] : '';
                    
                    let pasMurni = pasMurniVal !== '' ? Number(pasMurniVal) : null;
                    let pasRemidi = pasRemidiVal !== '' ? Number(pasRemidiVal) : null;
                    let maxPAS = '-';
                    if (pasMurni !== null || pasRemidi !== null) maxPAS = Math.max(pasMurni || 0, pasRemidi || 0);

                    return `
                    <tr class="hover:bg-slate-100">
                      <td class="border border-slate-300 px-2 py-1">${idx + 1}</td>
                      <td class="border border-slate-300 px-2 py-1">${member.siswa_nama || member.nama}</td>
                      <td class="border border-slate-300 px-1 py-1"><input type="number" min="0" max="100" class="nilai-pas h-10 w-16 md:w-20 text-center border border-slate-200 rounded-md px-2 text-sm" data-siswa="${siswa}" data-tipe="murni" value="${pasMurniVal}" /></td>
                      <td class="border border-slate-300 px-1 py-1"><input type="number" min="0" max="100" class="nilai-pas h-10 w-16 md:w-20 text-center border border-slate-200 rounded-md px-2 text-sm" data-siswa="${siswa}" data-tipe="remidi" value="${pasRemidiVal}" /></td>
                      <td class="border border-slate-300 px-2 py-1 text-center font-bold text-slate-500 bg-slate-50">${maxPAS}</td>
                    </tr>
                  `;
                  }
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      <button id="btn-simpan-pts-pas" class="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-600 transition">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3v-6"></path></svg> Simpan PTS & PAS
      </button>
    </div>
  `;

  container.innerHTML = html;

  // Event Listeners
  const session = getSession();
  let saveTimeout;

  container.querySelectorAll('.nilai-pts')?.forEach((input) => {
    input.addEventListener('change', () => {
      clearTimeout(saveTimeout);
      const siswa = input.getAttribute('data-siswa');
      const tipe = input.getAttribute('data-tipe'); // murni or remidi
      const val = Number(input.value) || 0;

      const cached_ = getFromCache(cacheKey);
      cached_.nilaiPTS = cached_.nilaiPTS || {};
      cached_.nilaiPTS[`${siswa}_${tipe}`] = val;
      saveToCache(cacheKey, cached_);

      input.classList.add('bg-green-100');
      setTimeout(() => input.classList.remove('bg-green-100'), 500);

      // Debounced real-time Firestore save
      saveTimeout = setTimeout(async () => {
        try {
          const docId = `${assignment.id}_${siswa}_pts_${tipe}`;
          await saveDocument('nilai_ujian', {
            tahun_ajaran_id: context.tahun_ajaran_aktif,
            semester_id: context.semester_aktif,
            pengajaran_id: assignment.id,
            guru_id: context.user_logged_in || session.user?.username,
            kelas_id: assignment.kelas_id,
            mapel_id: assignment.mapel_id,
            siswa_id: siswa,
            jenis_nilai: 'pts',
            tipe: tipe,
            nilai: val,
            updated_at: new Date().toISOString(),
          }, docId);

          await renderTabPTSPAS(context, assignment, members, container);
        } catch (e) {
          console.error('Error saving nilai PTS:', e);
        }
      }, 1000);
    });
  });

  container.querySelectorAll('.nilai-pas')?.forEach((input) => {
    input.addEventListener('change', () => {
      clearTimeout(saveTimeout);
      const siswa = input.getAttribute('data-siswa');
      const tipe = input.getAttribute('data-tipe'); // murni or remidi
      const val = Number(input.value) || 0;

      const cached_ = getFromCache(cacheKey);
      cached_.nilaiPAS = cached_.nilaiPAS || {};
      cached_.nilaiPAS[`${siswa}_${tipe}`] = val;
      saveToCache(cacheKey, cached_);

      input.classList.add('bg-green-100');
      setTimeout(() => input.classList.remove('bg-green-100'), 500);

      // Debounced real-time Firestore save
      saveTimeout = setTimeout(async () => {
        try {
          const docId = `${assignment.id}_${siswa}_pas_${tipe}`;
          await saveDocument('nilai_ujian', {
            tahun_ajaran_id: context.tahun_ajaran_aktif,
            semester_id: context.semester_aktif,
            pengajaran_id: assignment.id,
            guru_id: context.user_logged_in || session.user?.username,
            kelas_id: assignment.kelas_id,
            mapel_id: assignment.mapel_id,
            siswa_id: siswa,
            jenis_nilai: 'pas',
            tipe: tipe,
            nilai: val,
            updated_at: new Date().toISOString(),
          }, docId);

          await renderTabPTSPAS(context, assignment, members, container);
        } catch (e) {
          console.error('Error saving nilai PAS:', e);
        }
      }, 1000);
    });
  });

  container.querySelector('#btn-simpan-pts-pas')?.addEventListener('click', async () => {
    const btn = container.querySelector('#btn-simpan-pts-pas');
    btn.disabled = true;
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4"></path></svg> Menyimpan...';
    
    await Promise.all([
      saveAllNilaiExamToFirestore(context, assignment, cacheKey, 'pts'),
      saveAllNilaiExamToFirestore(context, assignment, cacheKey, 'pas'),
    ]);
    
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  });
}

// ============================================================================
// RENDER TAB: NILAI AKHIR
// ============================================================================

async function renderTabNilaiAkhir(context, assignment, members, container) {
  const cacheKey = getOrCreateCacheKey(context, assignment);
  
  // ALWAYS load fresh from Firestore
  const firestoreBabs = await loadBabsFromFirestore(context, assignment);
  const firestoreTugas = await loadTugasFromFirestore(context, assignment);
  const firestoreNilai = await loadNilaiTugasFromFirestore(context, assignment);
  const firestoreNilaiUH = await loadNilaiUHFromFirestore(context, assignment);
  const firestoreUhColumns = await loadUlanganHarianColumnsFromFirestore(context, assignment);
  const firestoreNilaiPTS = await loadNilaiPTSFromFirestore(context, assignment);
  const firestoreNilaiPAS = await loadNilaiPASFromFirestore(context, assignment);
  const uhColumns = normalizeUlanganHarianColumns(firestoreUhColumns);
  
  const existingCache = getFromCache(cacheKey);

  // Bobot default: Tugas 20%, UH 20%, PTS 30%, PAS 30%
  const defaultBobot = {
    tugas: 0.2,
    uh: 0.2,
    pts: 0.3,
    pas: 0.3,
  };

  const defaultKonversi = {
    metode: 'nilai-asli',
    kkm: 75,
    min: 0,
    max: 4,
    tiers: [
      { min: 90, max: 100, count: 15 },
      { min: 85, max: 89, count: 10 },
      { min: 80, max: 84, count: 6 },
      { min: 75, max: 79, count: 5 },
    ],
  };

  const cached = {
    babs: firestoreBabs,
    tugas: firestoreTugas,
    nilai: firestoreNilai,
    nilaiUH: firestoreNilaiUH,
    uhColumns,
    nilaiPTS: firestoreNilaiPTS,
    nilaiPAS: firestoreNilaiPAS,
    bobot: existingCache.bobot || defaultBobot,
    konversi: existingCache.konversi || defaultKonversi,
  };
  saveToCache(cacheKey, cached);
  
  const babs = firestoreBabs || [];
  const tugas = firestoreTugas || {};
  const nilai = firestoreNilai || {};
  const nilaiUH = firestoreNilaiUH || {};
  const nilaiPTS = firestoreNilaiPTS || {};
  const nilaiPAS = firestoreNilaiPAS || {};
  const sortedMembers = sortMembersByName(members);
  const bobot = cached.bobot || defaultBobot;
  const konversi = cached.konversi || defaultKonversi;

  const clamp = (num, min, max) => Math.max(min, Math.min(max, num));

  const getGradeFromScore100 = (score100) => {
    if (score100 >= 90) return 'A';
    if (score100 >= 80) return 'B';
    if (score100 >= 70) return 'C';
    if (score100 >= 60) return 'D';
    return 'E';
  };

  const getGradeFromScore4 = (score4) => {
    if (score4 >= 3.66) return 'A';
    if (score4 >= 3.0) return 'B';
    if (score4 >= 2.33) return 'C';
    if (score4 >= 1.66) return 'D';
    return 'E';
  };

  const normalizeQuotaTiers = (tiersInput) => {
    const source = Array.isArray(tiersInput) && tiersInput.length ? tiersInput : defaultKonversi.tiers;
    return source
      .map((tier) => {
        let min = Number(tier.min);
        let max = Number(tier.max);
        let count = Math.max(0, Number(tier.count) || 0);
        if (!Number.isFinite(min)) min = 0;
        if (!Number.isFinite(max)) max = 100;
        if (max < min) {
          const temp = min;
          min = max;
          max = temp;
        }
        return {
          min: clamp(min, 0, 100),
          max: clamp(max, 0, 100),
          count: Math.floor(count),
        };
      })
      .filter((tier) => tier.count > 0);
  };

  const getStudentFinalComponents = (member) => {
    const siswa = member.siswa_id || member.id;

    let totalTugas = 0;
    let countTugas = 0;
    babs.forEach((bab) => {
      const tugasBab = tugas[bab.id] || [];
      const scores = tugasBab
        .map((t) => nilai[`${bab.id}_${t.id}_${siswa}`] || 0)
        .filter((s) => s > 0);
      if (scores.length > 0) {
        totalTugas += scores.reduce((a, b) => a + Number(b), 0) / scores.length;
        countTugas++;
      }
    });
    const avgTugas = countTugas > 0 ? totalTugas / countTugas : 0;

    const uhScores = uhColumns
      .map((col) => {
        const murniRaw = nilaiUH[`${siswa}_${col.id}_murni`];
        const remidiRaw = nilaiUH[`${siswa}_${col.id}_remidi`];
        const legacyRaw = nilaiUH[`${siswa}_${col.id}`];

        const murni = murniRaw !== undefined && murniRaw !== '' ? Number(murniRaw) : (legacyRaw !== undefined && legacyRaw !== '' ? Number(legacyRaw) : null);
        const remidi = remidiRaw !== undefined && remidiRaw !== '' ? Number(remidiRaw) : null;

        if (murni !== null || remidi !== null) return Math.max(murni || 0, remidi || 0);
        return null;
      })
      .filter((s) => s !== null);
    const avgUH = uhScores.length > 0 ? uhScores.reduce((a, b) => a + b, 0) / uhScores.length : 0;

    const ptsMurniRaw = nilaiPTS[`${siswa}_murni`];
    const ptsRemidiRaw = nilaiPTS[`${siswa}_remidi`];
    const legacyPTSRaw = nilaiPTS[siswa];
    const ptsMurni = ptsMurniRaw !== undefined && ptsMurniRaw !== '' ? Number(ptsMurniRaw) : (legacyPTSRaw !== undefined && legacyPTSRaw !== '' ? Number(legacyPTSRaw) : 0);
    const ptsRemidi = ptsRemidiRaw !== undefined && ptsRemidiRaw !== '' ? Number(ptsRemidiRaw) : 0;
    const avgPTS = Math.max(ptsMurni, ptsRemidi);

    const pasMurniRaw = nilaiPAS[`${siswa}_murni`];
    const pasRemidiRaw = nilaiPAS[`${siswa}_remidi`];
    const legacyPASRaw = nilaiPAS[siswa];
    const pasMurni = pasMurniRaw !== undefined && pasMurniRaw !== '' ? Number(pasMurniRaw) : (legacyPASRaw !== undefined && legacyPASRaw !== '' ? Number(legacyPASRaw) : 0);
    const pasRemidi = pasRemidiRaw !== undefined && pasRemidiRaw !== '' ? Number(pasRemidiRaw) : 0;
    const avgPAS = Math.max(pasMurni, pasRemidi);

    const nilaiAkhir100 = avgTugas * bobot.tugas + avgUH * bobot.uh + avgPTS * bobot.pts + avgPAS * bobot.pas;

    return { siswa, avgTugas, avgUH, avgPTS, avgPAS, nilaiAkhir100 };
  };

  const studentFinalMap = new Map(sortedMembers.map((member) => {
    const data = getStudentFinalComponents(member);
    return [data.siswa, data];
  }));

  const buildQuotaConvertedMap = (quotaConfig) => {
    const tiers = normalizeQuotaTiers(quotaConfig?.tiers);
    const ranked = Array.from(studentFinalMap.values()).sort((a, b) => b.nilaiAkhir100 - a.nilaiAkhir100);
    const result = new Map();
    let cursor = 0;

    tiers.forEach((tier) => {
      for (let i = 0; i < tier.count && cursor < ranked.length; i += 1) {
        const row = ranked[cursor];
        const converted = tier.count <= 1
          ? tier.max
          : tier.max - (i * (tier.max - tier.min)) / (tier.count - 1);
        result.set(row.siswa, clamp(converted, 0, 100));
        cursor += 1;
      }
    });

    while (cursor < ranked.length) {
      const row = ranked[cursor];
      result.set(row.siswa, clamp(row.nilaiAkhir100, 0, 100));
      cursor += 1;
    }

    return result;
  };

  const quotaConvertedMap = (konversi.metode === 'konversi-sekolah') ? buildQuotaConvertedMap(konversi) : new Map();

  const convertFinalScore = (score100, configOverride = null) => {
    const safeScore100 = clamp(Number(score100) || 0, 0, 100);
    const activeConfig = configOverride || konversi;
    const method = activeConfig.metode || 'nilai-asli';
    const kkm = clamp(Number(activeConfig.kkm) || 75, 1, 100);
    let minVal = Number(activeConfig.min);
    let maxVal = Number(activeConfig.max);
    if (!Number.isFinite(minVal)) minVal = 0;
    if (!Number.isFinite(maxVal)) maxVal = 4;
    if (maxVal < minVal) {
      const tmp = minVal;
      minVal = maxVal;
      maxVal = tmp;
    }
    const range = Math.max(0.0001, maxVal - minVal);

    if (method === 'konversi-umum') {
      const converted = minVal + (safeScore100 / 100) * range;
      const normalized100 = ((converted - minVal) / range) * 100;
      return {
        nilaiDisplay: converted.toFixed(2),
        grade: getGradeFromScore100(clamp(normalized100, 0, 100)),
        header: `NILAI AKHIR (${minVal.toFixed(2)}-${maxVal.toFixed(2)})`,
      };
    }

    if (method === 'konversi-sekolah') {
      const normalized100 = clamp(safeScore100, 0, 100);
      return {
        nilaiDisplay: normalized100.toFixed(1),
        grade: getGradeFromScore100(normalized100),
        header: 'NILAI AKHIR (KUOTA SEKOLAH)',
      };
    }

    return {
      nilaiDisplay: safeScore100.toFixed(1),
      grade: getGradeFromScore100(safeScore100),
      header: 'NILAI AKHIR (ASLI)',
    };
  };

  const konversiHeader = convertFinalScore(100).header;

  let html = `
    <div class="space-y-4">
      <div class="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start">
      <div class="space-y-4">
      <!-- Pengaturan Bobot -->
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 class="mb-4 text-sm font-bold text-slate-700 flex items-center gap-2"><svg class="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg> Pengaturan Bobot Nilai</h3>
        <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <label class="text-xs font-semibold text-slate-600">Tugas (%)</label>
            <input id="bobot-tugas" type="number" min="0" max="100" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value="${bobot.tugas * 100}" />
          </div>
          <div>
            <label class="text-xs font-semibold text-slate-600">UH (%)</label>
            <input id="bobot-uh" type="number" min="0" max="100" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value="${bobot.uh * 100}" />
          </div>
          <div>
            <label class="text-xs font-semibold text-slate-600">PTS (%)</label>
            <input id="bobot-pts" type="number" min="0" max="100" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value="${bobot.pts * 100}" />
          </div>
          <div>
            <label class="text-xs font-semibold text-slate-600">PAS (%)</label>
            <input id="bobot-pas" type="number" min="0" max="100" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value="${bobot.pas * 100}" />
          </div>
        </div>
        <p class="mt-2 text-xs text-slate-500">Total bobot harus 100%</p>
        <div class="mt-4">
          <button id="btn-simpan-bobot" class="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-600 transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3v-6"></path></svg>
            Simpan Pengaturan Bobot
          </button>
        </div>
      </div>

      <!-- Alat Konversi -->
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 class="mb-3 text-sm font-bold text-slate-700 flex items-center gap-2"><svg class="w-5 h-5 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m-6 4h6m-6 4h6M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z"></path></svg> Alat Konversi Nilai</h3>
        <p class="text-xs text-slate-500">Konversi nilai cepat dari skala 100 ke skala 4, predikat huruf, dan deskripsi capaian.</p>
        <div class="mt-3 grid gap-3">
          <label class="text-xs font-semibold text-slate-600">Nilai (0 - 100)</label>
          <input id="konversi-nilai-100" type="number" min="0" max="100" step="0.1" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Contoh: 87.5" />
        </div>
        <div class="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p class="text-xs font-semibold text-slate-700">Metode Konversi (Aktifkan 1)</p>
          <div class="mt-2 grid gap-2">
            <label class="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" class="metode-konversi rounded border-slate-300" data-metode="nilai-asli" ${konversi.metode === 'nilai-asli' ? 'checked' : ''} />
              <span>1. Nilai Asli</span>
            </label>
            <label class="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" class="metode-konversi rounded border-slate-300" data-metode="konversi-umum" ${konversi.metode === 'konversi-umum' ? 'checked' : ''} />
              <span>2. Konversi Umum</span>
            </label>
            <label class="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" class="metode-konversi rounded border-slate-300" data-metode="konversi-sekolah" ${konversi.metode === 'konversi-sekolah' ? 'checked' : ''} />
              <span>3. Konversi Sekolah</span>
            </label>
          </div>
        </div>
        <div id="konversi-umum-section" class="mt-3 grid gap-3 sm:grid-cols-2 ${konversi.metode === 'konversi-umum' ? '' : 'hidden'}">
          <div>
            <label class="text-xs font-semibold text-slate-600">Nilai Minimum Konversi</label>
            <input id="konversi-min" type="number" step="0.1" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value="${Number.isFinite(Number(konversi.min)) ? Number(konversi.min) : 0}" />
          </div>
          <div>
            <label class="text-xs font-semibold text-slate-600">Nilai Maksimum Konversi</label>
            <input id="konversi-max" type="number" step="0.1" class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value="${Number.isFinite(Number(konversi.max)) ? Number(konversi.max) : 4}" />
          </div>
        </div>
        <div id="konversi-kuota-section" class="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 ${konversi.metode === 'konversi-sekolah' ? '' : 'hidden'}">
          <p class="text-xs font-semibold text-slate-700">Konfigurasi Kuota Sekolah (Fleksibel)</p>
          <p class="mt-1 text-[11px] text-slate-500">Atur rentang nilai dan jumlah siswa per kelompok ranking.</p>
          <div class="mt-3 overflow-x-auto">
            <table class="min-w-full text-xs">
              <thead>
                <tr class="text-slate-500">
                  <th class="px-2 py-1 text-left">Kelompok</th>
                  <th class="px-2 py-1 text-left">Min</th>
                  <th class="px-2 py-1 text-left">Max</th>
                  <th class="px-2 py-1 text-left">Jumlah Siswa</th>
                </tr>
              </thead>
              <tbody>
                ${(Array.isArray(konversi.tiers) && konversi.tiers.length ? konversi.tiers : defaultKonversi.tiers)
                  .map((tier, index) => `
                    <tr data-konversi-tier-row="${index}">
                      <td class="px-2 py-1 font-medium text-slate-700">Kelompok ${index + 1}</td>
                      <td class="px-2 py-1"><input type="number" step="0.1" class="konversi-tier-min w-20 rounded border border-slate-200 px-2 py-1" value="${Number(tier.min)}" /></td>
                      <td class="px-2 py-1"><input type="number" step="0.1" class="konversi-tier-max w-20 rounded border border-slate-200 px-2 py-1" value="${Number(tier.max)}" /></td>
                      <td class="px-2 py-1"><input type="number" min="0" class="konversi-tier-count w-24 rounded border border-slate-200 px-2 py-1" value="${Number(tier.count)}" /></td>
                    </tr>
                  `)
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p class="text-xs text-slate-500">Hasil Konversi</p>
            <p id="konversi-skala-4" class="mt-1 text-lg font-bold text-slate-800">-</p>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p class="text-xs text-slate-500">Predikat</p>
            <p id="konversi-grade" class="mt-1 text-lg font-bold text-slate-800">-</p>
          </div>
        </div>
        <div class="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p class="text-xs text-slate-500">Deskripsi</p>
          <p id="konversi-deskripsi" class="mt-1 text-sm font-medium text-slate-700">Masukkan nilai untuk melihat hasil konversi.</p>
        </div>
      </div>
      </div>

      <!-- Tabel Nilai Akhir -->
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 class="mb-4 text-sm font-bold text-slate-700 flex items-center gap-2"><svg class="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg> Nilai Akhir Siswa</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="bg-gradient-to-r from-slate-100 to-slate-200">
                <th class="border border-slate-300 px-2 py-1 text-left font-semibold">No</th>
                <th class="border border-slate-300 px-2 py-1 text-left font-semibold">Siswa</th>
                <th class="border border-slate-300 px-2 py-1 text-center font-semibold">Tugas</th>
                <th class="border border-slate-300 px-2 py-1 text-center font-semibold">UH</th>
                <th class="border border-slate-300 px-2 py-1 text-center font-semibold">PTS</th>
                <th class="border border-slate-300 px-2 py-1 text-center font-semibold">PAS</th>
                <th class="border border-slate-300 px-2 py-1 text-center font-semibold bg-gradient-to-r from-[#10B981] to-[#06B6D4] text-white font-bold">${konversiHeader}</th>
                <th class="border border-slate-300 px-2 py-1 text-center font-semibold">Grade</th>
              </tr>
            </thead>
            <tbody>
              ${sortedMembers
                .map((member, idx) => {
                  const siswa = member.siswa_id || member.id;

                  const scoreData = studentFinalMap.get(siswa) || { avgTugas: 0, avgUH: 0, avgPTS: 0, avgPAS: 0, nilaiAkhir100: 0 };
                  const sourceForConvert = konversi.metode === 'konversi-sekolah'
                    ? (quotaConvertedMap.get(siswa) ?? scoreData.nilaiAkhir100)
                    : scoreData.nilaiAkhir100;
                  const konversiNilaiAkhir = convertFinalScore(sourceForConvert);
                  const grade = konversiNilaiAkhir.grade;

                  const gradeColor = {
                    A: 'bg-green-200 text-green-800',
                    B: 'bg-blue-200 text-blue-800',
                    C: 'bg-yellow-200 text-yellow-800',
                    D: 'bg-orange-200 text-orange-800',
                    E: 'bg-red-200 text-red-800',
                  }[grade] || 'bg-slate-200';

                  return `
                    <tr class="hover:bg-slate-100">
                      <td class="border border-slate-300 px-2 py-1">${idx + 1}</td>
                      <td class="border border-slate-300 px-2 py-1">${member.siswa_nama || member.nama}</td>
                      <td class="border border-slate-300 px-2 py-1 text-center">${scoreData.avgTugas.toFixed(1)}</td>
                      <td class="border border-slate-300 px-2 py-1 text-center">${scoreData.avgUH.toFixed(1)}</td>
                      <td class="border border-slate-300 px-2 py-1 text-center">${scoreData.avgPTS.toFixed(1)}</td>
                      <td class="border border-slate-300 px-2 py-1 text-center">${scoreData.avgPAS.toFixed(1)}</td>
                      <td class="border border-slate-300 px-2 py-1 text-center font-bold text-lg bg-gradient-to-r from-emerald-100 to-cyan-100">${konversiNilaiAkhir.nilaiDisplay}</td>
                      <td class="border border-slate-300 px-2 py-1 text-center font-semibold"><span class="px-2 py-1 rounded ${gradeColor}">${grade}</span></td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      <button id="btn-simpan-semua-akhir" class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V3"></path></svg>
        Simpan Semua Data
      </button>
    </div>
  `;

  container.innerHTML = html;

  // Alat Konversi Nilai
  const konversiInput = container.querySelector('#konversi-nilai-100');
  const metodeCheckboxes = container.querySelectorAll('.metode-konversi');
  const konversiMin = container.querySelector('#konversi-min');
  const konversiMax = container.querySelector('#konversi-max');
  const konversiSkala4 = container.querySelector('#konversi-skala-4');
  const konversiGrade = container.querySelector('#konversi-grade');
  const konversiDeskripsi = container.querySelector('#konversi-deskripsi');

  const getGradeMeta = (nilai) => {
    if (nilai >= 90) return { grade: 'A', desc: 'Sangat Baik. Penguasaan kompetensi sangat tinggi dan konsisten.' };
    if (nilai >= 80) return { grade: 'B', desc: 'Baik. Penguasaan kompetensi baik dengan sedikit perbaikan minor.' };
    if (nilai >= 70) return { grade: 'C', desc: 'Cukup. Kompetensi dasar tercapai, perlu penguatan pada beberapa indikator.' };
    if (nilai >= 60) return { grade: 'D', desc: 'Kurang. Kompetensi belum stabil dan membutuhkan pendampingan.' };
    return { grade: 'E', desc: 'Sangat Kurang. Memerlukan pembinaan intensif dan remedial menyeluruh.' };
  };

  const getSelectedKonversiConfig = () => ({
    metode: Array.from(metodeCheckboxes).find((el) => el.checked)?.dataset.metode || konversi.metode || 'nilai-asli',
    kkm: 75,
    min: Number(konversiMin?.value),
    max: Number(konversiMax?.value),
    tiers: Array.from(container.querySelectorAll('[data-konversi-tier-row]')).map((row) => ({
      min: Number(row.querySelector('.konversi-tier-min')?.value),
      max: Number(row.querySelector('.konversi-tier-max')?.value),
      count: Number(row.querySelector('.konversi-tier-count')?.value),
    })),
  });

  const renderKonversi = () => {
    const raw = Number(konversiInput?.value);
    if (!Number.isFinite(raw)) {
      konversiSkala4.textContent = '-';
      konversiGrade.textContent = '-';
      konversiDeskripsi.textContent = 'Masukkan nilai untuk melihat hasil konversi.';
      return;
    }

    const nilai = Math.max(0, Math.min(100, raw));
    const activeConfig = getSelectedKonversiConfig();
    const cachedTmp = getFromCache(cacheKey);
    cachedTmp.konversi = activeConfig;
    saveToCache(cacheKey, cachedTmp);
    const result = convertFinalScore(nilai, activeConfig);
    const convertedPreview = result.nilaiDisplay;
    const meta = getGradeMeta(nilai);

    konversiSkala4.textContent = convertedPreview;
    konversiGrade.textContent = result.grade;
    konversiDeskripsi.textContent = `${meta.desc} (Nilai ${nilai.toFixed(1)} / Konversi aktif: ${result.nilaiDisplay}, Grade: ${result.grade})`;
  };

  konversiInput?.addEventListener('input', renderKonversi);
  metodeCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      if (!checkbox.checked) {
        checkbox.checked = true;
        return;
      }

      metodeCheckboxes.forEach((other) => {
        if (other !== checkbox) other.checked = false;
      });

      const cached_ = getFromCache(cacheKey);
      cached_.konversi = getSelectedKonversiConfig();
      saveToCache(cacheKey, cached_);
      await renderTabNilaiAkhir(context, assignment, members, container);
    });
  });
  konversiMin?.addEventListener('change', async () => {
    const cached_ = getFromCache(cacheKey);
    cached_.konversi = getSelectedKonversiConfig();
    saveToCache(cacheKey, cached_);
    await renderTabNilaiAkhir(context, assignment, members, container);
  });
  konversiMax?.addEventListener('change', async () => {
    const cached_ = getFromCache(cacheKey);
    cached_.konversi = getSelectedKonversiConfig();
    saveToCache(cacheKey, cached_);
    await renderTabNilaiAkhir(context, assignment, members, container);
  });
  container.querySelectorAll('.konversi-tier-min, .konversi-tier-max, .konversi-tier-count').forEach((inputEl) => {
    inputEl.addEventListener('change', async () => {
      const cached_ = getFromCache(cacheKey);
      cached_.konversi = getSelectedKonversiConfig();
      saveToCache(cacheKey, cached_);
      await renderTabNilaiAkhir(context, assignment, members, container);
    });
  });

  // Save Bobot
  container.querySelector('#btn-simpan-bobot')?.addEventListener('click', async () => {
    const bobotTugas = Number(container.querySelector('#bobot-tugas').value) || 20;
    const bobotUH = Number(container.querySelector('#bobot-uh').value) || 20;
    const bobotPTS = Number(container.querySelector('#bobot-pts').value) || 30;
    const bobotPAS = Number(container.querySelector('#bobot-pas').value) || 30;

    const total = bobotTugas + bobotUH + bobotPTS + bobotPAS;
    if (total !== 100) {
      alert(`<svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Total bobot harus 100%, saat ini: ${total}%`);
      return;
    }

    const cached_ = getFromCache(cacheKey);
    cached_.bobot = { tugas: bobotTugas / 100, uh: bobotUH / 100, pts: bobotPTS / 100, pas: bobotPAS / 100 };
    saveToCache(cacheKey, cached_);

    alert('✓ Pengaturan bobot berhasil disimpan!');
    await renderTabNilaiAkhir(context, assignment, members, container);
  });

  // Save All Data - Nilai Akhir
  container.querySelector('#btn-simpan-semua-akhir')?.addEventListener('click', async () => {
    const btn = container.querySelector('#btn-simpan-semua-akhir');
    btn.disabled = true;
    btn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4"></path></svg> Menyimpan...';
    
    await Promise.all([
      saveAllNilaiTugasToFirestore(context, assignment, cacheKey),
      saveAllNilaiUHToFirestore(context, assignment, cacheKey),
      saveAllNilaiExamToFirestore(context, assignment, cacheKey, 'pts'),
      saveAllNilaiExamToFirestore(context, assignment, cacheKey, 'pas'),
    ]);
    
    btn.disabled = false;
    btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V3"></path></svg> Simpan Semua Data';
  });
}

// ============================================================================
// RENDER TAB: LAPORAN
// ============================================================================

async function renderTabLaporan(context, assignment, members, container) {
  const cacheKey = getOrCreateCacheKey(context, assignment);
  
  // ALWAYS load fresh from Firestore
  const firestoreBabs = await loadBabsFromFirestore(context, assignment);
  const firestoreTugas = await loadTugasFromFirestore(context, assignment);
  const firestoreNilai = await loadNilaiTugasFromFirestore(context, assignment);
  
  const cached = {
    babs: firestoreBabs,
    tugas: firestoreTugas,
    nilai: firestoreNilai,
  };
  saveToCache(cacheKey, cached);

  let html = `
    <div class="space-y-4">
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 class="mb-4 text-sm font-bold text-slate-700 flex items-center gap-2"><svg class="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg> Statistik Nilai</h3>
        <div id="statistik-container" class="grid grid-cols-2 gap-3 md:grid-cols-6">
          <!-- Akan diisi oleh JavaScript -->
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 class="mb-4 text-sm font-bold text-slate-700 flex items-center gap-2"><svg class="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7H7v10h6V7z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 7v10M9 11h2"></path></svg> Distribusi Nilai</h3>
        <div id="distribusi-container" class="grid grid-cols-2 gap-3 md:grid-cols-5">
          <!-- Akan diisi oleh JavaScript -->
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 class="mb-4 text-sm font-bold text-slate-700">🎯 Analisis Performa Siswa</h3>
        <div class="space-y-2" id="analisis-container">
          <!-- Akan diisi oleh JavaScript -->
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Calculate Statistics
  const babs = cached.babs || [];
  const tugas = cached.tugas || {};
  const nilai = cached.nilai || {};

  const allValues = [];
  members.forEach((member) => {
    const siswa = member.siswa_id || member.id;
    babs.forEach((bab) => {
      const tugasBab = tugas[bab.id] || [];
      const scores = tugasBab
        .map((t) => nilai[`${bab.id}_${t.id}_${siswa}`] || 0)
        .filter((s) => s > 0);
      allValues.push(...scores);
    });
  });

  if (allValues.length > 0) {
    const sorted = allValues.sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const avg = (allValues.reduce((a, b) => a + Number(b), 0) / allValues.length).toFixed(1);
    const median = sorted.length % 2 === 0 ? ((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2).toFixed(1) : sorted[Math.floor(sorted.length / 2)];

    container.querySelector('#statistik-container').innerHTML = `
      <div class="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <p class="text-xs text-slate-600">Nilai Minimum</p>
        <p class="text-xl font-bold text-emerald-700">${min}</p>
      </div>
      <div class="rounded-lg border border-blue-200 bg-blue-50 p-3">
        <p class="text-xs text-slate-600">Nilai Maksimum</p>
        <p class="text-xl font-bold text-blue-700">${max}</p>
      </div>
      <div class="rounded-lg border border-purple-200 bg-purple-50 p-3">
        <p class="text-xs text-slate-600">Rata-rata</p>
        <p class="text-xl font-bold text-purple-700">${avg}</p>
      </div>
      <div class="rounded-lg border border-orange-200 bg-orange-50 p-3">
        <p class="text-xs text-slate-600">Median</p>
        <p class="text-xl font-bold text-orange-700">${median}</p>
      </div>
      <div class="rounded-lg border border-red-200 bg-red-50 p-3">
        <p class="text-xs text-slate-600">Total Data</p>
        <p class="text-xl font-bold text-red-700">${allValues.length}</p>
      </div>
      <div class="rounded-lg border border-cyan-200 bg-cyan-50 p-3">
        <p class="text-xs text-slate-600">Siswa Unik</p>
        <p class="text-xl font-bold text-cyan-700">${members.length}</p>
      </div>
    `;

    // Distribusi Nilai
    const dist = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    allValues.forEach((v) => {
      if (v >= 90) dist.A++;
      else if (v >= 80) dist.B++;
      else if (v >= 70) dist.C++;
      else if (v >= 60) dist.D++;
      else dist.E++;
    });

    container.querySelector('#distribusi-container').innerHTML = `
      <div class="rounded-lg border border-green-200 bg-green-50 p-3">
        <p class="text-xs text-slate-600">A (90-100)</p>
        <p class="text-xl font-bold text-green-700">${dist.A}</p>
      </div>
      <div class="rounded-lg border border-blue-200 bg-blue-50 p-3">
        <p class="text-xs text-slate-600">B (80-89)</p>
        <p class="text-xl font-bold text-blue-700">${dist.B}</p>
      </div>
      <div class="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
        <p class="text-xs text-slate-600">C (70-79)</p>
        <p class="text-xl font-bold text-yellow-700">${dist.C}</p>
      </div>
      <div class="rounded-lg border border-orange-200 bg-orange-50 p-3">
        <p class="text-xs text-slate-600">D (60-69)</p>
        <p class="text-xl font-bold text-orange-700">${dist.D}</p>
      </div>
      <div class="rounded-lg border border-red-200 bg-red-50 p-3">
        <p class="text-xs text-slate-600">E (&lt;60)</p>
        <p class="text-xl font-bold text-red-700">${dist.E}</p>
      </div>
    `;

    // Analisis Siswa
    let analisisHtml = '<div class="space-y-2">';
    const sortedMembersLaporan = sortMembersByName(members);
    sortedMembersLaporan.forEach((member) => {
      const siswa = member.siswa_id || member.id;
      let totalSiswa = 0,
        countSiswa = 0;
      babs.forEach((bab) => {
        const tugasBab = tugas[bab.id] || [];
        const scores = tugasBab
          .map((t) => nilai[`${bab.id}_${t.id}_${siswa}`] || 0)
          .filter((s) => s > 0);
        if (scores.length > 0) {
          totalSiswa += scores.reduce((a, b) => a + Number(b), 0) / scores.length;
          countSiswa++;
        }
      });

      const avgSiswa = countSiswa > 0 ? (totalSiswa / countSiswa).toFixed(1) : 0;
      const status = avgSiswa >= 80 ? '<svg class="w-4 h-4 inline mr-1" fill="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Memuaskan' : avgSiswa >= 60 ? '<svg class="w-4 h-4 inline mr-1" fill="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Perlu Perhatian' : '<svg class="w-4 h-4 inline mr-1" fill="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Remidi';
      const statusColor = avgSiswa >= 80 ? 'bg-green-50' : avgSiswa >= 60 ? 'bg-yellow-50' : 'bg-red-50';

      analisisHtml += `
        <div class="rounded-lg border border-slate-200 ${statusColor} p-2 flex justify-between items-center">
          <span class="text-xs text-slate-700">${member.siswa_nama || member.nama}</span>
          <span class="text-xs font-bold">${avgSiswa} ${status}</span>
        </div>
      `;
    });
    analisisHtml += '</div>';

    container.querySelector('#analisis-container').innerHTML = analisisHtml;
  } else {
    container.querySelector('#statistik-container').innerHTML = '<p class="col-span-full text-center text-slate-500 text-sm">Belum ada data nilai</p>';
  }
}

// ============================================================================
// RENDER TAB: BACKUP NILAI
// ============================================================================

async function renderTabBackupNilai(context, assignment, members, container) {
  const cacheKey = getOrCreateCacheKey(context, assignment);

  const html = `
    <div class="space-y-4">
      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 class="text-sm font-bold text-slate-700 flex items-center gap-2"><svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg> Backup Nilai ke Excel</h3>
        <p class="mt-2 text-sm text-slate-500">Ekspor semua data penilaian dalam satu file Excel (multi-sheet): Nilai Tugas, Ulangan Harian, PTS, PAS, Nilai Akhir, dan konfigurasi.</p>
        <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs text-slate-600">
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3"><p class="font-semibold text-slate-700">Kelas</p><p class="mt-1">${assignment?.kelas_nama || '-'}</p></div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3"><p class="font-semibold text-slate-700">Mapel</p><p class="mt-1">${assignment?.mapel_nama || '-'}</p></div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3"><p class="font-semibold text-slate-700">Tahun Ajaran</p><p class="mt-1">${context?.tahun_ajaran_aktif_nama || context?.tahun_ajaran_aktif || '-'}</p></div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3"><p class="font-semibold text-slate-700">Semester</p><p class="mt-1">${context?.semester_aktif_nama || context?.semester_aktif || '-'}</p></div>
        </div>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button id="btn-backup-nilai-excel" class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
            Backup Excel (.xlsx)
          </button>
          <p id="backup-nilai-message" class="text-xs text-slate-500"></p>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  container.querySelector('#btn-backup-nilai-excel')?.addEventListener('click', async () => {
    const btn = container.querySelector('#btn-backup-nilai-excel');
    const message = container.querySelector('#backup-nilai-message');
    const setMsg = (text, danger = false) => {
      message.textContent = text;
      message.className = danger ? 'text-xs text-rose-600' : 'text-xs text-slate-500';
    };

    try {
      btn.disabled = true;
      const original = btn.innerHTML;
      btn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4"></path></svg> Membuat backup...';
      setMsg('Menyiapkan data backup...');

      await ensureXlsxLoaded();

      const [babs, tugasMap, nilaiTugas, nilaiUH, nilaiPTS, nilaiPAS, uhColsRaw] = await Promise.all([
        loadBabsFromFirestore(context, assignment),
        loadTugasFromFirestore(context, assignment),
        loadNilaiTugasFromFirestore(context, assignment),
        loadNilaiUHFromFirestore(context, assignment),
        loadNilaiPTSFromFirestore(context, assignment),
        loadNilaiPASFromFirestore(context, assignment),
        loadUlanganHarianColumnsFromFirestore(context, assignment),
      ]);

      const uhCols = normalizeUlanganHarianColumns(uhColsRaw || []);
      const cache = getFromCache(cacheKey);
      const bobot = cache.bobot || { tugas: 0.2, uh: 0.2, pts: 0.3, pas: 0.3 };
      const konversi = cache.konversi || { metode: 'nilai-asli' };
      const sortedMembers = sortMembersByName(members || []);

      const workbook = window.XLSX.utils.book_new();

      const applyWorksheetFormat = (ws, { widths = [], headerRows = 1, freezeHeader = true } = {}) => {
        if (!ws || !window.XLSX) return;
        if (widths.length) {
          ws['!cols'] = widths.map((w) => ({ wch: w }));
        }

        const range = window.XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
        for (let r = 0; r < Math.min(headerRows, range.e.r + 1); r += 1) {
          for (let c = range.s.c; c <= range.e.c; c += 1) {
            const cellRef = window.XLSX.utils.encode_cell({ r, c });
            if (!ws[cellRef]) continue;
            ws[cellRef].s = {
              font: { bold: true, color: { rgb: 'FFFFFF' } },
              fill: { fgColor: { rgb: '1E293B' } },
              alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            };
          }
        }

        if (freezeHeader) {
          ws['!freeze'] = { xSplit: 0, ySplit: headerRows, topLeftCell: `A${headerRows + 1}`, activePane: 'bottomLeft', state: 'frozen' };
        }
      };

      const addSheet = (name, rows, opts = {}) => {
        const ws = window.XLSX.utils.aoa_to_sheet(rows);
        applyWorksheetFormat(ws, opts);
        window.XLSX.utils.book_append_sheet(workbook, ws, name);
      };

      const now = new Date();
      const timestamp = now.toLocaleString('id-ID');
      const ringkasanRows = [
        ['Field', 'Nilai'],
        ['Kelas', assignment?.kelas_nama || '-'],
        ['Mata Pelajaran', assignment?.mapel_nama || '-'],
        ['Guru', context?.nama || context?.user_logged_in || '-'],
        ['Tahun Ajaran', context?.tahun_ajaran_aktif_nama || context?.tahun_ajaran_aktif || '-'],
        ['Semester', context?.semester_aktif_nama || context?.semester_aktif || '-'],
        ['Jumlah Siswa', sortedMembers.length],
        ['Waktu Backup', timestamp],
      ];
      addSheet('Ringkasan', ringkasanRows, { widths: [28, 48], headerRows: 1, freezeHeader: true });

      // Sheet Nilai Tugas: urutan seperti tabel web (No, Siswa, Tugas..., Rata-rata).
      const tugasColumns = [];
      (babs || []).forEach((bab) => {
        const tugasBab = tugasMap[bab.id] || [];
        tugasBab.forEach((task) => {
          tugasColumns.push({
            babId: bab.id,
            tugasId: task.id,
            label: task.nama || `${bab.nama || ''}`.trim() || 'Tugas',
          });
        });
      });

      const tugasHeader = ['No', 'Siswa', ...tugasColumns.map((c) => c.label), 'Rata-rata'];
      const tugasRows = [tugasHeader];
      sortedMembers.forEach((member, index) => {
        const siswaId = member.siswa_id || member.id;
        const siswaNama = member.siswa_nama || member.nama || '-';
        const nilaiPerTugas = tugasColumns.map((col) => {
          const key = `${col.babId}_${col.tugasId}_${siswaId}`;
          return nilaiTugas[key] ?? 0;
        });
        const avg = nilaiPerTugas.length
          ? Number((nilaiPerTugas.map(Number).reduce((a, b) => a + b, 0) / nilaiPerTugas.length).toFixed(1))
          : 0;
        tugasRows.push([index + 1, siswaNama, ...nilaiPerTugas, avg]);
      });

      const tugasWidths = [6, 30, ...tugasColumns.map(() => 14), 12];
      addSheet('Nilai Tugas', tugasRows, { widths: tugasWidths, headerRows: 1, freezeHeader: true });

      // Sheet Ulangan Harian: urutan seperti tabel web (No, Siswa, UH..., Rata-rata) memakai nilai tertinggi.
      const uhHeader = ['No', 'Siswa', ...(uhCols || []).map((col) => col.nama || col.id), 'Rata-rata'];
      const uhRows = [uhHeader];
      sortedMembers.forEach((member, index) => {
        const siswaId = member.siswa_id || member.id;
        const siswaNama = member.siswa_nama || member.nama || '-';
        const uhScores = (uhCols || []).map((col) => {
          const murni = nilaiUH[`${siswaId}_${col.id}_murni`];
          const remidi = nilaiUH[`${siswaId}_${col.id}_remidi`];
          const legacy = nilaiUH[`${siswaId}_${col.id}`];
          const mNum = murni !== undefined && murni !== '' ? Number(murni) : (legacy !== undefined && legacy !== '' ? Number(legacy) : null);
          const rNum = remidi !== undefined && remidi !== '' ? Number(remidi) : null;
          return (mNum !== null || rNum !== null) ? Math.max(mNum || 0, rNum || 0) : 0;
        });
        const avg = uhScores.length
          ? Number((uhScores.reduce((a, b) => a + b, 0) / uhScores.length).toFixed(1))
          : 0;
        uhRows.push([index + 1, siswaNama, ...uhScores, avg]);
      });

      const uhWidths = [6, 30, ...(uhCols || []).map(() => 14), 12];
      addSheet('Ulangan Harian', uhRows, { widths: uhWidths, headerRows: 1, freezeHeader: true });

      const ptsRows = [['Siswa', 'Murni', 'Remidi', 'Tertinggi']];
      const pasRows = [['Siswa', 'Murni', 'Remidi', 'Tertinggi']];
      sortedMembers.forEach((member) => {
        const siswaId = member.siswa_id || member.id;
        const siswaNama = member.siswa_nama || member.nama || '-';
        const ptsM = nilaiPTS[`${siswaId}_murni`] ?? nilaiPTS[siswaId] ?? '';
        const ptsR = nilaiPTS[`${siswaId}_remidi`] ?? '';
        const ptsH = (ptsM !== '' || ptsR !== '') ? Math.max(Number(ptsM || 0), Number(ptsR || 0)) : '';
        ptsRows.push([siswaNama, ptsM, ptsR, ptsH]);

        const pasM = nilaiPAS[`${siswaId}_murni`] ?? nilaiPAS[siswaId] ?? '';
        const pasR = nilaiPAS[`${siswaId}_remidi`] ?? '';
        const pasH = (pasM !== '' || pasR !== '') ? Math.max(Number(pasM || 0), Number(pasR || 0)) : '';
        pasRows.push([siswaNama, pasM, pasR, pasH]);
      });
      addSheet('PTS', ptsRows, { widths: [24, 12, 12, 12], headerRows: 1, freezeHeader: true });
      addSheet('PAS', pasRows, { widths: [24, 12, 12, 12], headerRows: 1, freezeHeader: true });

      const finalRows = [['Siswa', 'Rata Tugas', 'Rata UH', 'PTS', 'PAS', 'Nilai Akhir (100)']];
      sortedMembers.forEach((member) => {
        const siswaId = member.siswa_id || member.id;
        const siswaNama = member.siswa_nama || member.nama || '-';

        let totalTugas = 0;
        let countTugas = 0;
        (babs || []).forEach((bab) => {
          const tugasBab = tugasMap[bab.id] || [];
          const scores = tugasBab
            .map((task) => nilaiTugas[`${bab.id}_${task.id}_${siswaId}`])
            .filter((v) => v !== undefined && v !== '')
            .map(Number);
          if (scores.length) {
            totalTugas += scores.reduce((a, b) => a + b, 0) / scores.length;
            countTugas += 1;
          }
        });
        const rataTugas = countTugas ? totalTugas / countTugas : 0;

        const uhScores = (uhCols || []).map((col) => {
          const m = nilaiUH[`${siswaId}_${col.id}_murni`];
          const r = nilaiUH[`${siswaId}_${col.id}_remidi`];
          const l = nilaiUH[`${siswaId}_${col.id}`];
          const mNum = m !== undefined && m !== '' ? Number(m) : (l !== undefined && l !== '' ? Number(l) : null);
          const rNum = r !== undefined && r !== '' ? Number(r) : null;
          return (mNum !== null || rNum !== null) ? Math.max(mNum || 0, rNum || 0) : null;
        }).filter((v) => v !== null);
        const rataUH = uhScores.length ? uhScores.reduce((a, b) => a + b, 0) / uhScores.length : 0;

        const ptsM = Number(nilaiPTS[`${siswaId}_murni`] ?? nilaiPTS[siswaId] ?? 0);
        const ptsR = Number(nilaiPTS[`${siswaId}_remidi`] ?? 0);
        const ptsFinal = Math.max(ptsM, ptsR);

        const pasM = Number(nilaiPAS[`${siswaId}_murni`] ?? nilaiPAS[siswaId] ?? 0);
        const pasR = Number(nilaiPAS[`${siswaId}_remidi`] ?? 0);
        const pasFinal = Math.max(pasM, pasR);

        const akhir100 = rataTugas * bobot.tugas + rataUH * bobot.uh + ptsFinal * bobot.pts + pasFinal * bobot.pas;
        finalRows.push([siswaNama, Number(rataTugas.toFixed(2)), Number(rataUH.toFixed(2)), ptsFinal, pasFinal, Number(akhir100.toFixed(2))]);
      });
      addSheet('Nilai Akhir', finalRows, { widths: [24, 12, 12, 12, 12, 16], headerRows: 1, freezeHeader: true });

      const configRows = [
        ['Kategori', 'Detail'],
        ['Bobot', JSON.stringify(bobot)],
        ['Konversi', JSON.stringify(konversi)],
      ];
      addSheet('Konfigurasi', configRows, { widths: [20, 70], headerRows: 1, freezeHeader: true });

      const wbArray = window.XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbArray], { type: 'application/octet-stream' });
      const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const safeKelas = String(assignment?.kelas_nama || 'kelas').replace(/[^a-zA-Z0-9-_]+/g, '_');
      const safeMapel = String(assignment?.mapel_nama || 'mapel').replace(/[^a-zA-Z0-9-_]+/g, '_');
      downloadBlob(blob, `Backup_Nilai_${safeKelas}_${safeMapel}_${stamp}.xlsx`);

      setMsg('Backup berhasil dibuat dan diunduh.');
      btn.innerHTML = original;
      btn.disabled = false;
    } catch (error) {
      console.error('Backup nilai gagal:', error);
      setMsg(`Backup gagal: ${error.message}`, true);
      btn.disabled = false;
      btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg> Backup Excel (.xlsx)';
    }
  });
}

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================

export async function renderGuruPenilaianPage(container) {
  const context = getStoredContext();
  const session = getSession();

  // Validate Context
  if (!context.tahun_ajaran_aktif || !context.semester_aktif) {
    container.innerHTML = renderLayout('Penilaian', `
      <div class="rounded-2xl border border-red-200 bg-red-50 p-4 text-center">
        <p class="text-sm font-semibold text-red-700 flex items-center gap-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Tahun Ajaran atau Semester belum dipilih!</p>
        <p class="mt-2 text-xs text-red-600">Silakan atur di Dashboard terlebih dahulu.</p>
      </div>
    `);
    return;
  }

  const userId = session?.user?.username || context?.user_logged_in || '';
  const userAssignments = userId ? await getTeachingAssignmentsForUser(context, userId) : [];
  const fallbackAssignments = userAssignments.length ? userAssignments : await getActiveTeachingAssignments(context);
  const assignments = fallbackAssignments;

  if (!assignments.length) {
    container.innerHTML = renderLayout('Penilaian', `
      <div class="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-center">
        <p class="text-sm font-semibold text-orange-700 flex items-center gap-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Tidak ada relasi mengajar yang aktif</p>
        <p class="mt-2 text-xs text-orange-600">Hubungi administrator untuk mengatur relasi mengajar.</p>
      </div>
    `);
    return;
  }

  const selectedAssignment = assignments[0] || null;
  const members = selectedAssignment ? await getClassMembers(context, selectedAssignment.kelas_id) : [];

  const assignmentOptions = assignments
    .map((item) => `<option value="${item.id}" ${item.id === selectedAssignment?.id ? 'selected' : ''}>${item.kelas_nama} • ${item.mapel_nama}</option>`)
    .join('');

  const html = renderLayout('Penilaian', `
    <div class="space-y-4">
      <!-- Assignment Selector -->
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <label class="text-sm font-semibold text-slate-700">Pilih Kelas & Mata Pelajaran</label>
        <select id="assignment-select" class="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm">
          ${assignmentOptions || '<option value="">Tidak ada relasi aktif</option>'}
        </select>
      </div>

      <!-- Tabs -->
      <div class="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div class="flex gap-0 border-b border-slate-200 bg-slate-50 overflow-x-auto">
          <button id="tab-tugas" class="flex items-center gap-2 px-4 py-3 text-xs font-semibold text-slate-700 border-b-2 border-transparent hover:bg-slate-100 whitespace-nowrap active transition" data-tab="tugas"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> Nilai Tugas</button>
          <button id="tab-uh" class="flex items-center gap-2 px-4 py-3 text-xs font-semibold text-slate-700 border-b-2 border-transparent hover:bg-slate-100 whitespace-nowrap transition" data-tab="uh"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg> Ulangan Harian</button>
          <button id="tab-pts" class="flex items-center gap-2 px-4 py-3 text-xs font-semibold text-slate-700 border-b-2 border-transparent hover:bg-slate-100 whitespace-nowrap transition" data-tab="pts"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> PTS & PAS</button>
          <button id="tab-akhir" class="flex items-center gap-2 px-4 py-3 text-xs font-semibold text-slate-700 border-b-2 border-transparent hover:bg-slate-100 whitespace-nowrap transition" data-tab="akhir"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> Nilai Akhir</button>
          <button id="tab-backup" class="flex items-center gap-2 px-4 py-3 text-xs font-semibold text-slate-700 border-b-2 border-transparent hover:bg-slate-100 whitespace-nowrap transition" data-tab="backup"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 16v-8m0 8l-3-3m3 3l3-3M4 20h16"></path></svg> Backup Nilai</button>
          <button id="tab-laporan" class="flex items-center gap-2 px-4 py-3 text-xs font-semibold text-slate-700 border-b-2 border-transparent hover:bg-slate-100 whitespace-nowrap transition" data-tab="laporan"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg> Laporan</button>
        </div>

        <div id="tab-content" class="p-4">
          <!-- Konten tab akan diisi di sini -->
        </div>
      </div>
    </div>
  `);

  container.innerHTML = html;

  // Tab Event Listeners
  const tabButtons = container.querySelectorAll('[data-tab]');
  const tabContent = container.querySelector('#tab-content');
  let activeAssignment = selectedAssignment;
  let activeMembers = members;

  const renderTabByName = async (tabName) => {
    if (!activeAssignment) return;
    if (tabName === 'tugas') {
      await renderTabNilaiTugas(context, activeAssignment, activeMembers, tabContent);
    } else if (tabName === 'uh') {
      await renderTabUlanganHarian(context, activeAssignment, activeMembers, tabContent);
    } else if (tabName === 'pts') {
      await renderTabPTSPAS(context, activeAssignment, activeMembers, tabContent);
    } else if (tabName === 'akhir') {
      await renderTabNilaiAkhir(context, activeAssignment, activeMembers, tabContent);
    } else if (tabName === 'backup') {
      await renderTabBackupNilai(context, activeAssignment, activeMembers, tabContent);
    } else if (tabName === 'laporan') {
      await renderTabLaporan(context, activeAssignment, activeMembers, tabContent);
    }
  };

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      // Remove active state dari semua button
      tabButtons.forEach((b) => {
        b.classList.remove('border-b-[#10B981]', 'text-[#10B981]');
        b.classList.add('border-transparent', 'text-slate-700');
      });

      // Add active state ke button yang diklik
      btn.classList.remove('border-transparent', 'text-slate-700');
      btn.classList.add('border-b-[#10B981]', 'text-[#10B981]');

      const tabName = btn.getAttribute('data-tab');
      await renderTabByName(tabName);
    });
  });

  // Load default tab: Nilai Tugas
  await renderTabByName('tugas');

  // Assignment change
  container.querySelector('#assignment-select')?.addEventListener('change', async () => {
    const assignmentId = container.querySelector('#assignment-select').value;
    const nextAssignment = assignments.find((item) => item.id === assignmentId) || assignments[0] || null;
    if (nextAssignment) {
      activeAssignment = nextAssignment;
      activeMembers = await getClassMembers(context, nextAssignment.kelas_id);
      const activeBtn = Array.from(tabButtons).find((b) => b.classList.contains('border-b-[#10B981]'));
      const activeTab = activeBtn?.getAttribute('data-tab') || 'tugas';
      await renderTabByName(activeTab);
    }
  });
}
