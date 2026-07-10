import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext } from '../../utils/helpers.js';
import { getDocumentsWhere } from '../../firebase/data-service.js';

function setWaliCache(wali) {
  try {
    localStorage.setItem('simguru_wali', JSON.stringify(wali || null));
  } catch {
    // ignore storage errors
  }
}

export async function renderGuruWaliKelasPage(container) {
  const context = getStoredContext();
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const guruId = session?.user?.username || '';
  const guruNama = session?.user?.nama || '';

  const relations = guruId
    ? await getDocumentsWhere('wali_kelas', [
        { field: 'guru_id', value: guruId },
        { field: 'tahun_ajaran_id', value: context.tahun_ajaran_aktif },
        { field: 'semester_id', value: context.semester_aktif },
      ])
    : [];
  const wali = relations[0] || null;
  setWaliCache(wali);

  const logoutHandler = () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  };

  if (!wali) {
    const html = renderLayout('Wali Kelas', `
      <div class="space-y-5">
        <div class="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <svg viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="3.5" y="5" width="17" height="11" rx="2" stroke="currentColor" stroke-width="1.8"/>
              <path d="M8 20h8M12 16v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </div>
          <h3 class="text-base font-semibold text-slate-900">Belum Menjadi Wali Kelas</h3>
          <p class="mt-1 text-sm text-slate-500">Anda belum ditunjuk sebagai wali kelas untuk periode ${context.tahun_ajaran_aktif_nama || ''} / ${context.semester_aktif_nama || ''}. Hubungi admin untuk menetapkan relasi wali kelas.</p>
        </div>
      </div>
    `);
    container.innerHTML = html;
    container.querySelector('#logout-btn')?.addEventListener('click', logoutHandler);
    return;
  }

  const iconKas = `<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="13" rx="3" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12.5" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M6.5 6.5V5.5a1.5 1.5 0 0 1 1.5-1.5h8a1.5 1.5 0 0 1 1.5 1.5v1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  const iconJurnal = `<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 4.5h10a2 2 0 0 1 2 2v12.5H8a2 2 0 0 0-2 2V4.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 19h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M17.5 4l.7 1.9L20 6.5l-1.8.6-.7 1.9-.7-1.9-1.8-.6 1.8-.6.7-1.9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

  const modules = [
    {
      title: 'Uang Kas',
      desc: 'Pengelolaan kas kelas dan catatan iuran siswa.',
      icon: iconKas,
      href: '#guru/kas-kelas',
      badge: 'Buka',
    },
    {
      title: 'Jurnal Kelas',
      desc: 'Jurnal kegiatan dan perkembangan kelas.',
      icon: iconJurnal,
      href: '#guru/wali-kelas',
      badge: 'Segera',
    },
  ];

  const html = renderLayout(`Wali Kelas ${wali.kelas_nama}`, `
    <div class="space-y-5">
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Wali Kelas</p>
        <h3 class="mt-1 text-xl font-bold text-slate-900">Kelas ${wali.kelas_nama}</h3>
        <p class="mt-1 text-sm text-slate-500">${guruNama}</p>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        ${modules
          .map(
            (m) => `
          <a href="${m.href}" class="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300">
            <div class="flex items-center justify-between">
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-[#4F46E5]">${m.icon}</div>
              <span class="rounded-full ${m.badge === 'Segera' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-emerald-600'} px-2 py-0.5 text-[10px] font-semibold">${m.badge}</span>
            </div>
            <h4 class="mt-3 text-sm font-semibold text-slate-900">${m.title}</h4>
            <p class="mt-1 text-xs text-slate-500">${m.desc}</p>
          </a>
        `
          )
          .join('')}
      </div>
    </div>
  `);

  container.innerHTML = html;
  container.querySelector('#logout-btn')?.addEventListener('click', logoutHandler);
}
