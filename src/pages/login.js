import { loginUser, saveSession, normalizeUsername, normalizePassword } from '../firebase/auth-service.js';
import { getAppConfig, getDocumentsWhere } from '../firebase/data-service.js';
import { getStoredContext } from '../utils/helpers.js';

function buildContext(user, baseContext) {
  return {
    ...baseContext,
    user_logged_in: user.username,
    role: user.role,
    nama_lengkap: user.nama,
    updated_at: new Date().toISOString(),
  };
}

export function renderLoginPage(container) {
  const html = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

      .login-page {
        font-family: 'Plus Jakarta Sans', sans-serif;
      }

      @keyframes float {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-20px); }
      }
      @keyframes pulse-glow {
        0%, 100% { opacity: 0.8; }
        50% { opacity: 1; }
      }
      .float-animation {
        animation: float 6s ease-in-out infinite;
      }
      .pulse-glow {
        animation: pulse-glow 3s ease-in-out infinite;
      }
    </style>

    <div class="login-page min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.45),_transparent_36%),linear-gradient(145deg,_#10b981_0%,_#5eead4_28%,_#67e8f9_56%,_#93c5fd_76%,_#c4b5fd_100%)] flex items-center justify-center px-4 py-8 relative overflow-hidden">
      <div class="absolute top-20 right-20 w-72 h-72 bg-white/5 rounded-full blur-3xl float-animation"></div>
      <div class="absolute bottom-20 left-20 w-80 h-80 bg-white/5 rounded-full blur-3xl float-animation" style="animation-delay: 2s;"></div>
      <div class="absolute top-1/2 left-1/3 w-64 h-64 bg-white/5 rounded-full blur-3xl float-animation" style="animation-delay: 4s;"></div>
      
      <div class="relative grid w-full max-w-6xl gap-6 lg:grid-cols-[1fr_440px] lg:items-center">
        <div class="rounded-[34px] border border-white/30 bg-white/32 p-6 text-white shadow-[0_22px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:p-8 lg:p-10">
          <p class="text-xs font-bold uppercase tracking-[0.34em] text-white/90">Akses Sistem</p>
          <h1 class="mt-4 max-w-2xl text-4xl font-extrabold tracking-tight text-white sm:text-5xl">Masuk ke ruang kerja digital SIM SMANSARI.</h1>
          <p class="mt-5 max-w-2xl text-sm leading-7 text-white/90 sm:text-base">Silakan masuk menggunakan akun admin, guru, atau siswa.</p>
          <div class="mt-8 flex flex-wrap gap-3 text-sm font-semibold text-white/85">
            <span class="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-white">Akses Cepat</span>
            <span class="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-white">Login Terpusat</span>
          </div>
          <a href="#home" class="mt-8 inline-flex items-center justify-center rounded-2xl border border-white/20 bg-white/12 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/18">Kembali ke Lobby Publik</a>
        </div>

        <div class="rounded-[34px] bg-white/95 backdrop-blur-sm p-8 shadow-[0_24px_90px_rgba(15,23,42,0.18)] border border-white/25">
          <div class="mb-8 text-center">
            <div class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-[#10B981] to-[#06B6D4] text-2xl font-bold text-white shadow-lg pulse-glow">
              S
            </div>
            <h1 class="text-3xl font-bold text-slate-900">SIM SMANSARI</h1>
            <p class="mt-2 text-base font-semibold text-slate-700">SMAN 1 WANASARI</p>
            <p class="mt-3 text-sm text-slate-500">Masuk ke akun Anda</p>
          </div>

          <form id="login-form" class="space-y-4">
            <div class="relative">
              <input id="username" name="username" class="w-full rounded-2xl border-2 border-slate-200 bg-slate-50/50 px-5 py-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30" placeholder="Username" required />
            </div>

            <div class="relative">
              <input id="password" name="password" type="password" class="w-full rounded-2xl border-2 border-slate-200 bg-slate-50/50 px-5 py-3 pr-12 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30" placeholder="Password" required />
              <button type="button" id="toggle-password" class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-emerald-600 transition">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                </svg>
              </button>
            </div>

            <button id="login-btn" type="submit" class="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:shadow-xl hover:scale-105 active:scale-95 duration-200">
              <span id="btn-text">Masuk</span>
              <span id="btn-loader" class="hidden">⏳</span>
            </button>
          </form>

          <div class="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left text-sm text-slate-600">
            Setelah login, Anda akan diarahkan ke dashboard sesuai peran.
          </div>
        </div>

          <p class="text-center text-sm text-white/75 lg:col-span-2">© 2026 SIM SMANSARI | SMAN 1 Wanasari | ihk</p>
      </div>
    </div>
  `;

  container.innerHTML = html;

  const form = container.querySelector('#login-form');
  const togglePasswordBtn = container.querySelector('#toggle-password');
  const passwordInput = container.querySelector('#password');
  const loginBtn = container.querySelector('#login-btn');
  const btnText = container.querySelector('#btn-text');
  const btnLoader = container.querySelector('#btn-loader');

  // Toggle password visibility
  togglePasswordBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    
    loginBtn.disabled = true;
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');

    const username = container.querySelector('#username').value.trim();
    const password = container.querySelector('#password').value.trim();
    const normalizedUsername = normalizeUsername(username);
    const normalizedPassword = normalizePassword(password);
    const user = await loginUser(normalizedUsername, normalizedPassword);

    if (!user) {
      alert('Username atau password salah.');
      loginBtn.disabled = false;
      btnText.classList.remove('hidden');
      btnLoader.classList.add('hidden');
      return;
    }

    const baseContext = getStoredContext();
    const appConfig = await getAppConfig();
    const activeContext = {
      ...baseContext,
      ...(appConfig?.tahun_ajaran_aktif ? {
        tahun_ajaran_aktif: appConfig.tahun_ajaran_aktif,
        tahun_ajaran_aktif_nama: appConfig.tahun_ajaran_aktif_nama,
        semester_aktif: appConfig.semester_aktif,
        semester_aktif_nama: appConfig.semester_aktif_nama,
      } : {}),
    };
    const context = buildContext(user, activeContext);

    await saveSession(user, context);
    if (user.role === 'admin') {
      window.location.hash = '#admin/dashboard';
      return;
    }

    if (user.role === 'guru') {
      try {
        const waliRelations = await getDocumentsWhere('wali_kelas', [
          { field: 'guru_id', value: user.username },
          { field: 'tahun_ajaran_id', value: activeContext.tahun_ajaran_aktif },
          { field: 'semester_id', value: activeContext.semester_aktif },
        ]);
        localStorage.setItem('simguru_wali', JSON.stringify(waliRelations[0] || null));
      } catch {
        try {
          localStorage.removeItem('simguru_wali');
        } catch {}
      }
      window.location.hash = '#guru/dashboard';
      return;
    }

    if (user.role === 'siswa') {
      window.location.hash = '#siswa/dashboard';
      return;
    }

    window.location.hash = '#login';
  });
}
