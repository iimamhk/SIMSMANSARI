import { renderLayout } from '../../layouts/dashboard-layout.js';
import { seedInitialData } from './seed-data.js';

export function renderAdminDashboard(container) {
  const context = JSON.parse(localStorage.getItem('simguru_context') || '{}');
  const html = renderLayout('Dashboard Admin', `
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p class="text-sm text-slate-500">Tahun Ajaran Aktif</p>
        <p class="mt-2 text-xl font-semibold text-slate-900">${context.tahun_ajaran_aktif_nama || 'Belum diatur'}</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p class="text-sm text-slate-500">Semester Aktif</p>
        <p class="mt-2 text-xl font-semibold text-slate-900">${context.semester_aktif_nama || 'Belum diatur'}</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p class="text-sm text-slate-500">Status</p>
        <p class="mt-2 text-xl font-semibold text-slate-900">Siap digunakan</p>
      </div>
    </div>

    <div class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 class="text-lg font-semibold text-slate-900">Seed Data Awal</h3>
      <p class="mt-1 text-sm text-slate-500">Isi data master awal seperti mata pelajaran, kelas, dan akun default.</p>
      <button id="seed-data-btn" class="mt-3 rounded-xl bg-[#007AFF] px-4 py-3 text-sm font-semibold text-white">Semai Data Awal</button>
    </div>

    <div class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 class="text-lg font-semibold text-slate-900">Pengaturan Akun Admin</h3>
      <p class="mt-1 text-sm text-slate-500">Ubah username dan password admin agar akun tetap aman dan mudah dikelola.</p>
      <a href="#admin/pengatur-sistem" class="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
        Buka Pengaturan Akun
      </a>
    </div>
  `);

  container.innerHTML = html;

  container.querySelector('#seed-data-btn')?.addEventListener('click', async () => {
    await seedInitialData();
    alert('Data awal berhasil disemai.');
  });

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
