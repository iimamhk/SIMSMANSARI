import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext, getSessionUserKeys, normalizeUserKey } from '../../utils/helpers.js';
import { getActiveTeachingAssignments, getDocumentsWhere } from '../../firebase/data-service.js';

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

  const [nilaiTugasDocs, nilaiUjianDocs, assignmentDocs, babDocs, tugasDocs, uhColumnsDocs] = await Promise.all([
    studentGradeFilters ? getDocumentsWhere('nilai_tugas', studentGradeFilters) : Promise.resolve([]),
    studentGradeFilters ? getDocumentsWhere('nilai_ujian', studentGradeFilters) : Promise.resolve([]),
    getActiveTeachingAssignments(context),
    getDocumentsWhere('bab', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
    ]),
    getDocumentsWhere('tugas_bab', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
    ]),
    getDocumentsWhere('ulangan_harian_kolom', [
      { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
      { field: 'semester_id', operator: '==', value: context.semester_aktif },
    ]),
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

  const mapelNameMap = new Map(
    assignmentDocs.map((item) => [String(item.mapel_id || ''), item.mapel_nama || item.mapel_id || '-'])
  );

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
      const finalAvg = average([tugasAvg, uhAvg, ptsAvg, pasAvg]);

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
        <div class="mb-4">
          <h2 class="text-xl font-semibold text-slate-900">Detail Komponen Nilai</h2>
          <p class="mt-1 text-sm text-slate-500">Daftar nilai tugas, UH, PTS, dan PAS per mapel.</p>
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

  function renderFilteredDetails() {
    const selectedMapel = mapelFilterEl?.value || 'all';
    const selectedKomponen = komponenFilterEl?.value || 'all';
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

  mapelFilterEl?.addEventListener('change', renderFilteredDetails);
  komponenFilterEl?.addEventListener('change', renderFilteredDetails);
  renderFilteredDetails();

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
