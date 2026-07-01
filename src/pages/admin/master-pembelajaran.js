import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import { getCollectionDocs } from '../../firebase/data-service.js';

export async function renderMasterPembelajaranPage(container) {
  const context = getStoredContext();
  const pembelajaranList = (await getCollectionDocs('pembelajaran'))
    .filter((item) => !context?.tahun_ajaran_aktif || item.tahun_ajaran_id === context.tahun_ajaran_aktif)
    .sort((a, b) => String(a.kelas_nama || '').localeCompare(String(b.kelas_nama || ''), 'id', { sensitivity: 'base' }));

  const html = renderLayout('Master Pembelajaran', `
    <div class="space-y-5">
      <div class="rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-sm">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-2xl">
            <p class="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">Kelas Belajar</p>
            <h3 class="mt-2 text-2xl font-semibold">Master Pembelajaran</h3>
            <p class="mt-2 text-sm text-slate-300">Menyatukan hasil plotting jadwal menjadi kelas pembelajaran lengkap dengan guru, mapel, kelas, dan daftar siswa.</p>
          </div>
          <div class="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
            <p class="text-xs uppercase tracking-[0.2em] text-slate-300">Total Kelas</p>
            <p class="mt-1 text-xl font-semibold">${pembelajaranList.length}</p>
          </div>
        </div>
      </div>

      ${pembelajaranList.length ? `
        <div class="space-y-3">
          ${pembelajaranList.map((item) => {
            const students = Array.isArray(item.siswa) ? item.siswa : [];
            return `
              <div class="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p class="text-sm font-semibold text-[#007AFF]">${item.kelas_nama || item.kelas_id || '-'}</p>
                    <h4 class="mt-1 text-lg font-semibold text-slate-900">${item.mapel_nama || item.mapel_id || '-'}</h4>
                    <p class="mt-1 text-sm text-slate-500">Pengajar: ${item.guru_nama || item.guru_id || '-'}</p>
                  </div>
                  <div class="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    <span class="font-semibold text-slate-800">${students.length}</span> siswa terdaftar
                  </div>
                </div>

                <div class="mt-4 grid gap-3 md:grid-cols-2">
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Detail Kelas</p>
                    <p class="mt-2 text-sm text-slate-700">Mata pelajaran: <span class="font-semibold">${item.mapel_nama || '-'}</span></p>
                    <p class="mt-1 text-sm text-slate-700">Kelas: <span class="font-semibold">${item.kelas_nama || '-'}</span></p>
                    <p class="mt-1 text-sm text-slate-700">Hari/Jam: <span class="font-semibold">${item.hari || '-'} / ${item.jam_ke || '-'}</span></p>
                  </div>
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Daftar Siswa</p>
                    <ul class="mt-2 space-y-1 text-sm text-slate-700">
                      ${students.length ? students.map((student) => `<li>• ${student.siswa_nama || student.nama || '-'}</li>`).join('') : '<li>• Belum ada siswa terdaftar.</li>'}
                    </ul>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div class="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
          Belum ada data kelas pembelajaran. Silakan buat plotting jadwal terlebih dahulu.
        </div>
      `}
    </div>
  `);

  container.innerHTML = html;

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
