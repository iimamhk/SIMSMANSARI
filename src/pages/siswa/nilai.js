import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext, getSessionUserKeys, normalizeUserKey } from '../../utils/helpers.js';
import { getDocumentsWhere, saveStudentGradeSummary, getStudentGradeSummary } from '../../firebase/data-service.js';
import { computeFinalScore } from '../../utils/nilai-summary.js';

function chunkArray(items = [], size = 10) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// ============================================================================
// KEBIJAKAN CACHE READ (Optimasi #A — hemat kuota Firestore di jalur siswa)
// ----------------------------------------------------------------------------
// Halaman ini dibuka oleh RATUSAN siswa, sehingga tiap dokumen yang dibaca
// dikali jumlah siswa. Query di sini dibagi dua kategori:
//
//   1. STRUKTUR/METADATA (pengajaran, pembelajaran, bab, tugas_bab,
//      ulangan_harian_kolom) — identik untuk semua siswa sekelas dan nyaris
//      tidak berubah saat semester berjalan. Aman di-cache lama + persist
//      (bertahan melintasi cold start), sehingga membuka ulang halaman tidak
//      membaca ulang dari server. Penulisan guru ke koleksi ini otomatis
//      meng-invalidasi cache (invalidateQueryCache + invalidatePersistentQueryCache
//      di data-service.js), jadi perubahan struktur tetap tercermin.
//
//   2. NILAI (nilai_tugas, nilai_ujian) — data per-siswa yang harus tetap
//      segar; TTL sengaja pendek dan TIDAK diperpanjang.
//
// Catatan skew: nilai difilter berdasar struktur (activeTugasKeys). Agar tugas
// baru + nilainya tidak tersembunyi terlalu lama, TTL struktur bab/tugas dijaga
// MODERAT (30 mnt), sementara metadata mapel (pengajaran/pembelajaran) yang tidak
// memfilter apa pun boleh panjang (6 jam).
const METADATA_CACHE_MS = 21600000;      // 6 jam — pengajaran & pembelajaran (nama mapel)
const METADATA_PERSIST_TTL_MS = 21600000;
const STRUCTURE_CACHE_MS = 1800000;      // 30 menit — bab, tugas_bab, ulangan_harian_kolom
const STRUCTURE_PERSIST_TTL_MS = 1800000;
const GRADE_CACHE_MS = 180000;           // 3 menit — nilai (harus segar), tidak diperpanjang

async function getDocsByPengajaranIds(collectionName, filtersBase, pengajaranIds = []) {
  const normalizedIds = Array.from(new Set((pengajaranIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (!normalizedIds.length) return [];

  const chunks = chunkArray(normalizedIds, 10);
  const result = await Promise.all(chunks.map((ids) => getDocumentsWhere(collectionName, [
    ...filtersBase,
    {
      field: 'pengajaran_id',
      operator: ids.length === 1 ? '==' : 'in',
      value: ids.length === 1 ? ids[0] : ids,
    },
  ], { cacheMs: STRUCTURE_CACHE_MS, persist: true, persistTtlMs: STRUCTURE_PERSIST_TTL_MS })));

  const merged = result.flat();
  const deduped = new Map();
  merged.forEach((item) => {
    const key = String(item.id || `${item.pengajaran_id}_${item.bab_id || item.tugas_id || item.uh_id || ''}`);
    deduped.set(key, item);
  });
  return Array.from(deduped.values());
}

async function getAssignmentDocsByIds(filtersBase, pengajaranIds = []) {
  const normalizedIds = Array.from(new Set((pengajaranIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (!normalizedIds.length) return [];
  const chunks = chunkArray(normalizedIds, 10);

  const [pengajaranChunks, pembelajaranChunks] = await Promise.all([
    Promise.all(chunks.map((ids) => getDocumentsWhere('pengajaran', [
      ...filtersBase,
      {
        field: 'id',
        operator: ids.length === 1 ? '==' : 'in',
        value: ids.length === 1 ? ids[0] : ids,
      },
    ], { cacheMs: METADATA_CACHE_MS, persist: true, persistTtlMs: METADATA_PERSIST_TTL_MS }))),
    Promise.all(chunks.map((ids) => getDocumentsWhere('pembelajaran', [
      ...filtersBase,
      {
        field: 'id',
        operator: ids.length === 1 ? '==' : 'in',
        value: ids.length === 1 ? ids[0] : ids,
      },
    ], { cacheMs: METADATA_CACHE_MS, persist: true, persistTtlMs: METADATA_PERSIST_TTL_MS }))),
  ]);

  const merged = [...pengajaranChunks.flat(), ...pembelajaranChunks.flat()];
  const deduped = new Map();
  merged.forEach((item) => {
    const key = String(item.id || item.pengajaran_id || '');
    if (key) deduped.set(key, item);
  });
  return Array.from(deduped.values());
}

function average(values = []) {
  const valid = values.map((item) => Number(item)).filter((item) => Number.isFinite(item));
  if (!valid.length) {
    return 0;
  }
  return valid.reduce((sum, item) => sum + item, 0) / valid.length;
}

function formatScore(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return '-';
  }
  return value.toFixed(1);
}

function normalizeId(value) {
  return String(value || '').trim().toLowerCase();
}

function toTitleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function sanitizeLabel(value, fallback) {
  const text = String(value || '').trim();
  if (!text) {
    return fallback;
  }

  const genericIdLike = /^(bab|tugas|uh)[_-]?\d+/i.test(text);
  if (genericIdLike) {
    return fallback;
  }

  return toTitleCase(text.replace(/[_-]+/g, ' '));
}

function parseUhType(rawType) {
  const raw = String(rawType || '').trim();
  if (!raw) {
    return { baseId: '', phase: '' };
  }

  if (raw.endsWith('_murni')) {
    return { baseId: raw.slice(0, -7), phase: 'Murni' };
  }

  if (raw.endsWith('_remidi')) {
    return { baseId: raw.slice(0, -8), phase: 'Remidi' };
  }

  return { baseId: raw, phase: '' };
}

function renderDetailItems(items, colorClass, withBab = false) {
  if (!items.length) {
    return '<p class="mt-2 text-sm text-slate-500">Belum ada data.</p>';
  }

  return `
    <ul class="mt-2 space-y-2 text-sm text-slate-700">
      ${items.map((item) => `
        <li class="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
          <div>
            <p class="font-medium text-slate-800">${item.label}</p>
            ${withBab ? `<p class="text-xs text-slate-500">BAB: ${item.babLabel}</p>` : ''}
          </div>
          <span class="rounded-full px-2 py-1 text-xs font-semibold ${colorClass}">${formatScore(item.nilai)}</span>
        </li>
      `).join('')}
    </ul>
  `;
}

export async function renderSiswaNilaiPage(container) {
  const context = getStoredContext();
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const siswaKeys = getSessionUserKeys(session, context);

  const filtersBase = [
    { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
    { field: 'semester_id', operator: '==', value: context.semester_aktif },
  ];
  const studentGradeFilters = siswaKeys.length
    ? [
        ...filtersBase,
        {
          field: 'siswa_id',
          operator: siswaKeys.length === 1 ? '==' : 'in',
          value: siswaKeys.length === 1 ? siswaKeys[0] : siswaKeys,
        },
      ]
    : null;

  // ==========================================================================
  // OPTIMASI READ (Fase 2): ringkasan-first + detail on-demand.
  // ----------------------------------------------------------------------------
  // Halaman ini dibuka ratusan siswa. Sebelumnya SELALU membaca nilai_tugas,
  // nilai_ujian, pengajaran, pembelajaran, bab, tugas_bab, ulangan_harian_kolom
  // hanya untuk menampilkan tabel ringkas — padahal dokumen `ringkasan_siswa`
  // sudah menyimpan nilai_per_mapel (tugas/uh/pts/pas/nilai_akhir/tugas_belum).
  //
  // Strategi baru:
  //   1) Tampilan ringkas (kartu rata-rata + tabel per mapel) diambil dari 1
  //      dokumen ringkasan_siswa → 1 read untuk mayoritas kunjungan.
  //   2) Rincian per-komponen (daftar nilai tiap tugas/UH/PTS/PAS) baru dibaca
  //      dari koleksi mentah SAAT siswa menekan "Muat rincian" → read hanya bila
  //      benar-benar dibutuhkan.
  //   3) Bila ringkasan belum ada (mis. guru belum pernah menyimpan / siswa baru),
  //      halaman otomatis jatuh ke pemuatan penuh sekali agar tetap informatif
  //      sekaligus menuliskan ulang dokumen ringkasan untuk kunjungan berikutnya.
  // ==========================================================================

  // Muat penuh dari koleksi mentah: menghasilkan baris lengkap BESERTA rincian
  // komponen, menghitung rata-rata keseluruhan, dan memperbarui dokumen ringkasan.
  async function loadDetailFromRaw() {
    const [nilaiTugasDocs, nilaiUjianDocs] = await Promise.all([
      studentGradeFilters ? getDocumentsWhere('nilai_tugas', studentGradeFilters, { cacheMs: GRADE_CACHE_MS }) : Promise.resolve([]),
      studentGradeFilters ? getDocumentsWhere('nilai_ujian', studentGradeFilters, { cacheMs: GRADE_CACHE_MS }) : Promise.resolve([]),
    ]);

    const relevantPengajaranIds = Array.from(new Set([
      ...nilaiTugasDocs.map((doc) => String(doc.pengajaran_id || '').trim()),
      ...nilaiUjianDocs.map((doc) => String(doc.pengajaran_id || '').trim()),
    ].filter(Boolean)));

    const [assignmentDocs, babDocs, tugasDocs, uhColumnsDocs] = await Promise.all([
      getAssignmentDocsByIds(filtersBase, relevantPengajaranIds),
      getDocsByPengajaranIds('bab', filtersBase, relevantPengajaranIds),
      getDocsByPengajaranIds('tugas_bab', filtersBase, relevantPengajaranIds),
      getDocsByPengajaranIds('ulangan_harian_kolom', filtersBase, relevantPengajaranIds),
    ]);

    const activeBabKeys = new Set(
      babDocs.map((doc) => `${normalizeId(doc.pengajaran_id)}::${normalizeId(doc.bab_id || doc.id)}`)
    );
  const activeTugasKeys = new Set(
    tugasDocs
      .filter((doc) => activeBabKeys.has(`${normalizeId(doc.pengajaran_id)}::${normalizeId(doc.bab_id)}`))
      .map((doc) => `${normalizeId(doc.pengajaran_id)}::${normalizeId(doc.bab_id)}::${normalizeId(doc.tugas_id || doc.id)}`)
  );
  const filteredNilaiTugasDocs = nilaiTugasDocs.filter((doc) => {
    const belongsToStudent = siswaKeys.includes(normalizeUserKey(doc.siswa_id));
    const tugasKey = `${normalizeId(doc.pengajaran_id)}::${normalizeId(doc.bab_id)}::${normalizeId(doc.tugas_id)}`;
    return belongsToStudent && activeTugasKeys.has(tugasKey);
  });
  const filteredNilaiUjianDocs = nilaiUjianDocs.filter((doc) => siswaKeys.includes(normalizeUserKey(doc.siswa_id)));

  const mapelNameMap = new Map();
  assignmentDocs.forEach((item) => {
    const key = String(item.mapel_id || '').trim();
    if (!key) return;
    mapelNameMap.set(key, item.mapel_nama || item.mapel_id || key);
  });
  [...nilaiTugasDocs, ...nilaiUjianDocs].forEach((item) => {
    const key = String(item.mapel_id || '').trim();
    if (!key || mapelNameMap.has(key)) return;
    if (item.mapel_nama) mapelNameMap.set(key, item.mapel_nama);
  });

  const babNameMap = new Map(
    babDocs.map((item) => {
      const rawId = item.bab_id || item.id || item.firestoreId;
      const fallback = `BAB ${item.urutan || ''}`.trim() || 'BAB';
      const name = sanitizeLabel(item.bab_nama || item.nama, fallback);
      return [normalizeId(rawId), name];
    })
  );

  const tugasNameMap = new Map(
    tugasDocs.map((item) => {
      const rawId = item.tugas_id || item.id || item.firestoreId;
      const fallback = `Tugas ${item.urutan || ''}`.trim() || 'Tugas';
      const name = sanitizeLabel(item.tugas_nama || item.nama, fallback);
      return [normalizeId(rawId), name];
    })
  );

  const uhNameMap = new Map(
    uhColumnsDocs.map((item) => {
      const rawId = item.uh_id || item.id || item.firestoreId;
      const fallback = `UH ${item.urutan || ''}`.trim() || 'UH';
      const name = sanitizeLabel(item.uh_nama || item.nama, fallback);
      return [normalizeId(rawId), name];
    })
  );

  const byMapel = new Map();

  function ensureBucket(mapelId) {
    const key = String(mapelId || '-');
    if (!byMapel.has(key)) {
      byMapel.set(key, {
        tugas: [],
        uh: [],
        pts: [],
        pas: [],
        tugasDetails: [],
        uhDetails: [],
        ptsDetails: [],
        pasDetails: [],
      });
    }
    return byMapel.get(key);
  }

  const tugasCountByMapel = {};
  filteredNilaiTugasDocs.forEach((doc) => {
    const bucket = ensureBucket(doc.mapel_id);
    const score = Number(doc.nilai || 0);
    bucket.tugas.push(score);

    const mapelKey = String(doc.mapel_id || '-');
    tugasCountByMapel[mapelKey] = (tugasCountByMapel[mapelKey] || 0) + 1;

    const tugasId = normalizeId(doc.tugas_id);
    const babId = normalizeId(doc.bab_id);
    const tugasName = tugasNameMap.get(tugasId) || `Tugas ${tugasCountByMapel[mapelKey]}`;
    const babName = babNameMap.get(babId) || 'BAB';

    bucket.tugasDetails.push({
      label: tugasName,
      babLabel: babName,
      nilai: score,
    });
  });

  const uhCountByMapel = {};
  const ptsCountByMapel = {};
  const pasCountByMapel = {};
  filteredNilaiUjianDocs.forEach((doc) => {
    const bucket = ensureBucket(doc.mapel_id);
    const mapelKey = String(doc.mapel_id || '-');
    const score = Number(doc.nilai || 0);
    const jenis = String(doc.jenis_nilai || '').toLowerCase();

    if (jenis === 'ulangan_harian') {
      bucket.uh.push(score);
      uhCountByMapel[mapelKey] = (uhCountByMapel[mapelKey] || 0) + 1;

      const parsed = parseUhType(doc.tipe);
      const uhName = uhNameMap.get(normalizeId(parsed.baseId)) || `UH ${uhCountByMapel[mapelKey]}`;
      bucket.uhDetails.push({
        label: parsed.phase ? `${uhName} (${parsed.phase})` : uhName,
        nilai: score,
      });
    } else if (jenis === 'pts') {
      bucket.pts.push(score);
      ptsCountByMapel[mapelKey] = (ptsCountByMapel[mapelKey] || 0) + 1;
      bucket.ptsDetails.push({
        label: `PTS ${ptsCountByMapel[mapelKey]}`,
        nilai: score,
      });
    } else if (jenis === 'pas') {
      bucket.pas.push(score);
      pasCountByMapel[mapelKey] = (pasCountByMapel[mapelKey] || 0) + 1;
      bucket.pasDetails.push({
        label: `PAS ${pasCountByMapel[mapelKey]}`,
        nilai: score,
      });
    }
  });

  const rows = Array.from(byMapel.entries())
    .map(([mapelId, nilai]) => {
      const tugasAvg = average(nilai.tugas);
      const uhAvg = average(nilai.uh);
      const ptsAvg = average(nilai.pts);
      const pasAvg = average(nilai.pas);
      const finalAvg = computeFinalScore(tugasAvg, uhAvg, ptsAvg, pasAvg);

      return {
        mapelId,
        mapelNama: mapelNameMap.get(mapelId) || mapelId,
        tugasAvg,
        uhAvg,
        ptsAvg,
        pasAvg,
        finalAvg,
        tugasDetails: nilai.tugasDetails,
        uhDetails: nilai.uhDetails,
        ptsDetails: nilai.ptsDetails,
        pasDetails: nilai.pasDetails,
      };
    })
    .sort((a, b) => a.mapelNama.localeCompare(b.mapelNama, 'id'));

  const overall = {
    tugas: average(rows.map((item) => item.tugasAvg).filter((item) => item > 0)),
    uh: average(rows.map((item) => item.uhAvg).filter((item) => item > 0)),
    pts: average(rows.map((item) => item.ptsAvg).filter((item) => item > 0)),
    pas: average(rows.map((item) => item.pasAvg).filter((item) => item > 0)),
  };
  const overallFinal = average([overall.tugas, overall.uh, overall.pts, overall.pas]);

  // Simpan ringkasan nilai per mapel ke dokumen ringkasan_siswa agar dashboard
  // cukup MEMBACA 1 dokumen (hemat read). Memakai data yang SUDAH dimuat di sini,
  // jadi tidak menambah pembacaan. Angka identik dengan tabel di halaman ini.
  try {
    const pengajaranMapelMap = new Map();
    assignmentDocs.forEach((a) => {
      const pid = normalizeId(a.id || a.pengajaran_id);
      if (pid) pengajaranMapelMap.set(pid, String(a.mapel_id || '').trim());
    });
    const tugasTotalByMapel = {};
    activeTugasKeys.forEach((key) => {
      const pid = String(key).split('::')[0];
      const mapelId = pengajaranMapelMap.get(pid);
      if (!mapelId) return;
      tugasTotalByMapel[mapelId] = (tugasTotalByMapel[mapelId] || 0) + 1;
    });
    const tugasFilledByMapel = {};
    const seenFilledTugas = new Set();
    filteredNilaiTugasDocs.forEach((doc) => {
      const mapelId = String(doc.mapel_id || '').trim();
      if (!mapelId) return;
      const key = `${mapelId}::${normalizeId(doc.tugas_id)}`;
      if (seenFilledTugas.has(key)) return;
      seenFilledTugas.add(key);
      tugasFilledByMapel[mapelId] = (tugasFilledByMapel[mapelId] || 0) + 1;
    });
    const round1 = (v) => (Number.isFinite(v) && v > 0 ? Math.round(v * 10) / 10 : 0);
    const perMapel = {};
    rows.forEach((row) => {
      const mapelId = String(row.mapelId || '').trim();
      if (!mapelId || mapelId === '-') return;
      const total = tugasTotalByMapel[mapelId] || 0;
      const terisi = tugasFilledByMapel[mapelId] || 0;
      perMapel[mapelId] = {
        mapel_nama: row.mapelNama,
        tugas: round1(row.tugasAvg),
        uh: round1(row.uhAvg),
        pts: round1(row.ptsAvg),
        pas: round1(row.pasAvg),
        nilai_akhir: round1(row.finalAvg),
        tugas_total: total,
        tugas_terisi: terisi,
        tugas_belum: Math.max(0, total - terisi),
      };
    });
    if (Object.keys(perMapel).length) {
      const siswaId = session?.user?.username || session?.user?.id || siswaKeys[0] || '';
      const siswaNama = session?.user?.nama || '';
      // Fire-and-forget: tidak menghambat render.
      saveStudentGradeSummary(context, { siswa_id: siswaId, siswa_nama: siswaNama }, perMapel)
        .catch((error) => console.warn('Gagal menyimpan ringkasan nilai:', error));
    }
  } catch (error) {
    console.warn('Lewati penyusunan ringkasan nilai:', error);
  }

    return { rows, overall, overallFinal, hasDetails: true };
  }

  // Bangun baris ringkas dari dokumen ringkasan_siswa (nilai_per_mapel) — tanpa
  // rincian per-komponen. Dipakai untuk render awal hemat-read.
  function buildRowsFromSummary(summary) {
    const perMapel = summary?.nilai_per_mapel || {};
    const rows = Object.entries(perMapel)
      .map(([mapelId, value]) => ({
        mapelId,
        mapelNama: value.mapel_nama || mapelId,
        tugasAvg: Number(value.tugas || 0),
        uhAvg: Number(value.uh || 0),
        ptsAvg: Number(value.pts || 0),
        pasAvg: Number(value.pas || 0),
        finalAvg: Number(value.nilai_akhir || 0),
        // Rincian belum dimuat; diisi saat siswa menekan "Muat rincian".
        tugasDetails: [],
        uhDetails: [],
        ptsDetails: [],
        pasDetails: [],
      }))
      .sort((a, b) => a.mapelNama.localeCompare(b.mapelNama, 'id'));

    const overall = {
      tugas: average(rows.map((item) => item.tugasAvg).filter((item) => item > 0)),
      uh: average(rows.map((item) => item.uhAvg).filter((item) => item > 0)),
      pts: average(rows.map((item) => item.ptsAvg).filter((item) => item > 0)),
      pas: average(rows.map((item) => item.pasAvg).filter((item) => item > 0)),
    };
    const overallFinal = average([overall.tugas, overall.uh, overall.pts, overall.pas]);
    return { rows, overall, overallFinal, hasDetails: false };
  }

  // ---- Muat data awal: ringkasan-first, fallback ke koleksi mentah ----
  let summaryDoc = null;
  try {
    const siswaId = session?.user?.username || session?.user?.id || siswaKeys[0] || '';
    summaryDoc = siswaId ? await getStudentGradeSummary(context, siswaId) : null;
  } catch {
    summaryDoc = null;
  }

  let view = (summaryDoc && summaryDoc.nilai_per_mapel && Object.keys(summaryDoc.nilai_per_mapel).length)
    ? buildRowsFromSummary(summaryDoc)
    : await loadDetailFromRaw();

  let { rows, overall, overallFinal } = view;

  const html = renderLayout('Nilai Siswa', `
    <div class="space-y-6">
      <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p class="text-xs uppercase tracking-[0.12em] text-slate-500">Rata Tugas</p>
          <p class="mt-2 text-2xl font-semibold text-slate-900">${formatScore(overall.tugas)}</p>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p class="text-xs uppercase tracking-[0.12em] text-slate-500">Rata UH</p>
          <p class="mt-2 text-2xl font-semibold text-slate-900">${formatScore(overall.uh)}</p>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p class="text-xs uppercase tracking-[0.12em] text-slate-500">Rata PTS</p>
          <p class="mt-2 text-2xl font-semibold text-slate-900">${formatScore(overall.pts)}</p>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p class="text-xs uppercase tracking-[0.12em] text-slate-500">Rata PAS</p>
          <p class="mt-2 text-2xl font-semibold text-slate-900">${formatScore(overall.pas)}</p>
        </div>
        <div class="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
          <p class="text-xs uppercase tracking-[0.12em] text-indigo-600">Rata Total</p>
          <p class="mt-2 text-2xl font-semibold text-indigo-700">${formatScore(overallFinal)}</p>
        </div>
      </section>

      <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="mb-4">
          <h2 class="text-xl font-semibold text-slate-900">Ringkasan Per Mata Pelajaran</h2>
          <p class="mt-1 text-sm text-slate-500">Data bersifat baca-saja, mengikuti nilai yang diinput guru.</p>
        </div>

        <div class="overflow-x-auto rounded-2xl border border-slate-100">
          <table class="min-w-full text-sm text-slate-700">
            <thead class="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th class="px-3 py-3 text-left">Mapel</th>
                <th class="px-3 py-3 text-center">Tugas</th>
                <th class="px-3 py-3 text-center">UH</th>
                <th class="px-3 py-3 text-center">PTS</th>
                <th class="px-3 py-3 text-center">PAS</th>
                <th class="px-3 py-3 text-center">Rata</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows.map((row) => `
                <tr class="border-t border-slate-100">
                  <td class="px-3 py-3 font-medium text-slate-900">${row.mapelNama}</td>
                  <td class="px-3 py-3 text-center">${formatScore(row.tugasAvg)}</td>
                  <td class="px-3 py-3 text-center">${formatScore(row.uhAvg)}</td>
                  <td class="px-3 py-3 text-center">${formatScore(row.ptsAvg)}</td>
                  <td class="px-3 py-3 text-center">${formatScore(row.pasAvg)}</td>
                  <td class="px-3 py-3 text-center font-semibold text-indigo-700">${formatScore(row.finalAvg)}</td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="6" class="px-3 py-10 text-center text-slate-500">Belum ada data nilai untuk periode aktif.</td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </section>

      <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-xl font-semibold text-slate-900">Detail Komponen Nilai</h2>
            <p class="mt-1 text-sm text-slate-500">Daftar nilai tugas, UH, PTS, dan PAS per mapel.</p>
          </div>
          ${view.hasDetails ? '' : `
            <button id="nilai-detail-load" type="button" class="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path></svg>
              <span>Muat rincian</span>
            </button>
          `}
        </div>

        <div class="mb-4 grid gap-3 md:grid-cols-2">
          <div>
            <label class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Filter Mapel</label>
            <select id="nilai-detail-mapel-filter" class="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none">
              <option value="all">Semua Mata Pelajaran</option>
              ${rows.map((row) => `<option value="${row.mapelId}">${row.mapelNama}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Filter Komponen</label>
            <select id="nilai-detail-komponen-filter" class="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none">
              <option value="all">Semua Komponen</option>
              <option value="tugas">Tugas</option>
              <option value="uh">Ulangan Harian</option>
              <option value="pts">PTS</option>
              <option value="pas">PAS</option>
            </select>
          </div>
        </div>

        <div id="nilai-detail-list" class="space-y-4"></div>
      </section>
    </div>
  `);

  container.innerHTML = html;

  const mapelFilterEl = container.querySelector('#nilai-detail-mapel-filter');
  const komponenFilterEl = container.querySelector('#nilai-detail-komponen-filter');
  const detailListEl = container.querySelector('#nilai-detail-list');
  const loadDetailBtn = container.querySelector('#nilai-detail-load');

  function renderFilteredDetails() {
    const selectedMapel = mapelFilterEl?.value || 'all';
    const selectedKomponen = komponenFilterEl?.value || 'all';

    // Rincian belum dimuat (render dari ringkasan). Tampilkan ajakan memuat
    // rincian alih-alih membaca koleksi mentah tanpa diminta.
    if (!view.hasDetails) {
      detailListEl.innerHTML = '<div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">Rincian per komponen belum dimuat. Tekan <b>Muat rincian</b> untuk menampilkannya (menghemat pembacaan data bila tidak dibutuhkan).</div>';
      return;
    }

    const targetRows = rows.filter((row) => selectedMapel === 'all' || row.mapelId === selectedMapel);

    if (!targetRows.length) {
      detailListEl.innerHTML = '<div class="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">Tidak ada data pada filter yang dipilih.</div>';
      return;
    }

    detailListEl.innerHTML = targetRows
      .map((row) => {
        const showTugas = selectedKomponen === 'all' || selectedKomponen === 'tugas';
        const showUh = selectedKomponen === 'all' || selectedKomponen === 'uh';
        const showPts = selectedKomponen === 'all' || selectedKomponen === 'pts';
        const showPas = selectedKomponen === 'all' || selectedKomponen === 'pas';

        return `
          <article class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-sm font-semibold text-slate-900">${row.mapelNama}</h3>
              <span class="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">Rata ${formatScore(row.finalAvg)}</span>
            </div>

            <div class="mt-3 grid gap-3 md:grid-cols-2">
              ${showTugas ? `
                <div class="rounded-xl border border-slate-200 bg-white p-3">
                  <p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Komponen Tugas</p>
                  ${renderDetailItems(row.tugasDetails, 'bg-blue-100 text-blue-700', true)}
                </div>
              ` : ''}

              ${showUh ? `
                <div class="rounded-xl border border-slate-200 bg-white p-3">
                  <p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Komponen Ulangan Harian</p>
                  ${renderDetailItems(row.uhDetails, 'bg-emerald-100 text-emerald-700')}
                </div>
              ` : ''}

              ${showPts ? `
                <div class="rounded-xl border border-slate-200 bg-white p-3">
                  <p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Komponen PTS</p>
                  ${renderDetailItems(row.ptsDetails, 'bg-violet-100 text-violet-700')}
                </div>
              ` : ''}

              ${showPas ? `
                <div class="rounded-xl border border-slate-200 bg-white p-3">
                  <p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Komponen PAS</p>
                  ${renderDetailItems(row.pasDetails, 'bg-amber-100 text-amber-700')}
                </div>
              ` : ''}
            </div>
          </article>
        `;
      })
      .join('');
  }

  // Muat rincian on-demand: baru di sinilah koleksi mentah (nilai_tugas,
  // nilai_ujian, bab, tugas_bab, dst) dibaca. Untuk mayoritas siswa yang hanya
  // melihat ringkasan, pembacaan ini tidak pernah terjadi.
  loadDetailBtn?.addEventListener('click', async () => {
    if (loadDetailBtn.dataset.loading === 'true') return;
    loadDetailBtn.dataset.loading = 'true';
    loadDetailBtn.disabled = true;
    const label = loadDetailBtn.querySelector('span');
    const original = label ? label.textContent : '';
    if (label) label.textContent = 'Memuat...';
    try {
      view = await loadDetailFromRaw();
      ({ rows, overall, overallFinal } = view);
      loadDetailBtn.remove();
      renderFilteredDetails();
    } catch (error) {
      console.warn('Gagal memuat rincian nilai:', error);
      if (label) label.textContent = original || 'Muat rincian';
      loadDetailBtn.dataset.loading = 'false';
      loadDetailBtn.disabled = false;
    }
  });

  mapelFilterEl?.addEventListener('change', renderFilteredDetails);
  komponenFilterEl?.addEventListener('change', renderFilteredDetails);
  renderFilteredDetails();

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
