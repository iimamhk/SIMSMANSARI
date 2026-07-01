import { loginUser, saveSession, normalizeUsername, normalizePassword } from '../firebase/auth-service.js';
import { getAppConfig } from '../firebase/data-service.js';
import { getStoredContext } from '../utils/helpers.js';

const demoUsers = {
  iimamhk: {
    username: 'iimamhk',
    password: 'iimamhk',
    role: 'admin',
    nama: 'Admin Utama SIMGURU',
  },
  imambudiharto: {
    username: 'imambudiharto',
    password: '123456',
    role: 'guru',
    nama: 'Imam Budiharto, S.Pd.',
  },
  tatimmatulianah: {
    username: 'tatimmatulianah',
    password: '123456',
    role: 'guru',
    nama: 'Tatimmatul Ianah, S.Pd.',
  },
};

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

    <div class="min-h-screen bg-gradient-to-br from-[#10B981] via-[#06B6D4] to-[#0EA5E9] flex items-center justify-center px-4 py-8 relative overflow-hidden">
      <!-- Decorative animated elements -->
      <div class="absolute top-20 right-20 w-72 h-72 bg-white/5 rounded-full blur-3xl float-animation"></div>
      <div class="absolute bottom-20 left-20 w-80 h-80 bg-white/5 rounded-full blur-3xl float-animation" style="animation-delay: 2s;"></div>
      <div class="absolute top-1/2 left-1/3 w-64 h-64 bg-white/5 rounded-full blur-3xl float-animation" style="animation-delay: 4s;"></div>
      
      <div class="relative w-full max-w-md">
        <div class="rounded-3xl bg-white/95 backdrop-blur-sm p-8 shadow-2xl border border-white/20">
          <!-- Header -->
          <div class="mb-8 text-center">
            <div class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-[#10B981] to-[#06B6D4] text-2xl font-bold text-white shadow-lg pulse-glow">
              S
            </div>
            <h1 class="text-3xl font-bold text-slate-900">SIM SMANSARI</h1>
            <p class="mt-2 text-base font-semibold text-emerald-600">SMAN 1 WANASARI</p>
            <p class="mt-3 text-sm text-slate-400">Masuk ke akun Anda</p>
          </div>

          <!-- Form -->
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
        </div>

        <!-- Footer -->
        <p class="text-center mt-6 text-sm text-white/70">© 2024 SIM SMANSARI | SMAN 1 Wanasari</p>
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
    const fallbackUser = demoUsers[normalizedUsername];
    const user = fallbackUser && normalizePassword(fallbackUser.password) === normalizedPassword
      ? fallbackUser
      : await loginUser(username, password);

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
