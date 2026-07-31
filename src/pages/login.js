import { loginUser, saveSession, normalizeUsername, normalizePassword, getEmergencyLocalUser } from '../firebase/auth-service.js';
import { getAppConfig, getDocumentsWhere } from '../firebase/data-service.js';
import { getStoredContext } from '../utils/helpers.js';
import { getLobbySettings } from '../utils/lobby.js';

function buildContext(user, baseContext) {
  return {
    ...baseContext,
    user_logged_in: user.username,
    role: user.role,
    nama_lengkap: user.nama,
    updated_at: new Date().toISOString(),
  };
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function monogram(name) {
  const words = String(name || 'SIM SMANSARI').trim().split(/\s+/).filter(Boolean);
  const letters = words.length >= 2 ? words[0][0] + words[1][0] : (words[0] || 'S').slice(0, 2);
  return letters.toUpperCase();
}

export async function renderLoginPage(container) {
  // Branding dinamis dari admin (nama sekolah, brand, logo). Non-fatal bila gagal.
  let settings = {};
  try {
    settings = await getLobbySettings();
  } catch {
    settings = {};
  }
  const brandTitle = settings.hero_title || 'SIMSMANSARI';
  const schoolName = settings.school_name || 'SMA Negeri 1 Wanasari';
  // Logo login: pakai logo khusus login bila diisi, jika tidak pakai logo lobi.
  const logoUrl = settings.login_logo_url || settings.logo_url || '';
  const loginTitle = settings.login_title || 'Selamat datang kembali';
  const loginSubtitle = settings.login_subtitle || 'Masuk dengan akun admin, guru, atau siswa Anda.';
  const logoMark = logoUrl
    ? `<img src="${esc(logoUrl)}" alt="Logo ${esc(schoolName)}" class="h-14 w-14 rounded-2xl object-cover shadow-[0_12px_28px_-12px_rgba(37,99,235,.8)]" loading="eager" decoding="async" />`
    : `<span class="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white shadow-[0_12px_28px_-12px_rgba(37,99,235,.85)]">${esc(monogram(brandTitle))}</span>`;

  const html = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      .lp { font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; -webkit-font-smoothing:antialiased; }
      .lp *::selection { background:rgba(37,99,235,.18); }

      /* Panel kiri gelap (deep navy) sebagai kanvas seni 3D */
      .lp-art { background:radial-gradient(120% 120% at 15% 10%, #12224d 0%, transparent 55%), radial-gradient(120% 120% at 100% 100%, #0a1b3d 0%, transparent 55%), linear-gradient(150deg, #0A1B3D 0%, #0d2050 55%, #0a1730 100%); }
      .lp-grid-lines { background-image:linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px); background-size:46px 46px; -webkit-mask-image:radial-gradient(ellipse 75% 70% at 40% 40%, #000 35%, transparent 100%); mask-image:radial-gradient(ellipse 75% 70% at 40% 40%, #000 35%, transparent 100%); }

      @keyframes lpFloat { 0%,100%{transform:translate3d(0,0,0)} 50%{transform:translate3d(0,-18px,0)} }
      @keyframes lpFloatSlow { 0%,100%{transform:translate3d(0,0,0)} 50%{transform:translate3d(0,14px,0)} }
      @keyframes lpOrbit { from{transform:rotate(0)} to{transform:rotate(360deg)} }
      @keyframes lpPulse { 0%,100%{opacity:.5;transform:scale(1)} 50%{opacity:.85;transform:scale(1.08)} }
      @keyframes lpSpin3d { from{transform:rotateY(0) rotateX(18deg)} to{transform:rotateY(360deg) rotateX(18deg)} }
      @keyframes lpShine { 0%{transform:translateX(-120%)} 60%,100%{transform:translateX(220%)} }
      @keyframes lpRise { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }

      .lp-float{animation:lpFloat 7s ease-in-out infinite}
      .lp-float-slow{animation:lpFloatSlow 9s ease-in-out infinite}
      .lp-rise{animation:lpRise .7s cubic-bezier(.22,1,.36,1) both}
      .lp-rise-1{animation-delay:.05s}.lp-rise-2{animation-delay:.12s}.lp-rise-3{animation-delay:.2s}.lp-rise-4{animation-delay:.28s}.lp-rise-5{animation-delay:.36s}

      /* Kubus 3D (CSS transforms, GPU-friendly) */
      .lp-scene{perspective:900px}
      .lp-cube{position:relative;width:120px;height:120px;transform-style:preserve-3d;animation:lpSpin3d 16s linear infinite}
      .lp-cube .face{position:absolute;inset:0;border:1px solid rgba(255,255,255,.16);border-radius:18px;background:linear-gradient(135deg,rgba(59,130,246,.42),rgba(99,102,241,.24));box-shadow:inset 0 1px 0 rgba(255,255,255,.25)}
      .lp-cube .f1{transform:translateZ(60px)} .lp-cube .f2{transform:rotateY(180deg) translateZ(60px)}
      .lp-cube .f3{transform:rotateY(90deg) translateZ(60px)} .lp-cube .f4{transform:rotateY(-90deg) translateZ(60px)}
      .lp-cube .f5{transform:rotateX(90deg) translateZ(60px)} .lp-cube .f6{transform:rotateX(-90deg) translateZ(60px)}

      /* Kartu glass di kanvas seni */
      .lp-glass{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);box-shadow:0 30px 60px -30px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.18);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}

      /* Form controls */
      .lp-field{position:relative}
      .lp-input{width:100%;height:52px;border-radius:16px;border:1.5px solid #e2e8f0;background:#fff;padding:0 3rem 0 2.85rem;font-size:.95rem;font-weight:500;color:#0f172a;transition:border-color .18s ease, box-shadow .18s ease, background .18s ease}
      .lp-input::placeholder{color:#94a3b8;font-weight:400}
      .lp-input:focus{outline:none;border-color:#2563eb;background:#fff;box-shadow:0 0 0 4px rgba(37,99,235,.14)}
      .lp-input.is-filled{border-color:#c7d2fe;background:#fbfcff}
      .lp-field-ico{position:absolute;left:.95rem;top:50%;transform:translateY(-50%);color:#94a3b8;transition:color .18s ease}
      .lp-field:focus-within .lp-field-ico{color:#2563eb}
      .lp-eye{position:absolute;right:.65rem;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;color:#94a3b8;transition:color .18s ease,background .18s ease}
      .lp-eye:hover{color:#2563eb;background:#eff6ff}
      .lp-eye:focus-visible{outline:3px solid rgba(37,99,235,.4);outline-offset:2px}

      .lp-submit{position:relative;overflow:hidden;width:100%;height:52px;border-radius:16px;border:none;background:linear-gradient(180deg,#3b82f6,#2563eb);color:#fff;font-size:.95rem;font-weight:700;box-shadow:0 14px 30px -12px rgba(37,99,235,.75),inset 0 1px 0 rgba(255,255,255,.28);transition:transform .18s cubic-bezier(.22,1,.36,1),box-shadow .18s ease}
      .lp-submit:hover{transform:translateY(-2px);box-shadow:0 20px 38px -14px rgba(37,99,235,.8),inset 0 1px 0 rgba(255,255,255,.32)}
      .lp-submit:active{transform:translateY(0) scale(.99)}
      .lp-submit:disabled{opacity:.75;cursor:not-allowed;transform:none}
      .lp-submit:focus-visible{outline:3px solid rgba(37,99,235,.5);outline-offset:3px}
      .lp-submit::after{content:'';position:absolute;top:0;left:0;width:40%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.35),transparent);transform:translateX(-120%)}
      .lp-submit:hover::after{animation:lpShine 1.1s ease}
      .lp-spin{width:18px;height:18px;border:2.5px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:lpOrbit .7s linear infinite}

      .lp-back{display:inline-flex;align-items:center;gap:.5rem;font-size:.85rem;font-weight:600;color:rgba(255,255,255,.8);transition:color .18s ease}
      .lp-back:hover{color:#fff}
      .lp-ghost{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;height:44px;padding:0 1.1rem;border-radius:14px;background:#fff;color:#1e293b;border:1px solid #e2e8f0;font-size:.85rem;font-weight:600;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}
      .lp-ghost:hover{transform:translateY(-2px);border-color:#cbd5e1;box-shadow:0 12px 24px -16px rgba(15,23,42,.3)}
      .lp-ghost:focus-visible{outline:3px solid rgba(37,99,235,.4);outline-offset:2px}

      /* ===== Hero seni mobile (hanya < lg) ===== */
      .lp-mhero{position:relative;overflow:hidden;border-bottom-left-radius:32px;border-bottom-right-radius:32px}
      .lp-mcube{position:relative;width:78px;height:78px;transform-style:preserve-3d;animation:lpSpin3d 15s linear infinite}
      .lp-mcube .face{position:absolute;inset:0;border:1px solid rgba(255,255,255,.18);border-radius:14px;background:linear-gradient(135deg,rgba(59,130,246,.5),rgba(99,102,241,.3));box-shadow:inset 0 1px 0 rgba(255,255,255,.28)}
      .lp-mcube .f1{transform:translateZ(39px)} .lp-mcube .f2{transform:rotateY(180deg) translateZ(39px)}
      .lp-mcube .f3{transform:rotateY(90deg) translateZ(39px)} .lp-mcube .f4{transform:rotateY(-90deg) translateZ(39px)}
      .lp-mcube .f5{transform:rotateX(90deg) translateZ(39px)} .lp-mcube .f6{transform:rotateX(-90deg) translateZ(39px)}
      /* Kartu form naik menimpa hero agar terasa berlapis (depth) */
      .lp-sheet{position:relative;z-index:2;margin-top:-30px;border-top-left-radius:30px;border-top-right-radius:30px;background:#fff;box-shadow:0 -18px 50px -30px rgba(15,23,42,.35)}
      .lp-logo-ring{position:relative}
      .lp-logo-ring::before{content:'';position:absolute;inset:-7px;border-radius:22px;background:linear-gradient(135deg,rgba(59,130,246,.6),rgba(99,102,241,.35));filter:blur(9px);opacity:.7;z-index:-1}
      @keyframes lpConf { 0%{opacity:0;transform:translateY(6px) scale(.6)} 20%{opacity:1} 100%{opacity:0;transform:translateY(-30px) scale(1)} }
      @media (min-width:1024px){ .lp-sheet{margin-top:0;box-shadow:none;border-radius:0} }

      @media (prefers-reduced-motion: reduce){
        .lp-float,.lp-float-slow,.lp-cube,.lp-mcube,.lp-rise{animation:none}
        .lp-submit:hover::after{animation:none}
      }
    </style>

    <div class="lp min-h-screen bg-white">
      <!-- Hero seni untuk MOBILE (disembunyikan di desktop) -->
      <section class="lp-mhero lp-art px-6 pb-16 pt-10 text-white lg:hidden" aria-hidden="true">
        <div class="pointer-events-none absolute inset-0 lp-grid-lines"></div>
        <div class="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-500/30 blur-3xl" style="animation:lpPulse 6s ease-in-out infinite"></div>
        <div class="pointer-events-none absolute -left-16 bottom-0 h-52 w-52 rounded-full bg-indigo-500/25 blur-3xl" style="animation:lpPulse 7s ease-in-out infinite;animation-delay:1.1s"></div>

        <div class="relative flex items-center justify-between">
          <a href="#home" class="lp-back" aria-hidden="false">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>
            Beranda
          </a>
          <span class="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-200/90">${esc(settings.hero_badge || 'Portal Sekolah')}</span>
        </div>

        <div class="relative mt-6 flex items-center gap-4">
          <div class="lp-scene shrink-0">
            <div class="lp-mcube lp-float">
              <span class="face f1"></span><span class="face f2"></span><span class="face f3"></span>
              <span class="face f4"></span><span class="face f5"></span><span class="face f6"></span>
            </div>
          </div>
          <div class="min-w-0">
            <h2 class="text-[1.35rem] font-extrabold leading-tight tracking-[-0.02em] text-white">Ruang kerja digital sekolah.</h2>
            <p class="mt-1.5 text-[13px] leading-6 text-slate-300/90">${esc(settings.slogan || 'Absensi, nilai, materi & kolaborasi dalam satu tempat.')}</p>
          </div>
        </div>

        <span class="absolute right-8 top-24 h-2.5 w-2.5 rounded-full bg-sky-400/80 lp-float"></span>
        <span class="absolute left-10 bottom-6 h-2 w-2 rounded-full bg-indigo-300/80 lp-float-slow"></span>
      </section>

      <div class="lg:grid lg:min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <!-- Kanvas seni 3D (kiri) -->
      <section class="relative hidden overflow-hidden lp-art lg:block" aria-hidden="true">
        <div class="pointer-events-none absolute inset-0 lp-grid-lines"></div>
        <div class="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-blue-500/25 blur-3xl" style="animation:lpPulse 6s ease-in-out infinite"></div>
        <div class="pointer-events-none absolute -right-16 bottom-10 h-72 w-72 rounded-full bg-indigo-500/25 blur-3xl" style="animation:lpPulse 7s ease-in-out infinite;animation-delay:1.2s"></div>

        <div class="relative flex h-full flex-col justify-between p-12">
          <a href="#home" class="lp-back lp-rise lp-rise-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>
            Beranda
          </a>

          <!-- Panggung 3D -->
          <div class="relative mx-auto my-8 h-[340px] w-full max-w-md">
            <div class="lp-scene absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div class="lp-cube lp-float">
                <span class="face f1"></span><span class="face f2"></span><span class="face f3"></span>
                <span class="face f4"></span><span class="face f5"></span><span class="face f6"></span>
              </div>
            </div>

            <!-- kartu glass melayang -->
            <div class="lp-glass lp-float absolute left-0 top-6 w-52 rounded-3xl p-4">
              <div class="flex items-center gap-3">
                <span class="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M20 6L9 17l-5-5"/></svg></span>
                <div class="flex-1"><div class="h-2 w-20 rounded-full bg-white/40"></div><div class="mt-2 h-1.5 w-14 rounded-full bg-white/20"></div></div>
              </div>
            </div>
            <div class="lp-glass lp-float-slow absolute right-0 bottom-8 w-44 rounded-3xl p-4">
              <div class="grid grid-cols-4 gap-1.5">
                ${Array.from({ length: 8 }, (_, i) => `<span class="h-6 rounded-md ${i % 3 === 0 ? 'bg-blue-300/60' : 'bg-white/15'}"></span>`).join('')}
              </div>
            </div>

            <!-- orbit -->
            <div class="absolute bottom-2 left-8 h-28 w-28 lp-float-slow">
              <div class="absolute inset-0 rounded-full border border-white/15"></div>
              <div class="absolute inset-0" style="animation:lpOrbit 11s linear infinite"><span class="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,.9)]"></span></div>
            </div>
            <span class="absolute right-10 top-4 h-3 w-3 rounded-full bg-sky-400/80 lp-float"></span>
            <span class="absolute left-4 bottom-24 h-2 w-2 rounded-full bg-indigo-300/80 lp-float-slow"></span>
          </div>

          <div class="max-w-md">
            <p class="lp-rise lp-rise-2 text-xs font-semibold uppercase tracking-[0.28em] text-blue-300/80">${esc(settings.hero_badge || 'Portal Sekolah Digital')}</p>
            <h2 class="lp-rise lp-rise-3 mt-3 text-3xl font-extrabold leading-tight tracking-[-0.02em] text-white">Ruang kerja digital untuk seluruh warga sekolah.</h2>
            <p class="lp-rise lp-rise-4 mt-3 text-sm leading-7 text-slate-300/90">${esc(settings.slogan || 'Absensi, penilaian, materi, dan kolaborasi dalam satu tempat yang rapi dan cepat.')}</p>
          </div>
        </div>
      </section>

      <!-- Form login (kanan) -->
      <section class="lp-sheet relative flex items-center justify-center px-5 pb-10 pt-8 sm:px-8 lg:min-h-screen lg:py-10">
        <div class="w-full max-w-md">
          <div class="lp-rise lp-rise-1 mb-7 flex flex-col items-center text-center">
            <span class="lp-logo-ring">${logoMark}</span>
            <h1 class="mt-5 text-2xl font-bold tracking-tight text-slate-900">${esc(brandTitle)}</h1>
            <p class="mt-1 text-sm font-medium text-slate-500">${esc(schoolName)}</p>
          </div>

          <div class="lp-rise lp-rise-2 mb-6 text-center lg:text-left">
            <h2 class="text-xl font-bold tracking-tight text-slate-900">${esc(loginTitle)}</h2>
            <p class="mt-1 text-sm text-slate-500">${esc(loginSubtitle)}</p>
          </div>

          <form id="login-form" class="lp-rise lp-rise-3 space-y-3.5">
            <div class="lp-field">
              <span class="lp-field-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg></span>
              <input id="username" name="username" class="lp-input" placeholder="Username" autocomplete="username" required />
            </div>
            <div class="lp-field">
              <span class="lp-field-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></span>
              <input id="password" name="password" type="password" class="lp-input" placeholder="Password" autocomplete="current-password" required />
              <button type="button" id="toggle-password" class="lp-eye" aria-label="Tampilkan kata sandi">
                <svg id="eye-open" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                <svg id="eye-off" class="hidden h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
              </button>
            </div>

            <button id="login-btn" type="submit" class="lp-submit mt-1 inline-flex items-center justify-center gap-2">
              <span id="btn-text">Masuk</span>
              <span id="btn-loader" class="hidden lp-spin"></span>
            </button>
          </form>

          <div class="lp-rise lp-rise-4 mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs leading-5 text-slate-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5 flex-none text-blue-500"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
            Setelah masuk, Anda diarahkan otomatis ke dashboard sesuai peran.
          </div>

          <p class="mt-8 text-center text-xs text-slate-400">© ${new Date().getFullYear()} ${esc(brandTitle)} · ${esc(schoolName)}</p>
        </div>
      </section>
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

  // Micro-interaction: tandai field yang sudah terisi untuk gaya premium.
  container.querySelectorAll('.lp-input').forEach((input) => {
    const sync = () => input.classList.toggle('is-filled', Boolean(input.value.trim()));
    input.addEventListener('input', sync);
    input.addEventListener('blur', sync);
  });

  // Toggle password visibility (tukar ikon mata terbuka/tertutup)
  togglePasswordBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
    container.querySelector('#eye-open')?.classList.toggle('hidden', isPassword);
    container.querySelector('#eye-off')?.classList.toggle('hidden', !isPassword);
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
    let user = null;
    try {
      user = await loginUser(normalizedUsername, normalizedPassword);
    } catch (error) {
      const errorMessage = error?.message || 'Layanan login sedang tidak tersedia.';
      if (errorMessage.includes('Kuota database Firebase sedang habis')) {
        const emergencyUser = getEmergencyLocalUser(normalizedUsername);
        if (emergencyUser) {
          const continueEmergency = confirm('Kuota Firebase sedang habis. Lanjutkan dengan mode darurat lokal menggunakan data terakhir yang tersimpan di browser ini?');
          if (continueEmergency) {
            user = emergencyUser;
          }
        }
      }
      if (!user) {
        alert(errorMessage);
        loginBtn.disabled = false;
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
        return;
      }
    }

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
        ], { cacheMs: 300000 });
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
