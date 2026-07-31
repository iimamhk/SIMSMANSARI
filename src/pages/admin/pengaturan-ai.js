import { renderLayout } from '../../layouts/dashboard-layout.js';
import { getAiAdminConfig, saveAiAdminConfig, testAiAdminConfig } from '../../firebase/auth-service.js';
import { adminAccentPanel, adminIcons, adminPageHero, bindAdminLogout } from '../../utils/admin-ui.js';

export async function renderAdminAiSettingsPage(container) {
  container.innerHTML = renderLayout('Pengaturan AI', `
    <div class="space-y-6">
      ${adminPageHero({
        eyebrow: 'Pengaturan',
        title: 'AI Materi',
        description: 'Satu model AI aktif untuk semua guru. API key dienkripsi sebelum disimpan.',
        chips: [`${adminIcons.spark} AI Agent`],
      })}

      <section class="rounded-[24px] border border-indigo-100 bg-white p-4 shadow-[0_16px_40px_-30px_rgba(79,70,229,.5)] sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div><p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-600">AI Agent</p><h3 class="mt-1 text-lg font-bold text-slate-900">Konfigurasi Materi AI</h3><p class="mt-1 text-xs leading-5 text-slate-500">Satu model aktif untuk semua guru. API key dienkripsi sebelum disimpan.</p></div>
          <span id="ai-config-status" class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">Memuat...</span>
        </div>
        <form id="ai-config-form" class="mt-4 grid gap-3 sm:grid-cols-2">
          <label class="sm:col-span-2"><span class="mb-1 block text-xs font-semibold text-slate-600">Base URL</span><input id="ai-base-url" type="url" required class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100" placeholder="https://api.groq.com/openai/v1"></label>
          <label><span class="mb-1 block text-xs font-semibold text-slate-600">API Key</span><input id="ai-api-key" type="password" autocomplete="new-password" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100" placeholder="Isi untuk mengganti key"></label>
          <label><span class="mb-1 block text-xs font-semibold text-slate-600">Model Agent</span><input id="ai-model" required class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100" placeholder="llama-3.3-70b-versatile"></label>
          <p id="ai-key-hint" class="text-xs text-slate-500 sm:col-span-2">API key belum disimpan.</p>
          <div class="flex flex-wrap items-center gap-2 sm:col-span-2"><button type="button" id="ai-test-btn" class="rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50">Tes Koneksi</button><button type="submit" id="ai-save-btn" class="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-105">Simpan AI</button><span id="ai-config-message" class="text-xs text-slate-500" role="status"></span></div>
        </form>
      </section>
    </div>
  `, { accentPanel: adminAccentPanel() });

  bindAdminLogout(container);

  const aiForm = container.querySelector('#ai-config-form');
  const aiBaseUrl = container.querySelector('#ai-base-url');
  const aiApiKey = container.querySelector('#ai-api-key');
  const aiModel = container.querySelector('#ai-model');
  const aiKeyHint = container.querySelector('#ai-key-hint');
  const aiStatus = container.querySelector('#ai-config-status');
  const aiMessage = container.querySelector('#ai-config-message');
  const aiTestBtn = container.querySelector('#ai-test-btn');
  const aiSaveBtn = container.querySelector('#ai-save-btn');
  let hasStoredAiKey = false;

  function setAiMessage(text, isError = false) {
    aiMessage.textContent = text || '';
    aiMessage.className = isError ? 'text-xs text-rose-600' : 'text-xs text-slate-500';
  }

  function readAiForm() {
    return {
      baseUrl: String(aiBaseUrl?.value || '').trim(),
      apiKey: String(aiApiKey?.value || '').trim(),
      model: String(aiModel?.value || '').trim(),
    };
  }

  try {
    const config = await getAiAdminConfig();
    hasStoredAiKey = Boolean(config.configured);
    if (config.baseUrl) aiBaseUrl.value = config.baseUrl;
    if (config.model) aiModel.value = config.model;
    aiKeyHint.textContent = config.keyTail ? `API key tersimpan: ${config.keyTail}. Kosongkan kolom bila tidak diganti.` : 'API key belum disimpan.';
    aiStatus.textContent = config.configured ? 'Terkonfigurasi' : 'Fallback env';
    aiStatus.className = config.configured ? 'rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700' : 'rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700';
  } catch (error) {
    aiStatus.textContent = 'Gagal memuat';
    aiStatus.className = 'rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700';
    setAiMessage(error.message, true);
  }

  aiTestBtn?.addEventListener('click', async () => {
    const config = readAiForm();
    if (!config.baseUrl || !config.model || (!config.apiKey && !hasStoredAiKey)) {
      setAiMessage('Lengkapi Base URL, API key, dan Model.', true);
      return;
    }
    aiTestBtn.disabled = true;
    aiTestBtn.textContent = 'Menguji...';
    try {
      const result = await testAiAdminConfig(config);
      if (!result.ok) throw new Error(result.error || 'Koneksi gagal.');
      setAiMessage(`Terhubung ke ${result.model || config.model}.`);
    } catch (error) {
      setAiMessage(error.message, true);
    } finally {
      aiTestBtn.disabled = false;
      aiTestBtn.textContent = 'Tes Koneksi';
    }
  });

  aiForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const config = readAiForm();
    if (!config.baseUrl || !config.model || (!config.apiKey && !hasStoredAiKey)) {
      setAiMessage('Lengkapi Base URL, API key, dan Model.', true);
      return;
    }
    aiSaveBtn.disabled = true;
    aiSaveBtn.textContent = 'Menyimpan...';
    try {
      const result = await saveAiAdminConfig(config);
      hasStoredAiKey = true;
      aiApiKey.value = '';
      aiKeyHint.textContent = `API key tersimpan: ${result.keyTail || 'terenkripsi'}. Kosongkan kolom bila tidak diganti.`;
      aiStatus.textContent = 'Terkonfigurasi';
      aiStatus.className = 'rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700';
      setAiMessage('Konfigurasi AI berhasil disimpan.');
    } catch (error) {
      setAiMessage(error.message, true);
    } finally {
      aiSaveBtn.disabled = false;
      aiSaveBtn.textContent = 'Simpan AI';
    }
  });
}
