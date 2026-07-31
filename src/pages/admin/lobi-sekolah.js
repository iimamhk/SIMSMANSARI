import { renderLayout } from '../../layouts/dashboard-layout.js';
import { fileToLogoDataUrl } from '../../utils/image-local.js';
import {
  getLobbyPayload,
  getLobbySectionLinks,
  removeLobbyLink,
  removeLobbySection,
  saveLobbyLink,
  saveLobbySection,
  saveLobbySettings,
  slugifyLobbyText,
} from '../../utils/lobby.js';

const accentOptions = [
  'from-emerald-400 via-cyan-400 to-sky-400',
  'from-cyan-400 via-sky-400 to-violet-400',
  'from-sky-400 via-blue-400 to-violet-400',
  'from-emerald-400 via-teal-400 to-violet-400',
  'from-amber-400 via-orange-400 to-rose-400',
];

const displayThemeOptions = [
  { value: 'glass_cards', label: 'Glass Cards' },
  { value: 'outline_list', label: 'Outline List' },
  { value: 'compact_strips', label: 'Compact Strips' },
  { value: 'poster_blocks', label: 'Poster Blocks' },
];

export async function renderAdminLobbySchoolPage(container) {
  const { settings, sections, links } = await getLobbyPayload();
  const activeSections = sections.filter((item) => item.is_active !== false);
  const selectedFromHash = (window.location.hash.split('/')[2] || '').trim();
  const selectedSectionId = selectedFromHash || activeSections[0]?.id || sections[0]?.id || '';
  const selectedSection = sections.find((item) => item.id === selectedSectionId) || null;
  const selectedLinks = selectedSection ? getLobbySectionLinks(links, selectedSection.id) : [];

  const html = renderLayout('Lobi Sekolah', `
    <div class="space-y-6">
      <section class="rounded-[30px] border border-sky-100 bg-gradient-to-br from-cyan-500 via-sky-500 to-teal-400 p-5 text-white shadow-[0_28px_60px_-32px_rgba(14,165,233,0.55)]">
        <p class="text-sm font-semibold uppercase tracking-[0.2em] text-white/75">Lobi Sekolah</p>
        <h3 class="mt-2 text-2xl font-semibold text-white">Kelola halaman lobi publik sekolah</h3>
        <p class="mt-2 text-sm leading-6 text-white/90">Atur judul beranda, kategori lobi, daftar tautan, dan token akses untuk halaman tertentu dari satu panel admin.</p>
      </section>

      <section class="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <form id="lobby-settings-form" class="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">Pengaturan Beranda</p>
              <h4 class="mt-1 text-xl font-semibold text-slate-900">Konten utama lobi publik</h4>
            </div>
            <button type="submit" class="rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white">Simpan Beranda</button>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Nama Sekolah</label>
              <input id="setting-school-name" value="${settings.school_name || ''}" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
            </div>
            <div>
              <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Logo Sekolah</label>
              <div class="flex items-center gap-3">
                <span id="logo-preview" class="grid h-12 w-12 flex-none place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-slate-300">
                  ${settings.logo_url ? `<img src="${settings.logo_url}" alt="Logo" class="h-full w-full object-cover" />` : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="h-5 w-5"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-6 6"/></svg>'}
                </span>
                <div class="flex-1">
                  <input id="setting-logo-url" value="${settings.logo_url || ''}" placeholder="Pilih berkas dari perangkat atau tempel URL" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
                  <div class="mt-2 flex items-center gap-2">
                    <button type="button" id="logo-upload-btn" class="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M4 20h16"/></svg>
                      Pilih dari Perangkat
                    </button>
                    <span id="logo-upload-status" class="text-xs text-slate-400"></span>
                  </div>
                  <input type="file" id="logo-upload-input" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" class="hidden" />
                </div>
              </div>
            </div>
          </div>
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Slogan</label>
            <input id="setting-slogan" value="${settings.slogan || ''}" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Badge</label>
              <input id="setting-hero-badge" value="${settings.hero_badge || ''}" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
            </div>
            <div>
              <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Judul Aplikasi</label>
              <input id="setting-hero-title" value="${settings.hero_title || ''}" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
            </div>
          </div>
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Deskripsi Singkat</label>
            <input id="setting-hero-description" value="${settings.hero_description || ''}" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Judul Utama</label>
            <input id="setting-hero-heading" value="${settings.hero_heading || ''}" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Subjudul</label>
            <textarea id="setting-hero-subheading" rows="2" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">${settings.hero_subheading || ''}</textarea>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <p class="text-sm font-semibold uppercase tracking-[0.16em] text-sky-600">Halaman Login</p>
            <p class="mt-1 text-xs text-slate-500">Atur tampilan halaman masuk. Kosongkan logo login untuk memakai logo sekolah di atas.</p>
            <div class="mt-3 grid gap-3">
              <div>
                <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Logo Login</label>
                <div class="flex items-center gap-3">
                  <span id="login-logo-preview" class="grid h-12 w-12 flex-none place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-300">
                    ${settings.login_logo_url ? `<img src="${settings.login_logo_url}" alt="Logo login" class="h-full w-full object-cover" />` : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="h-5 w-5"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-6 6"/></svg>'}
                  </span>
                  <div class="flex-1">
                    <input id="setting-login-logo-url" value="${settings.login_logo_url || ''}" placeholder="Kosong = pakai logo sekolah" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
                    <div class="mt-2 flex items-center gap-2">
                      <button type="button" id="login-logo-upload-btn" class="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M4 20h16"/></svg>
                        Pilih dari Perangkat
                      </button>
                      <span id="login-logo-upload-status" class="text-xs text-slate-400"></span>
                    </div>
                    <input type="file" id="login-logo-upload-input" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" class="hidden" />
                  </div>
                </div>
              </div>
              <div>
                <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Judul Login</label>
                <input id="setting-login-title" value="${settings.login_title || ''}" placeholder="Selamat datang kembali" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              </div>
              <div>
                <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Subjudul Login</label>
                <input id="setting-login-subtitle" value="${settings.login_subtitle || ''}" placeholder="Masuk dengan akun admin, guru, atau siswa Anda." class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              </div>
            </div>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Label Panel Akses</label>
              <input id="setting-access-badge" value="${settings.access_badge || ''}" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
            </div>
            <div>
              <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Judul Panel Akses</label>
              <input id="setting-access-title" value="${settings.access_title || ''}" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
            </div>
          </div>
          <div>
            <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Deskripsi Panel Akses</label>
            <textarea id="setting-access-description" rows="2" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">${settings.access_description || ''}</textarea>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Teks Tombol Login</label>
              <input id="setting-access-button-text" value="${settings.access_button_text || ''}" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
            </div>
            <div>
              <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Info Pills</label>
              <input id="setting-info-pills" value="${(settings.info_pills || []).join(' | ')}" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
            </div>
          </div>
          <p id="lobby-settings-message" class="text-sm text-slate-500"></p>
        </form>

        <div class="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <p class="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">Ringkasan</p>
            <h4 class="mt-1 text-xl font-semibold text-slate-900">Statistik modul lobi</h4>
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="rounded-[26px] border border-sky-100 bg-gradient-to-br from-white via-sky-50/50 to-cyan-50/40 p-4">
              <p class="text-xs uppercase tracking-[0.12em] text-slate-500">Kategori Aktif</p>
              <p class="mt-2 text-2xl font-semibold text-slate-900">${activeSections.length}</p>
            </div>
            <div class="rounded-[26px] border border-sky-100 bg-gradient-to-br from-white via-sky-50/50 to-cyan-50/40 p-4">
              <p class="text-xs uppercase tracking-[0.12em] text-slate-500">Total Tautan</p>
              <p class="mt-2 text-2xl font-semibold text-slate-900">${links.filter((item) => item.is_active !== false).length}</p>
            </div>
            <div class="rounded-[26px] border border-sky-100 bg-gradient-to-br from-white via-sky-50/50 to-cyan-50/40 p-4">
              <p class="text-xs uppercase tracking-[0.12em] text-slate-500">Kategori Bertoken</p>
              <p class="mt-2 text-2xl font-semibold text-slate-900">${sections.filter((item) => item.requires_token).length}</p>
            </div>
          </div>
          <div class="rounded-[26px] border border-sky-100 bg-gradient-to-br from-white via-sky-50/50 to-cyan-50/40 p-4 text-sm leading-6 text-slate-600">
            Kategori bertipe <span class="font-semibold text-slate-900">Link Tree</span> akan ditampilkan sebagai halaman daftar tautan. Token bisa diubah manual dari panel kategori.
          </div>
        </div>
      </section>

      <section class="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div class="space-y-4">
          <div class="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">Kategori Lobi</p>
                <h4 class="mt-1 text-xl font-semibold text-slate-900">Daftar kategori</h4>
              </div>
              <button id="new-section-btn" type="button" class="rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white">Kategori Baru</button>
            </div>
            <div class="mt-4 space-y-3">
              ${sections.length ? sections.map((item) => `
                <button type="button" data-section-pick="${item.id}" class="section-pick flex w-full items-start justify-between gap-3 rounded-2xl border ${selectedSectionId === item.id ? 'border-sky-500 bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-900'} px-4 py-4 text-left transition">
                  <div>
                    <p class="text-sm font-semibold">${item.title}</p>
                    <p class="mt-1 text-xs ${selectedSectionId === item.id ? 'text-slate-200' : 'text-slate-500'}">/${item.slug} • ${item.type === 'link_tree' ? 'Link Tree' : 'Daftar Kartu'} • ${displayThemeOptions.find((entry) => entry.value === item.display_theme)?.label || 'Glass Cards'}${item.requires_token ? ' • Bertoken' : ''}</p>
                  </div>
                  <span class="rounded-full px-3 py-1 text-[11px] font-semibold ${selectedSectionId === item.id ? 'bg-white/10 text-white' : 'bg-white text-slate-600'}">${item.is_active ? 'Aktif' : 'Nonaktif'}</span>
                </button>
              `).join('') : '<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">Belum ada kategori lobi.</div>'}
            </div>
          </div>

          <form id="section-form" class="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">Editor Kategori</p>
                <h4 id="section-form-title" class="mt-1 text-xl font-semibold text-slate-900">${selectedSection ? 'Edit kategori' : 'Tambah kategori'}</h4>
              </div>
              ${selectedSection ? `<button id="delete-section-btn" type="button" class="rounded-2xl bg-rose-100 px-4 py-3 text-sm font-semibold text-rose-600">Hapus</button>` : ''}
            </div>
            <input id="section-id" type="hidden" value="${selectedSection?.id || ''}" />
            <div class="grid gap-3 md:grid-cols-2">
              <div>
                <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Judul</label>
                <input id="section-title" value="${selectedSection?.title || ''}" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" required />
              </div>
              <div>
                <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Slug</label>
                <input id="section-slug" value="${selectedSection?.slug || ''}" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" required />
              </div>
            </div>
            <div>
              <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Deskripsi</label>
              <textarea id="section-description" rows="2" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">${selectedSection?.description || ''}</textarea>
            </div>
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tipe</label>
                <select id="section-type" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <option value="link_tree" ${selectedSection?.type === 'link_tree' ? 'selected' : ''}>Link Tree</option>
                  <option value="card_list" ${selectedSection?.type === 'card_list' ? 'selected' : ''}>Daftar Kartu</option>
                </select>
              </div>
              <div>
                <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tema Daftar</label>
                <select id="section-display-theme" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  ${displayThemeOptions.map((item) => `<option value="${item.value}" ${selectedSection?.display_theme === item.value ? 'selected' : ''}>${item.label}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Aksen</label>
                <select id="section-accent" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  ${accentOptions.map((item) => `<option value="${item}" ${selectedSection?.accent === item ? 'selected' : ''}>${item}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Urutan</label>
                <input id="section-sort-order" type="number" min="1" value="${selectedSection?.sort_order || sections.length + 1}" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
              </div>
            </div>
            <div class="grid gap-3 md:grid-cols-2">
              <label class="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input id="section-active" type="checkbox" class="h-4 w-4" ${selectedSection?.is_active !== false ? 'checked' : ''} /> Aktif
              </label>
              <label class="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input id="section-requires-token" type="checkbox" class="h-4 w-4" ${selectedSection?.requires_token ? 'checked' : ''} /> Batasi dengan token
              </label>
            </div>
            <div>
              <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Token Akses Manual</label>
              <input id="section-access-token" value="${selectedSection?.access_token || ''}" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" placeholder="Contoh: RPP2026" />
            </div>
            <div class="flex flex-wrap gap-2">
              <button type="submit" class="rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 px-4 py-3 text-sm font-semibold text-white">Simpan Kategori</button>
              <button id="reset-section-btn" type="button" class="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">Reset</button>
            </div>
            <p id="section-message" class="text-sm text-slate-500"></p>
          </form>
        </div>

        <div class="space-y-4">
          <div class="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">Tautan Kategori</p>
                <h4 class="mt-1 text-xl font-semibold text-slate-900">${selectedSection ? selectedSection.title : 'Pilih kategori'}</h4>
              </div>
              <button id="new-link-btn" type="button" class="rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white" ${selectedSection ? '' : 'disabled'}>Tautan Baru</button>
            </div>
            <div class="mt-4 space-y-3">
              ${selectedSection ? (selectedLinks.length ? selectedLinks.map((item) => `
                <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p class="text-sm font-semibold text-slate-900">${item.title}</p>
                      <p class="mt-1 text-xs text-slate-500">${item.url || '-'}</p>
                      <p class="mt-2 text-sm text-slate-600">${item.description || 'Tanpa deskripsi.'}</p>
                    </div>
                    <div class="flex gap-2">
                      <button type="button" data-edit-link="${item.id}" class="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-700">Edit</button>
                      <button type="button" data-delete-link="${item.id}" class="rounded-xl bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-600">Hapus</button>
                    </div>
                  </div>
                </div>
              `).join('') : '<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">Belum ada tautan untuk kategori ini.</div>') : '<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">Pilih kategori untuk mengelola tautan.</div>'}
            </div>
          </div>

          <form id="link-form" class="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm space-y-4 ${selectedSection ? '' : 'opacity-60'}">
            <div>
              <p class="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">Editor Tautan</p>
              <h4 id="link-form-title" class="mt-1 text-xl font-semibold text-slate-900">Tambah tautan</h4>
            </div>
            <input id="link-id" type="hidden" value="" />
            <input id="link-section-id" type="hidden" value="${selectedSection?.id || ''}" />
            <div>
              <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Judul Tautan</label>
              <input id="link-title" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" ${selectedSection ? '' : 'disabled'} required />
            </div>
            <div>
              <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">URL / Hash</label>
              <input id="link-url" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" placeholder="https://... atau #..." ${selectedSection ? '' : 'disabled'} required />
            </div>
            <div>
              <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Deskripsi</label>
              <textarea id="link-description" rows="2" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" ${selectedSection ? '' : 'disabled'}></textarea>
            </div>
            <div class="grid gap-3 md:grid-cols-2">
              <div>
                <label class="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Urutan</label>
                <input id="link-sort-order" type="number" min="1" value="${selectedLinks.length + 1}" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" ${selectedSection ? '' : 'disabled'} />
              </div>
              <label class="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 self-end">
                <input id="link-active" type="checkbox" class="h-4 w-4" checked ${selectedSection ? '' : 'disabled'} /> Aktif
              </label>
            </div>
            <div class="flex flex-wrap gap-2">
              <button type="submit" class="rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 px-4 py-3 text-sm font-semibold text-white" ${selectedSection ? '' : 'disabled'}>Simpan Tautan</button>
              <button id="reset-link-btn" type="button" class="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700" ${selectedSection ? '' : 'disabled'}>Reset</button>
            </div>
            <p id="link-message" class="text-sm text-slate-500"></p>
          </form>
        </div>
      </section>
    </div>
  `);

  container.innerHTML = html;

  const settingsForm = container.querySelector('#lobby-settings-form');
  const sectionForm = container.querySelector('#section-form');
  const linkForm = container.querySelector('#link-form');

  const resetSectionForm = () => {
    container.querySelector('#section-form-title').textContent = 'Tambah kategori';
    container.querySelector('#section-id').value = '';
    container.querySelector('#section-title').value = '';
    container.querySelector('#section-slug').value = '';
    container.querySelector('#section-description').value = '';
    container.querySelector('#section-type').value = 'link_tree';
    container.querySelector('#section-display-theme').value = 'glass_cards';
    container.querySelector('#section-accent').value = accentOptions[0];
    container.querySelector('#section-sort-order').value = sections.length + 1;
    container.querySelector('#section-active').checked = true;
    container.querySelector('#section-requires-token').checked = false;
    container.querySelector('#section-access-token').value = '';
    const deleteBtn = container.querySelector('#delete-section-btn');
    deleteBtn?.remove();
  };

  const resetLinkForm = () => {
    container.querySelector('#link-form-title').textContent = 'Tambah tautan';
    container.querySelector('#link-id').value = '';
    container.querySelector('#link-section-id').value = selectedSection?.id || '';
    container.querySelector('#link-title').value = '';
    container.querySelector('#link-url').value = '';
    container.querySelector('#link-description').value = '';
    container.querySelector('#link-sort-order').value = selectedLinks.length + 1;
    container.querySelector('#link-active').checked = true;
  };

  // Ambil logo dari perangkat (lokal): perkecil di browser → data URL, tanpa
  // memerlukan server/Storage. Hasilnya langsung mengisi field & pratinjau.
  function wireLogoUpload({ btnId, inputId, urlId, statusId, previewId }) {
    const btn = container.querySelector(`#${btnId}`);
    const input = container.querySelector(`#${inputId}`);
    const urlField = container.querySelector(`#${urlId}`);
    const statusEl = container.querySelector(`#${statusId}`);
    const preview = container.querySelector(`#${previewId}`);
    if (!btn || !input) return;

    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      btn.disabled = true;
      if (statusEl) { statusEl.textContent = 'Memproses gambar...'; statusEl.className = 'text-xs text-sky-600'; }
      try {
        const { dataUrl, bytes } = await fileToLogoDataUrl(file, { maxSize: 256 });
        if (urlField) urlField.value = dataUrl;
        if (preview) preview.innerHTML = `<img src="${dataUrl}" alt="Logo" class="h-full w-full object-cover" />`;
        const kb = Math.max(1, Math.round(bytes / 1024));
        if (statusEl) { statusEl.textContent = `Siap (${kb} KB). Klik Simpan Beranda untuk menerapkan.`; statusEl.className = 'text-xs text-emerald-600'; }
      } catch (error) {
        if (statusEl) { statusEl.textContent = error?.message || 'Gagal memproses gambar.'; statusEl.className = 'text-xs text-rose-600'; }
      } finally {
        btn.disabled = false;
        input.value = '';
      }
    });
  }
  wireLogoUpload({ btnId: 'logo-upload-btn', inputId: 'logo-upload-input', urlId: 'setting-logo-url', statusId: 'logo-upload-status', previewId: 'logo-preview' });
  wireLogoUpload({ btnId: 'login-logo-upload-btn', inputId: 'login-logo-upload-input', urlId: 'setting-login-logo-url', statusId: 'login-logo-upload-status', previewId: 'login-logo-preview' });

  settingsForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      logo_url: container.querySelector('#setting-logo-url').value,
      school_name: container.querySelector('#setting-school-name').value,
      slogan: container.querySelector('#setting-slogan').value,
      hero_badge: container.querySelector('#setting-hero-badge').value,
      hero_title: container.querySelector('#setting-hero-title').value,
      hero_description: container.querySelector('#setting-hero-description').value,
      hero_heading: container.querySelector('#setting-hero-heading').value,
      hero_subheading: container.querySelector('#setting-hero-subheading').value,
      login_logo_url: container.querySelector('#setting-login-logo-url').value,
      login_title: container.querySelector('#setting-login-title').value,
      login_subtitle: container.querySelector('#setting-login-subtitle').value,
      access_badge: container.querySelector('#setting-access-badge').value,
      access_title: container.querySelector('#setting-access-title').value,
      access_description: container.querySelector('#setting-access-description').value,
      access_button_text: container.querySelector('#setting-access-button-text').value,
      info_pills: container.querySelector('#setting-info-pills').value.split('|').map((item) => item.trim()).filter(Boolean),
      footer_label: settings.footer_label,
      footer_title: settings.footer_title,
    };
    await saveLobbySettings(payload);
    const messageEl = container.querySelector('#lobby-settings-message');
    if (messageEl) {
      messageEl.textContent = 'Pengaturan beranda berhasil disimpan.';
      messageEl.className = 'text-sm text-emerald-600';
    }
  });

  container.querySelectorAll('[data-section-pick]').forEach((button) => {
    button.addEventListener('click', () => {
      window.location.hash = `#admin/lobi-sekolah/${button.getAttribute('data-section-pick')}`;
    });
  });

  container.querySelector('#new-section-btn')?.addEventListener('click', () => {
    resetSectionForm();
    const sectionMessage = container.querySelector('#section-message');
    if (sectionMessage) {
      sectionMessage.textContent = 'Isi formulir untuk menambah kategori baru.';
      sectionMessage.className = 'text-sm text-slate-500';
    }
  });

  container.querySelector('#reset-section-btn')?.addEventListener('click', () => {
    resetSectionForm();
  });

  container.querySelector('#section-title')?.addEventListener('input', (event) => {
    const slugInput = container.querySelector('#section-slug');
    if (!container.querySelector('#section-id').value) {
      slugInput.value = slugifyLobbyText(event.target.value);
    }
  });

  sectionForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      id: container.querySelector('#section-id').value,
      title: container.querySelector('#section-title').value,
      slug: container.querySelector('#section-slug').value,
      description: container.querySelector('#section-description').value,
      type: container.querySelector('#section-type').value,
      display_theme: container.querySelector('#section-display-theme').value,
      accent: container.querySelector('#section-accent').value,
      sort_order: container.querySelector('#section-sort-order').value,
      is_active: container.querySelector('#section-active').checked,
      requires_token: container.querySelector('#section-requires-token').checked,
      access_token: container.querySelector('#section-access-token').value,
    };
    const saved = await saveLobbySection(payload);
    const sectionMessage = container.querySelector('#section-message');
    if (sectionMessage) {
      sectionMessage.textContent = 'Kategori berhasil disimpan.';
      sectionMessage.className = 'text-sm text-emerald-600';
    }
    window.location.hash = `#admin/lobi-sekolah/${saved.id}`;
  });

  container.querySelector('#delete-section-btn')?.addEventListener('click', async () => {
    if (!selectedSection) {
      return;
    }
    const confirmed = confirm('Hapus kategori ini beserta semua tautannya?');
    if (!confirmed) {
      return;
    }
    await removeLobbySection(selectedSection.id);
    window.location.hash = '#admin/lobi-sekolah';
    renderAdminLobbySchoolPage(container);
  });

  container.querySelector('#new-link-btn')?.addEventListener('click', () => {
    resetLinkForm();
    const linkMessage = container.querySelector('#link-message');
    if (linkMessage) {
      linkMessage.textContent = 'Isi formulir untuk menambah tautan baru.';
      linkMessage.className = 'text-sm text-slate-500';
    }
  });

  container.querySelector('#reset-link-btn')?.addEventListener('click', () => {
    resetLinkForm();
  });

  container.querySelectorAll('[data-edit-link]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = selectedLinks.find((entry) => entry.id === button.getAttribute('data-edit-link'));
      if (!item) {
        return;
      }
      container.querySelector('#link-form-title').textContent = 'Edit tautan';
      container.querySelector('#link-id').value = item.id;
      container.querySelector('#link-section-id').value = item.section_id;
      container.querySelector('#link-title').value = item.title || '';
      container.querySelector('#link-url').value = item.url || '';
      container.querySelector('#link-description').value = item.description || '';
      container.querySelector('#link-sort-order').value = item.sort_order || 1;
      container.querySelector('#link-active').checked = item.is_active !== false;
    });
  });

  container.querySelectorAll('[data-delete-link]').forEach((button) => {
    button.addEventListener('click', async () => {
      const confirmed = confirm('Hapus tautan ini?');
      if (!confirmed) {
        return;
      }
      await removeLobbyLink(button.getAttribute('data-delete-link'));
      renderAdminLobbySchoolPage(container);
    });
  });

  linkForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!selectedSection) {
      return;
    }
    await saveLobbyLink({
      id: container.querySelector('#link-id').value,
      section_id: container.querySelector('#link-section-id').value || selectedSection.id,
      title: container.querySelector('#link-title').value,
      url: container.querySelector('#link-url').value,
      description: container.querySelector('#link-description').value,
      sort_order: container.querySelector('#link-sort-order').value,
      is_active: container.querySelector('#link-active').checked,
    });
    const linkMessage = container.querySelector('#link-message');
    if (linkMessage) {
      linkMessage.textContent = 'Tautan berhasil disimpan.';
      linkMessage.className = 'text-sm text-emerald-600';
    }
    renderAdminLobbySchoolPage(container);
  });

  container.querySelector('#logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('simguru_session');
    window.location.hash = '#login';
  });
}
