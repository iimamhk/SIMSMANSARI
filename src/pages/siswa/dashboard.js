import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getStoredContext, getSessionUserKeys, normalizeUserKey } from '../../utils/helpers.js';
import { getDocumentsWhere } from '../../firebase/data-service.js';

const ALPA_ALERT_THRESHOLD = 3;

export async function renderSiswaDashboardPage(container) {
  const context = getStoredContext();
  const session = JSON.parse(localStorage.getItem('simguru_session') || '{}');
  const userName = session?.user?.nama || 'Siswa';
  const siswaKeys = getSessionUserKeys(session, context);
  const shortName = userName.split(' ')[0] || 'Siswa';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';

  const absensiDocs = await getDocumentsWhere('absensi', [
    { field: 'tahun_ajaran_id', operator: '==', value: context.tahun_ajaran_aktif },
    { field: 'semester_id', operator: '==', value: context.semester_aktif },
  ]);
  const currentStudentAbsensi = absensiDocs.filter((item) => siswaKeys.includes(normalizeUserKey(item.siswa_id)));
  const totalAlpa = currentStudentAbsensi.filter((item) => item.status === 'A').length;
  const hasAlpaWarning = totalAlpa >= ALPA_ALERT_THRESHOLD;

  const html = renderLayout('Dashboard Siswa', `
    <div class="space-y-6">
      <section class="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <article class="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
          <div class="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl"></div>
          <div class="absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-white/5 blur-2xl"></div>
          <div class="relative space-y-5">
            <p class="text-sm uppercase tracking-[0.24em] text-slate-300">${greeting}, ${shortName}.</p>
            <h1 class="text-3xl font-semibold text-white">Selamat Datang</h1>
            <p class="max-w-xl text-sm text-slate-300">Pantau ringkasan akademik Anda untuk periode aktif ${context.tahun_ajaran_aktif_nama || '-'} / ${context.semester_aktif_nama || '-'}.</p>

            <div class="grid gap-3 sm:grid-cols-2">
              <div class="rounded-[28px] bg-white/10 p-4 backdrop-blur-md">
                <p class="text-xs uppercase tracking-[0.24em] text-slate-300">Waktu Sekarang</p>
                <p id="dashboard-clock" class="mt-3 text-3xl font-semibold text-white">--:--</p>
                <p id="dashboard-date" class="mt-1 text-sm text-slate-200">Memuat tanggal...</p>
              </div>
              <div class="rounded-[28px] bg-white/10 p-4 backdrop-blur-md">
                <p class="text-xs uppercase tracking-[0.24em] text-slate-300">Status Akademik</p>
                <p class="mt-3 text-2xl font-semibold text-white">Aktif</p>
                <p class="mt-2 text-sm text-slate-200">${hasAlpaWarning ? `Perhatian: Alpa Anda ${totalAlpa} kali pada periode ini.` : 'Terus jaga disiplin kehadiran dan semangat belajar.'}</p>
              </div>
            </div>
          </div>
        </article>

        <article class="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-sm text-slate-500">Profil Singkat</p>
              <p class="mt-2 text-2xl font-semibold text-slate-900">Informasi Siswa</p>
            </div>
            <div class="rounded-3xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Siswa</div>
          </div>
          <div class="mt-6 grid gap-3">
            <div class="rounded-3xl bg-slate-50 px-4 py-4 text-sm text-slate-600">Nama: <span class="font-semibold text-slate-900">${userName}</span></div>
            <div class="rounded-3xl bg-slate-50 px-4 py-4 text-sm text-slate-600">Periode aktif: <span class="font-semibold text-slate-900">${context.tahun_ajaran_aktif_nama || '-'} / ${context.semester_aktif_nama || '-'}</span></div>
            <div class="rounded-3xl bg-slate-50 px-4 py-4 text-sm text-slate-600">Gunakan dashboard ini untuk melihat ringkasan informasi belajar Anda.</div>
          </div>
        </article>
      </section>

      <section>
        <div class="mb-4">
          <p class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Menu Cepat</p>
          <h2 class="text-2xl font-semibold text-slate-900">Layanan Siswa</h2>
        </div>

        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <a href="#siswa/nilai" class="group rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            <div class="flex h-14 w-14 items-center justify-center rounded-3xl bg-[#007AFF]/10 text-[#007AFF]">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-7 w-7 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 18.5V9.5M12 18.5V5.5M19 18.5V12.5" />
                <circle cx="5" cy="19" r="1.2" fill="currentColor" stroke="none" />
                <circle cx="12" cy="6" r="1.2" fill="currentColor" stroke="none" />
                <circle cx="19" cy="13" r="1.2" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <p class="mt-4 text-lg font-semibold">Nilai</p>
            <p class="mt-2 text-sm text-slate-500">Lihat ringkasan dan detail komponen nilai per mapel.</p>
          </a>

          <a href="#siswa/absensi" class="group rounded-[28px] border ${hasAlpaWarning ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200 bg-white'} p-5 text-slate-900 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            <div class="flex h-14 w-14 items-center justify-center rounded-3xl bg-[#34C759]/10 text-[#34C759]">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-7 w-7 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="5" width="16" height="15" rx="3" />
                <path d="M8 3.5v3M16 3.5v3M8 12h8M8 16h5" />
              </svg>
            </div>
            <div class="mt-4 flex items-center gap-2">
              <p class="text-lg font-semibold">Absensi</p>
              ${hasAlpaWarning ? '<span class="rounded-full bg-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-700">Peringatan Alpa</span>' : ''}
            </div>
            <p class="mt-2 text-sm text-slate-500">Pantau riwayat kehadiran Anda setiap hari.</p>
          </a>

          <article class="rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900">
            <div class="flex h-14 w-14 items-center justify-center rounded-3xl bg-[#FF9500]/10 text-[#FF9500]">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-7 w-7 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="8" />
                <path d="M12 8v4l2.5 2" />
              </svg>
            </div>
            <p class="mt-4 text-lg font-semibold">Pengingat</p>
            <p class="mt-2 text-sm text-slate-500">${hasAlpaWarning ? `Segera perbaiki kedisiplinan. Jumlah Alpa saat ini: ${totalAlpa}.` : 'Jadwalkan belajar rutin agar target tercapai.'}</p>
          </article>

          <a href="#siswa/pengatur-sistem" class="group rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            <div class="flex h-14 w-14 items-center justify-center rounded-3xl bg-[#5856D6]/10 text-[#5856D6]">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-7 w-7 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
                <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.4a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1-1a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.4a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1-1a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.4a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.6z" />
              </svg>
            </div>
            <p class="mt-4 text-lg font-semibold">Pengaturan Akun</p>
            <p class="mt-2 text-sm text-slate-500">Ubah username dan password akun siswa.</p>
          </a>
        </div>
      </section>
    </div>
  `);

  container.innerHTML = html;

  const updateClock = () => {
    const now = new Date();
    const clockEl = container.querySelector('#dashboard-clock');
    const dateEl = container.querySelector('#dashboard-date');
    if (!clockEl || !dateEl) {
      return;
    }

    clockEl.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    dateEl.textContent = now.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  updateClock();
  if (!container.dashboardClockInterval) {
    container.dashboardClockInterval = setInterval(updateClock, 60000);
  }

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
