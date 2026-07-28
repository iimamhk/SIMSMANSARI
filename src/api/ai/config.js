const { getAuth } = require('../_lib/firebase-admin');
const { getPublicConfig, writeStoredConfig, readStoredConfig } = require('../_lib/ai-config');
const { testUpstreamConnection } = require('../_lib/ai');
const { handleOptions, sendJson } = require('../_lib/ai');

async function requireAdmin(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return null;
  try {
    const decoded = await getAuth().verifyIdToken(header.slice(7));
    return decoded.role === 'admin' ? decoded : null;
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;

  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    sendJson(req, res, 401, { error: 'Akses admin diperlukan.', code: 'unauthorized' });
    return;
  }

  if (req.method === 'GET') {
    try {
      const config = await getPublicConfig();
      sendJson(req, res, 200, config);
    } catch (error) {
      sendJson(req, res, 500, { error: 'Gagal membaca konfigurasi AI.', code: 'read_failed' });
    }
    return;
  }

  if (req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const baseUrl = body.baseUrl ?? body.base_url;
    const model = body.model;
    const apiKey = body.apiKey ?? body.api_key;
    const action = String(body.action || '').trim();

    try {
      // Mode "test": simpan sementara lalu uji koneksi, tanpa menulis bila gagal.
      if (action === 'test') {
        const stored = await readStoredConfig({ forceRefresh: true });
        const testConfig = {
          baseUrl: baseUrl || stored?.baseUrl,
          model: model || stored?.model,
          apiKey: apiKey || stored?.apiKey,
        };
        if (!testConfig.apiKey || !testConfig.baseUrl || !testConfig.model) {
          sendJson(req, res, 200, { ok: false, error: 'Lengkapi Base URL, API key, dan Model untuk tes.', code: 'incomplete' });
          return;
        }
        const result = await testUpstreamConnection({
          overrideProfile: {
            id: 'firestore-test',
            label: 'Firestore Test',
            apiKey: testConfig.apiKey,
            baseUrl: testConfig.baseUrl,
            model: testConfig.model,
            models: [testConfig.model],
            isDefault: true,
          },
        });
        sendJson(req, res, 200, result);
        return;
      }

      // Mode simpan (default).
      const stored = await readStoredConfig({ forceRefresh: true });
      const finalApiKey = String(apiKey || '').trim() || stored?.apiKey || '';
      const result = await writeStoredConfig({
        baseUrl,
        apiKey: finalApiKey,
        model,
        updatedBy: adminUser.username || adminUser.uid || 'admin',
      });
      sendJson(req, res, 200, { ok: true, ...result });
    } catch (error) {
      sendJson(req, res, 400, { error: error?.message || 'Gagal menyimpan konfigurasi AI.', code: 'write_failed' });
    }
    return;
  }

  sendJson(req, res, 405, { error: 'Method tidak diizinkan.', code: 'method_not_allowed' });
};
