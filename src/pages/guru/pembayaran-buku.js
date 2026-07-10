import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import { db } from '../../firebase/firebase-config.js';
import {
  saveDocument,
  deleteDocument,
  getDocumentsWhere,
  getTeachingAssignmentsForUser,
  getClassMembers,
} from '../../firebase/data-service.js';

const COLLECTION = {
  items: 'item_pembayaran_buku',
  payments: 'pembayaran_buku',
};
const LS_KEY = {
  items: 'simbuku_items',
  payments: 'simbuku_payments',
};

const TAB_ACTIVE = 'bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-[0_14px_30px_-18px_rgba(244,63,94,0.95)]';
const TAB_IDLE = 'bg-white/80 text-slate-700 hover:bg-white hover:text-slate-900';

function readLocal(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function writeLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function persist(collection, record) {
  if (db) {
    try {
      await saveDocument(COLLECTION[collection], record, record.id);
    } catch (error) {
      console.warn('Gagal menyimpan ke Firestore:', error);
    }
  }
  const arr = readLocal(LS_KEY[collection]);
  const idx = arr.findIndex((item) => item.id === record.id);
  if (idx >= 0) {
    arr[idx] = record;
  } else {
    arr.push(record);
  }
  writeLocal(LS_KEY[collection], arr);
}

async function removeRecord(collection, id) {
  if (db) {
    try {
      await deleteDocument(COLLECTION[collection], id);
    } catch (error) {
      console.warn('Gagal menghapus di Firestore:', error);
    }
  }
  const arr = readLocal(LS_KEY[collection]).filter((item) => item.id !== id);
  writeLocal(LS_KEY[collection], arr);
}

async function loadCollection(collection, userId) {
  let remote = [];
  if (db) {
    try {
      remote = await getDocumentsWhere(COLLECTION[collection], [
        { field: 'guru_id', operator: '==', value: userId },
      ]);
    } catch (error) {
      console.warn('Gagal membaca Firestore:', error);
    }
  }
  const local = readLocal(LS_KEY[collection]);
  if (db) {
    const remoteIds = new Set(remote.map((item) => item.id));
    for (const rec of local) {
      if (rec && rec.id && !remoteIds.has(rec.id)) {
        try {
          await saveDocument(COLLECTION[collection], rec, rec.id);
        } catch (error) {
          console.warn('Gagal sinkron data lokal ke Firestore:', error);
        }
      }
    }
  }
  const merged = new Map();
  [...local, ...remote].forEach((item) => {
    if (item && item.id) {
      merged.set(item.id, { ...merged.get(item.id), ...item });
    }
  });
  return Array.from(merged.values());
}

function formatRupiah(value) {
  const number = Number(value || 0);
  return `Rp ${number.toLocaleString('id-ID')}`;
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatTanggal(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('simguru_session') || '{}');
  } catch {
    return {};
  }
}

export async function renderGuruPembayaranBukuPage(container) {
  const context = getStoredContext();
  const session = getSession();
  const userId = session?.user?.username || context?.user_logged_in || '';
  const guruNama = session?.user?.nama || 'Guru';

  const assignments = userId ? await getTeachingAssignmentsForUser(context, userId) : [];
  const kelasOptions = assignments
    .map((item) => `<option value="${item.kelas_id}">${item.kelas_nama || item.kelas_id}</option>`)
    .join('');

  const html = renderLayout('Pembayaran Buku', `
    <div class="space-y-5">
      <div class="relative overflow-hidden rounded-[28px] border border-amber-100 bg-gradient-to-br from-white via-amber-50 to-rose-50 p-4 shadow-[0_24px_70px_-42px_rgba(244,63,94,0.45)] sm:p-5">
        <div class="absolute -left-10 top-0 h-24 w-24 rounded-full bg-amber-200/50 blur-3xl"></div>
        <div class="absolute bottom-0 right-6 h-20 w-20 rounded-full bg-rose-200/50 blur-3xl"></div>
        <div class="relative">
          <div class="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700 backdrop-blur-sm">
            <span class="inline-block h-2 w-2 rounded-full bg-amber-500"></span>
            Workspace Pembayaran
          </div>
          <h2 class="text-lg font-semibold text-slate-900 sm:text-xl">Pembayaran Buku & Item Siswa</h2>
          <div class="mt-4 md:sticky md:top-4 md:z-20 md:rounded-2xl md:bg-white/70 md:p-1 md:backdrop-blur">
            <div class="grid grid-cols-2 gap-2 rounded-[24px] border border-white/80 bg-white/70 p-1 shadow-[0_14px_32px_-24px_rgba(15,23,42,0.5)] sm:flex sm:flex-wrap sm:rounded-full">
              <button data-tab="item" type="button" class="tab-btn inline-flex w-full items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-semibold transition sm:w-auto ${TAB_ACTIVE}">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4.5h10a2 2 0 0 1 2 2v12.5H8a2 2 0 0 0-2 2V4.5z"/><path d="M8 19h10"/></svg>
                Item
              </button>
              <button data-tab="input" type="button" class="tab-btn inline-flex w-full items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-semibold transition sm:w-auto ${TAB_IDLE}">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3.5v3M16 3.5v3M8 12h8M8 16h5"/></svg>
                Input
              </button>
              <button data-tab="rekap-kelas" type="button" class="tab-btn inline-flex w-full items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-semibold transition sm:w-auto ${TAB_IDLE}">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M8 11h8M8 16h6"/></svg>
                Rekap Kelas
              </button>
              <button data-tab="pemasukan" type="button" class="tab-btn inline-flex w-full items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-semibold transition sm:w-auto ${TAB_IDLE}">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M7 7h7a3 3 0 0 1 0 6H7m0 0h8"/></svg>
                Pemasukan
              </button>
            </div>
          </div>
        </div>
      </div>

      <div id="page-message" class="hidden rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700"></div>

      <section id="tab-item" class="space-y-4">
        <div class="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.24)] sm:p-5">
          <div class="mb-4">
            <h2 class="text-lg font-semibold text-slate-900 sm:text-xl">Tambah Item Pembayaran</h2>
            <p class="mt-1 text-sm text-slate-500">Contoh: LKS Matematika, Buku Paket Bahasa, DLL. Tentukan harga per item.</p>
          </div>
          <div class="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
            <div>
              <label class="text-sm font-medium text-slate-700">Nama Item</label>
              <input id="item-nama" type="text" placeholder="Misal: LKS Matematika" class="mt-1.5 w-full rounded-2xl border border-amber-100 bg-gradient-to-r from-white to-amber-50 px-3.5 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100" />
            </div>
            <div>
              <label class="text-sm font-medium text-slate-700">Harga (Rp)</label>
              <input id="item-harga" type="number" min="0" placeholder="50000" class="mt-1.5 w-full rounded-2xl border border-amber-100 bg-gradient-to-r from-white to-amber-50 px-3.5 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100" />
            </div>
            <button id="add-item-btn" type="button" class="rounded-full bg-gradient-to-r from-amber-500 to-rose-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_30px_-18px_rgba(244,63,94,0.95)] transition hover:-translate-y-0.5 hover:from-amber-600 hover:to-rose-600">Tambah Item</button>
          </div>
        </div>

        <div class="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.24)] sm:p-5">
          <div class="mb-4 flex items-center justify-between gap-3">
            <h3 class="text-base font-semibold text-slate-900">Daftar Item Pembayaran</h3>
            <span id="item-count" class="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">0 item</span>
          </div>
          <div id="item-list" class="space-y-3"></div>
        </div>
      </section>

      <section id="tab-input" class="hidden space-y-4">
        <div class="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.24)] sm:p-5">
          <div class="mb-4">
            <h2 class="text-lg font-semibold text-slate-900 sm:text-xl">Input Pembayaran per Siswa</h2>
            <p class="mt-1 text-sm text-slate-500">Pilih kelas, item, dan tanggal. Tandai siswa yang sudah membayar.</p>
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <div>
              <label class="text-sm font-medium text-slate-700">Kelas</label>
              <select id="input-kelas" class="mt-1.5 w-full rounded-2xl border border-amber-100 bg-gradient-to-r from-white to-amber-50 px-3.5 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100">${kelasOptions || '<option value="">Tidak ada kelas</option>'}</select>
            </div>
            <div>
              <label class="text-sm font-medium text-slate-700">Item Pembayaran</label>
              <select id="input-item" class="mt-1.5 w-full rounded-2xl border border-amber-100 bg-gradient-to-r from-white to-amber-50 px-3.5 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"></select>
            </div>
            <div>
              <label class="text-sm font-medium text-slate-700">Tanggal Pembayaran</label>
              <input id="input-tanggal" type="date" value="${getToday()}" class="mt-1.5 w-full rounded-2xl border border-amber-100 bg-gradient-to-r from-white to-amber-50 px-3.5 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100" />
            </div>
          </div>
        </div>

        <div class="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.24)] sm:p-5">
          <div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="text-sm font-semibold text-slate-800">Daftar Siswa</p>
              <p id="input-summary" class="mt-1 text-xs text-slate-500">Pilih kelas dan item untuk menampilkan siswa.</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button id="mark-all-btn" type="button" class="rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100">Tandai Semua Lunas</button>
              <button id="reset-all-btn" type="button" class="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">Reset</button>
              <button id="save-pay-btn" type="button" class="rounded-full bg-gradient-to-r from-amber-500 to-rose-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_30px_-18px_rgba(244,63,94,0.95)] transition hover:-translate-y-0.5 hover:from-amber-600 hover:to-rose-600">Simpan Pembayaran</button>
            </div>
          </div>
          <ul id="pay-student-list" class="max-w-full space-y-2 text-sm text-slate-600"></ul>
        </div>
      </section>

      <section id="tab-rekap-kelas" class="hidden space-y-4">
        <div class="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.24)] sm:p-5">
          <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 class="text-lg font-semibold text-slate-900 sm:text-xl">Rekap per Kelas</h2>
              <p class="mt-1 text-sm text-slate-500">Ringkasan status pembayaran siswa berdasarkan kelas dan item.</p>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-sm font-medium text-slate-700">Kelas</label>
                <select id="rekap-kelas" class="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100">${kelasOptions || '<option value="">Tidak ada kelas</option>'}</select>
              </div>
              <div>
                <label class="text-sm font-medium text-slate-700">Item Pembayaran</label>
                <select id="rekap-item" class="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"></select>
              </div>
            </div>
          </div>

          <div class="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <div class="rounded-[24px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-3 text-center shadow-sm">
              <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Total Siswa</p>
              <p id="rekap-total-siswa" class="mt-2 text-3xl font-semibold text-slate-900">0</p>
            </div>
            <div class="rounded-[24px] border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-3 text-center shadow-sm">
              <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Lunas</p>
              <p id="rekap-lunas" class="mt-2 text-3xl font-semibold text-slate-900">0</p>
            </div>
            <div class="rounded-[24px] border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-3 text-center shadow-sm">
              <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">Belum Bayar</p>
              <p id="rekap-belum" class="mt-2 text-3xl font-semibold text-slate-900">0</p>
            </div>
            <div class="rounded-[24px] border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-3 text-center shadow-sm">
              <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Pemasukan</p>
              <p id="rekap-pemasukan" class="mt-2 text-2xl font-semibold text-slate-900">Rp 0</p>
            </div>
          </div>

          <div class="mt-4 max-w-full overflow-hidden rounded-[24px] border border-slate-100 bg-gradient-to-b from-white to-slate-50 shadow-inner">
            <div class="max-w-full overflow-x-auto p-3">
              <table class="min-w-full text-sm text-slate-700">
                <thead>
                  <tr class="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.1em] text-slate-500">
                    <th class="px-3 py-2 font-semibold">No</th>
                    <th class="px-3 py-2 font-semibold">Nama Siswa</th>
                    <th class="px-3 py-2 font-semibold">Status</th>
                    <th class="px-3 py-2 font-semibold">Tanggal Bayar</th>
                  </tr>
                </thead>
                <tbody id="rekap-kelas-body"></tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section id="tab-pemasukan" class="hidden space-y-4">
        <div class="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.24)] sm:p-5">
          <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 class="text-lg font-semibold text-slate-900 sm:text-xl">Rekap Pemasukan</h2>
              <p class="mt-1 text-sm text-slate-500">Total pemasukan dari seluruh pembayaran buku & item siswa.</p>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="text-sm font-medium text-slate-700">Filter Kelas</label>
                <select id="pemasukan-kelas" class="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100">
                  <option value="all">Semua Kelas</option>
                  ${kelasOptions}
                </select>
              </div>
              <div>
                <label class="text-sm font-medium text-slate-700">Besar Fee (%)</label>
                <div class="mt-1.5 flex items-center gap-2 rounded-2xl border border-violet-100 bg-gradient-to-r from-white to-violet-50 px-3.5 py-2.5 focus-within:border-violet-300 focus-within:ring-4 focus-within:ring-violet-100">
                  <input id="pemasukan-fee" type="number" min="0" max="100" step="0.1" value="0" class="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none" placeholder="40" />
                  <span class="text-sm font-bold text-violet-500">%</span>
                </div>
              </div>
            </div>
          </div>

          <div class="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <div class="rounded-[24px] border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-3 text-center shadow-sm">
              <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Total Pemasukan</p>
              <p id="pemasukan-total" class="mt-2 text-2xl font-semibold text-slate-900">Rp 0</p>
            </div>
            <div class="rounded-[24px] border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-3 text-center shadow-sm">
              <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">Nilai Fee</p>
              <p id="pemasukan-fee-nilai" class="mt-2 text-2xl font-semibold text-slate-900">Rp 0</p>
            </div>
            <div class="rounded-[24px] border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-3 text-center shadow-sm">
              <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">Jenis Item</p>
              <p id="pemasukan-item" class="mt-2 text-2xl font-semibold text-slate-900">0</p>
            </div>
            <div class="rounded-[24px] border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-3 text-center shadow-sm">
              <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Transaksi Lunas</p>
              <p id="pemasukan-transaksi" class="mt-2 text-2xl font-semibold text-slate-900">0</p>
            </div>
          </div>

          <div class="mt-4 max-w-full overflow-hidden rounded-[24px] border border-slate-100 bg-gradient-to-b from-white to-slate-50 shadow-inner">
            <div class="max-w-full overflow-x-auto p-3">
              <table class="min-w-full text-sm text-slate-700">
                <thead>
                  <tr class="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.1em] text-slate-500">
                    <th class="px-3 py-2 font-semibold">Item</th>
                    <th class="px-3 py-2 font-semibold">Harga</th>
                    <th class="px-3 py-2 font-semibold">Pembeli</th>
                    <th class="px-3 py-2 text-right font-semibold">Pendapatan</th>
                  </tr>
                </thead>
                <tbody id="pemasukan-body"></tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  `);

  container.innerHTML = html;

  const messageEl = container.querySelector('#page-message');
  const tabButtons = Array.from(container.querySelectorAll('.tab-btn'));
  const tabItem = container.querySelector('#tab-item');
  const tabInput = container.querySelector('#tab-input');
  const tabRekapKelas = container.querySelector('#tab-rekap-kelas');
  const tabPemasukan = container.querySelector('#tab-pemasukan');

  const itemNamaInput = container.querySelector('#item-nama');
  const itemHargaInput = container.querySelector('#item-harga');
  const addItemBtn = container.querySelector('#add-item-btn');
  const itemListEl = container.querySelector('#item-list');
  const itemCountEl = container.querySelector('#item-count');

  const inputKelas = container.querySelector('#input-kelas');
  const inputItem = container.querySelector('#input-item');
  const inputTanggal = container.querySelector('#input-tanggal');
  const inputSummary = container.querySelector('#input-summary');
  const markAllBtn = container.querySelector('#mark-all-btn');
  const resetAllBtn = container.querySelector('#reset-all-btn');
  const savePayBtn = container.querySelector('#save-pay-btn');
  const payStudentList = container.querySelector('#pay-student-list');

  const rekapKelas = container.querySelector('#rekap-kelas');
  const rekapItem = container.querySelector('#rekap-item');
  const rekapTotalSiswa = container.querySelector('#rekap-total-siswa');
  const rekapLunas = container.querySelector('#rekap-lunas');
  const rekapBelum = container.querySelector('#rekap-belum');
  const rekapPemasukan = container.querySelector('#rekap-pemasukan');
  const rekapKelasBody = container.querySelector('#rekap-kelas-body');

  const pemasukanKelas = container.querySelector('#pemasukan-kelas');
  const pemasukanFee = container.querySelector('#pemasukan-fee');
  const pemasukanFeeNilai = container.querySelector('#pemasukan-fee-nilai');
  const pemasukanTotal = container.querySelector('#pemasukan-total');
  const pemasukanItem = container.querySelector('#pemasukan-item');
  const pemasukanTransaksi = container.querySelector('#pemasukan-transaksi');
  const pemasukanBody = container.querySelector('#pemasukan-body');

  const FEE_KEY = 'simbuku_fee';
  function getFeePersen() {
    const val = Number(pemasukanFee?.value || localStorage.getItem(FEE_KEY) || 0);
    return isNaN(val) || val < 0 ? 0 : Math.min(val, 100);
  }

  let allItems = [];
  let allPayments = [];
  let paidMap = {};
  let currentMembers = [];
  let editingItemId = null;

  function showMessage(text, isError = false) {
    if (!messageEl) return;
    messageEl.textContent = text;
    messageEl.className = `rounded-2xl border px-4 py-3 text-sm font-medium ${isError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`;
    messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    clearTimeout(showMessage._t);
    showMessage._t = setTimeout(() => {
      messageEl.className = 'hidden rounded-2xl border px-4 py-3 text-sm font-medium';
    }, 3500);
  }

  function setTab(target) {
    const tabs = { item: tabItem, input: tabInput, 'rekap-kelas': tabRekapKelas, pemasukan: tabPemasukan };
    Object.entries(tabs).forEach(([key, el]) => el?.classList.toggle('hidden', key !== target));
    tabButtons.forEach((btn) => {
      const active = btn.getAttribute('data-tab') === target;
      btn.className = `tab-btn inline-flex w-full items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-semibold transition sm:w-auto ${active ? TAB_ACTIVE : TAB_IDLE}`;
    });
    if (target === 'rekap-kelas') renderRekapKelas();
    if (target === 'pemasukan') renderPemasukan();
  }

  function fillItemOptions(selectEl) {
    if (!selectEl) return;
    if (!allItems.length) {
      selectEl.innerHTML = '<option value="">Belum ada item</option>';
      return;
    }
    selectEl.innerHTML = allItems
      .map((item) => `<option value="${item.id}">${item.nama} • ${formatRupiah(item.harga)}</option>`)
      .join('');
  }

  function renderItemList() {
    if (itemCountEl) itemCountEl.textContent = `${allItems.length} item`;
    if (!itemListEl) return;
    if (!allItems.length) {
      itemListEl.innerHTML = '<div class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">Belum ada item pembayaran. Tambahkan item seperti "LKS Matematika" di atas.</div>';
      return;
    }
    itemListEl.innerHTML = allItems
      .map((item, index) => `
        <div class="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-rose-500 text-white shadow-sm">
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4.5h10a2 2 0 0 1 2 2v12.5H8a2 2 0 0 0-2 2V4.5z"/><path d="M8 19h10"/></svg>
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-slate-900">${index + 1}. ${item.nama}</p>
            <p class="text-xs text-slate-500">Harga per item</p>
          </div>
          <div class="rounded-full bg-amber-50 px-3 py-1 text-sm font-bold text-amber-700">${formatRupiah(item.harga)}</div>
          <div class="flex items-center gap-2">
            <button type="button" data-edit-item="${item.id}" class="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">Edit</button>
            <button type="button" data-delete-item="${item.id}" class="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100">Hapus</button>
          </div>
        </div>
      `)
      .join('');
  }

  async function loadData() {
    allItems = await loadCollection('items', userId);
    allPayments = await loadCollection('payments', userId);
    renderItemList();
    fillItemOptions(inputItem);
    fillItemOptions(rekapItem);
    renderInputStudents();
  }

  function getItemById(id) {
    return allItems.find((item) => item.id === id) || null;
  }

  async function addOrUpdateItem() {
    const nama = itemNamaInput.value.trim();
    const harga = Number(itemHargaInput.value || 0);
    if (!nama) {
      showMessage('Nama item tidak boleh kosong.', true);
      return;
    }
    if (!harga || harga <= 0) {
      showMessage('Harga harus lebih dari 0.', true);
      return;
    }
    if (editingItemId) {
      const existing = getItemById(editingItemId);
      await persist('items', {
        ...existing,
        id: editingItemId,
        nama,
        harga,
        guru_id: userId,
        guru_nama: guruNama,
        tahun_ajaran_id: context.tahun_ajaran_aktif,
        semester_id: context.semester_aktif,
        updated_at: new Date().toISOString(),
      });
      showMessage(`Item "${nama}" berhasil diperbarui.`);
    } else {
      await persist('items', {
        id: makeId('item'),
        nama,
        harga,
        guru_id: userId,
        guru_nama: guruNama,
        tahun_ajaran_id: context.tahun_ajaran_aktif,
        semester_id: context.semester_aktif,
        created_at: new Date().toISOString(),
      });
      showMessage(`Item "${nama}" berhasil ditambahkan.`);
    }
    itemNamaInput.value = '';
    itemHargaInput.value = '';
    editingItemId = null;
    addItemBtn.textContent = 'Tambah Item';
    await loadData();
  }

  async function deleteItem(id) {
    const item = getItemById(id);
    if (!item) return;
    if (!confirm(`Hapus item "${item.nama}"? Data pembayaran terkait akan ikut dihapus.`)) return;
    const related = allPayments.filter((pay) => pay.item_id === id).map((pay) => pay.id);
    for (const pid of related) await removeRecord('payments', pid);
    await removeRecord('items', id);
    showMessage(`Item "${item.nama}" dihapus.`);
    await loadData();
  }

  function startEditItem(id) {
    const item = getItemById(id);
    if (!item) return;
    editingItemId = id;
    itemNamaInput.value = item.nama;
    itemHargaInput.value = item.harga;
    addItemBtn.textContent = 'Perbarui Item';
    itemNamaInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function paymentKey(itemId, kelasId, siswaId) {
    return `${itemId}__${kelasId}__${siswaId}`;
  }

  function getExistingPayment(itemId, kelasId, siswaId) {
    return allPayments.find(
      (pay) => pay.item_id === itemId && pay.kelas_id === kelasId && pay.siswa_id === siswaId
    );
  }

  async function renderInputStudents() {
    if (!payStudentList) return;
    const kelasId = inputKelas.value;
    const itemId = inputItem.value;
    if (!kelasId || !itemId) {
      payStudentList.innerHTML = '<li class="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">Pilih kelas dan item pembayaran terlebih dahulu.</li>';
      inputSummary.textContent = 'Pilih kelas dan item untuk menampilkan siswa.';
      return;
    }
    const kelasNama = inputKelas.options[inputKelas.selectedIndex]?.text || kelasId;
    currentMembers = await getClassMembers(context, kelasId);
    paidMap = {};
    allPayments
      .filter((pay) => pay.item_id === itemId && pay.kelas_id === kelasId && pay.lunas)
      .forEach((pay) => {
        paidMap[pay.siswa_id] = pay.tanggal_bayar || inputTanggal.value;
      });

    const sorted = [...currentMembers].sort((a, b) =>
      (a.siswa_nama || '').toLowerCase().localeCompare((b.siswa_nama || '').toLowerCase())
    );

    if (!sorted.length) {
      payStudentList.innerHTML = '<li class="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">Belum ada siswa pada kelas ini.</li>';
      inputSummary.textContent = 'Tidak ada siswa di kelas ini.';
      return;
    }

    payStudentList.innerHTML = sorted
      .map((member, index) => {
        const sid = member.siswa_id || member.id;
        const paid = Boolean(paidMap[sid]);
        return `
          <li class="max-w-full rounded-[22px] border border-slate-200/80 bg-white px-3.5 py-3 shadow-sm transition hover:border-amber-200">
            <div class="flex items-center justify-between gap-3">
              <div class="flex min-w-0 items-center gap-3">
                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-rose-500 text-xs font-bold text-white">${index + 1}</div>
                <p class="truncate text-sm font-semibold text-slate-900">${member.siswa_nama || member.nama || '-'}</p>
              </div>
              <div class="flex items-center gap-2">
                <span class="pay-status text-xs font-semibold ${paid ? 'text-emerald-600' : 'text-slate-400'}">${paid ? 'Lunas' : 'Belum'}</span>
                <button type="button" data-pay-toggle="${sid}" aria-pressed="${paid}" class="pay-toggle relative inline-flex h-7 w-12 items-center rounded-full transition ${paid ? 'bg-emerald-500' : 'bg-slate-300'}">
                  <span class="inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${paid ? 'translate-x-6' : 'translate-x-1'}"></span>
                </button>
              </div>
            </div>
            <p class="pay-date mt-1 pl-12 text-[11px] text-slate-400">${paid ? 'Dibayar: ' + formatTanggal(paidMap[sid]) : 'Belum membayar'}</p>
          </li>
        `;
      })
      .join('');

    const lunasCount = Object.values(paidMap).filter(Boolean).length;
    inputSummary.textContent = `${sorted.length} siswa • ${lunasCount} sudah lunas • ${sorted.length - lunasCount} belum bayar.`;
  }

  function togglePay(siswaId) {
    if (paidMap[siswaId]) {
      paidMap[siswaId] = null;
    } else {
      paidMap[siswaId] = inputTanggal.value;
    }
    const btn = payStudentList.querySelector(`[data-pay-toggle="${siswaId}"]`);
    if (!btn) return;
    const paid = Boolean(paidMap[siswaId]);
    btn.setAttribute('aria-pressed', String(paid));
    btn.className = `pay-toggle relative inline-flex h-7 w-12 items-center rounded-full transition ${paid ? 'bg-emerald-500' : 'bg-slate-300'}`;
    const knob = btn.querySelector('span');
    knob.className = `inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${paid ? 'translate-x-6' : 'translate-x-1'}`;
    const row = btn.closest('li');
    const status = row.querySelector('.pay-status');
    const dateLine = row.querySelector('.pay-date');
    status.textContent = paid ? 'Lunas' : 'Belum';
    status.className = `pay-status text-xs font-semibold ${paid ? 'text-emerald-600' : 'text-slate-400'}`;
    dateLine.textContent = paid ? 'Dibayar: ' + formatTanggal(paidMap[siswaId]) : 'Belum membayar';
  }

  function markAll() {
    const itemId = inputItem.value;
    if (!itemId) return;
    currentMembers.forEach((member) => {
      const sid = member.siswa_id || member.id;
      paidMap[sid] = inputTanggal.value;
    });
    renderInputStudents();
  }

  function resetAll() {
    paidMap = {};
    renderInputStudents();
  }

  async function savePayments() {
    const kelasId = inputKelas.value;
    const itemId = inputItem.value;
    const tanggal = inputTanggal.value;
    const item = getItemById(itemId);
    if (!kelasId || !itemId || !item) {
      showMessage('Pilih kelas dan item pembayaran terlebih dahulu.', true);
      return;
    }
    const kelasNama = inputKelas.options[inputKelas.selectedIndex]?.text || kelasId;
    const members = [...currentMembers];
    let updated = 0;
    for (const member of members) {
      const sid = member.siswa_id || member.id;
      const sname = member.siswa_nama || member.nama || '-';
      const isPaid = Boolean(paidMap[sid]);
      const existing = getExistingPayment(itemId, kelasId, sid);
      if (isPaid) {
        await persist('payments', {
          id: paymentKey(itemId, kelasId, sid),
          item_id: itemId,
          item_nama: item.nama,
          harga: item.harga,
          kelas_id: kelasId,
          kelas_nama: kelasNama,
          siswa_id: sid,
          siswa_nama: sname,
          lunas: true,
          tanggal_bayar: paidMap[sid],
          guru_id: userId,
          guru_nama: guruNama,
          tahun_ajaran_id: context.tahun_ajaran_aktif,
          semester_id: context.semester_aktif,
          updated_at: new Date().toISOString(),
        });
        updated += 1;
      } else if (existing) {
        await removeRecord('payments', existing.id);
      }
    }
    await loadData();
    showMessage(`Pembayaran tersimpan. ${updated} siswa lunas untuk "${item.nama}".`);
  }

  function renderRekapKelas() {
    const kelasId = rekapKelas.value;
    const itemId = rekapItem.value;
    const item = getItemById(itemId);
    if (!rekapKelasBody) return;
    if (!kelasId || !itemId || !item) {
      rekapKelasBody.innerHTML = '<tr><td colspan="4" class="px-3 py-6 text-center text-sm text-slate-500">Pilih kelas dan item untuk melihat rekap.</td></tr>';
      rekapTotalSiswa.textContent = '0';
      rekapLunas.textContent = '0';
      rekapBelum.textContent = '0';
      rekapPemasukan.textContent = 'Rp 0';
      return;
    }
    const kelasNama = rekapKelas.options[rekapKelas.selectedIndex]?.text || kelasId;
    (async () => {
      const members = await getClassMembers(context, kelasId);
      const paidSet = new Map();
      allPayments
        .filter((pay) => pay.item_id === itemId && pay.kelas_id === kelasId && pay.lunas)
        .forEach((pay) => paidSet.set(pay.siswa_id, pay.tanggal_bayar));

      const sorted = [...members].sort((a, b) =>
        (a.siswa_nama || '').toLowerCase().localeCompare((b.siswa_nama || '').toLowerCase())
      );
      const lunas = sorted.filter((m) => paidSet.has(m.siswa_id || m.id)).length;
      const belum = sorted.length - lunas;

      rekapTotalSiswa.textContent = String(sorted.length);
      rekapLunas.textContent = String(lunas);
      rekapBelum.textContent = String(belum);
      rekapPemasukan.textContent = formatRupiah(lunas * item.harga);

      if (!sorted.length) {
        rekapKelasBody.innerHTML = '<tr><td colspan="4" class="px-3 py-6 text-center text-sm text-slate-500">Tidak ada siswa di kelas ini.</td></tr>';
        return;
      }

      rekapKelasBody.innerHTML = sorted
        .map((member, index) => {
          const sid = member.siswa_id || member.id;
          const paid = paidSet.has(sid);
          const tgl = paidSet.get(sid);
          return `
            <tr class="border-b border-slate-100 text-sm transition hover:bg-amber-50/50">
              <td class="px-3 py-2.5 font-medium text-slate-700">${index + 1}</td>
              <td class="px-3 py-2.5 font-semibold text-slate-900">${member.siswa_nama || member.nama || '-'}</td>
              <td class="px-3 py-2.5">
                <span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${paid ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">${paid ? 'Lunas' : 'Belum Bayar'}</span>
              </td>
              <td class="px-3 py-2.5 text-slate-600">${paid ? formatTanggal(tgl) : '-'}</td>
            </tr>
          `;
        })
        .join('');
    })();
  }

  function renderPemasukan() {
    const kelasFilter = pemasukanKelas?.value || 'all';
    const filtered = allPayments.filter((pay) => pay.lunas && (kelasFilter === 'all' || pay.kelas_id === kelasFilter));

    const byItem = new Map();
    filtered.forEach((pay) => {
      if (!byItem.has(pay.item_id)) {
        byItem.set(pay.item_id, { item: pay.item_nama, harga: pay.harga, pembeli: 0, pendapatan: 0 });
      }
      const entry = byItem.get(pay.item_id);
      entry.pembeli += 1;
      entry.pendapatan += Number(pay.harga || 0);
    });

    const totalPemasukan = filtered.reduce((sum, pay) => sum + Number(pay.harga || 0), 0);
    const feePersen = getFeePersen();
    const nilaiFee = Math.round(totalPemasukan * (feePersen / 100));

    if (pemasukanTotal) pemasukanTotal.textContent = formatRupiah(totalPemasukan);
    if (pemasukanFeeNilai) pemasukanFeeNilai.textContent = formatRupiah(nilaiFee);
    if (pemasukanItem) pemasukanItem.textContent = String(byItem.size);
    if (pemasukanTransaksi) pemasukanTransaksi.textContent = String(filtered.length);

    if (!pemasukanBody) return;
    if (!byItem.size) {
      pemasukanBody.innerHTML = '<tr><td colspan="4" class="px-3 py-6 text-center text-sm text-slate-500">Belum ada pemasukan tercatat.</td></tr>';
      return;
    }

    pemasukanBody.innerHTML = Array.from(byItem.values())
      .sort((a, b) => b.pendapatan - a.pendapatan)
      .map((row) => `
        <tr class="border-b border-slate-100 text-sm transition hover:bg-amber-50/50">
          <td class="px-3 py-2.5 font-semibold text-slate-900">${row.item}</td>
          <td class="px-3 py-2.5 text-slate-600">${formatRupiah(row.harga)}</td>
          <td class="px-3 py-2.5 font-medium text-slate-700">${row.pembeli}</td>
          <td class="px-3 py-2.5 text-right font-bold text-amber-700">${formatRupiah(row.pendapatan)}</td>
        </tr>
      `)
      .join('');
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => setTab(btn.getAttribute('data-tab')));
  });

  addItemBtn?.addEventListener('click', addOrUpdateItem);
  itemListEl?.addEventListener('click', (e) => {
    const editId = e.target.getAttribute('data-edit-item');
    const deleteId = e.target.getAttribute('data-delete-item');
    if (editId) startEditItem(editId);
    if (deleteId) deleteItem(deleteId);
  });

  inputKelas?.addEventListener('change', renderInputStudents);
  inputItem?.addEventListener('change', renderInputStudents);
  markAllBtn?.addEventListener('click', markAll);
  resetAllBtn?.addEventListener('click', resetAll);
  savePayBtn?.addEventListener('click', savePayments);
  payStudentList?.addEventListener('click', (e) => {
    const sid = e.target.closest('.pay-toggle')?.getAttribute('data-pay-toggle');
    if (sid) togglePay(sid);
  });

  rekapKelas?.addEventListener('change', renderRekapKelas);
  rekapItem?.addEventListener('change', renderRekapKelas);
  pemasukanKelas?.addEventListener('change', renderPemasukan);
  pemasukanFee?.addEventListener('input', () => {
    const val = getFeePersen();
    localStorage.setItem(FEE_KEY, String(val));
    renderPemasukan();
  });

  if (pemasukanFee) {
    const savedFee = localStorage.getItem(FEE_KEY);
    if (savedFee !== null) pemasukanFee.value = savedFee;
  }
  await loadData();
}
