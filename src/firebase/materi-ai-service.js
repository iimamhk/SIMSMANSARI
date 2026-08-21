import { db } from './firebase-config.js';
import { saveDocument, deleteDocument, getDocumentsWhere, recordDocumentRead } from './data-service.js';

const MATERI_AI_COLLECTION = 'materi_ai';
const MATERI_AI_LOCAL_KEY = 'simguru_materi_ai';

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(MATERI_AI_LOCAL_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeLocal(items) {
  localStorage.setItem(MATERI_AI_LOCAL_KEY, JSON.stringify(items));
}

export async function saveMateriAi(record) {
  const payload = {
    ...record,
    updated_at: new Date().toISOString(),
  };

  if (!db) {
    const local = readLocal();
    const idx = local.findIndex((item) => item.id === payload.id);
    if (idx >= 0) local[idx] = { ...local[idx], ...payload };
    else local.push(payload);
    writeLocal(local);
    return payload;
  }

  await saveDocument(MATERI_AI_COLLECTION, payload, payload.id);
  const local = readLocal();
  const idx = local.findIndex((item) => item.id === payload.id);
  if (idx >= 0) local[idx] = { ...local[idx], ...payload };
  else local.push(payload);
  writeLocal(local);
  return payload;
}

export async function listMateriAiForUser(guruId) {
  const normalized = String(guruId || '').trim().toLowerCase();
  if (!normalized) return [];

  let remote = [];
  if (db) {
    try {
      remote = await getDocumentsWhere(MATERI_AI_COLLECTION, [
        { field: 'guru_id', value: guruId },
      ], { orderBy: 'updated_at', orderDirection: 'desc', limit: 30, cacheMs: 60000 });
    } catch (error) {
      console.warn('Gagal memuat riwayat Materi AI dari Firestore:', error);
    }
  }

  const local = readLocal();
  const map = new Map();
  [...local, ...remote].forEach((item) => {
    if (String(item?.guru_id || '').trim().toLowerCase() !== normalized) return;
    if (item?.id) map.set(item.id, { ...map.get(item.id), ...item, id: item.id });
  });

  return Array.from(map.values()).sort((a, b) =>
    String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
  );
}

export async function getMateriAi(id) {
  const local = readLocal().find((item) => item.id === id);
  if (db) {
    try {
      const snapshot = await db.collection(MATERI_AI_COLLECTION).doc(id).get();
      recordDocumentRead(MATERI_AI_COLLECTION, snapshot);
      if (snapshot.exists) return { id: snapshot.id, ...snapshot.data(), ...local };
    } catch (error) {
      console.warn('Gagal memuat Materi AI dari Firestore:', error);
    }
  }
  return local || null;
}

export async function deleteMateriAi(id) {
  if (db) {
    try {
      await deleteDocument(MATERI_AI_COLLECTION, id);
    } catch (error) {
      console.warn('Gagal menghapus Materi AI di Firestore:', error);
    }
  }
  const local = readLocal().filter((item) => item.id !== id);
  writeLocal(local);
  return true;
}
