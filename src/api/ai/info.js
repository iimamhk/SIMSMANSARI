/**
 * Endpoint info AI gabungan (menggantikan 3 fungsi terpisah demi hemat slot
 * Serverless Vercel: health + model-options + test-connection => 1 file fisik).
 *
 * URL lama tetap dipertahankan lewat rewrites di vercel.json:
 *   /api/health              -> /api/ai/info.js?type=health
 *   /api/ai/model-options    -> /api/ai/info.js?type=models
 *   /api/ai/test-connection  -> /api/ai/info.js?type=test
 *
 * Jenis permintaan ditentukan oleh query `type` (diset di destination rewrite).
 * Sebagai cadangan, bila `type` kosong, jenis diturunkan dari path asli agar
 * endpoint tetap benar meski konfigurasi rewrite berubah.
 */

const {
  getConfig,
  getPublicAiProfiles,
  handleOptions,
  resolveEffectiveProfile,
  sendJson,
  testUpstreamConnection,
} = require('../_lib/ai');

function resolveType(req) {
  const rawType = typeof req.query?.type === 'string' ? req.query.type.trim().toLowerCase() : '';
  if (rawType) return rawType;

  // Cadangan: turunkan dari path asli permintaan.
  const pathname = (() => {
    try {
      return new URL(req.url, 'http://localhost').pathname;
    } catch {
      return String(req.url || '');
    }
  })();
  if (pathname.endsWith('/health')) return 'health';
  if (pathname.endsWith('/model-options')) return 'models';
  if (pathname.endsWith('/test-connection')) return 'test';
  return '';
}

function sendHealth(req, res) {
  const env = getConfig();
  sendJson(req, res, 200, {
    status: 'ok',
    configured: Boolean(env.apiKey) && env.apiKey !== 'sk-xxxxxxxxxxxxxxxx',
    model: env.model,
    baseUrl: env.baseUrl,
    diagnostics: env.diagnostics,
    time: new Date().toISOString(),
  });
}

function sendModelOptions(req, res) {
  const config = getConfig();
  sendJson(req, res, 200, {
    profiles: getPublicAiProfiles(),
    defaultProfileId: config.defaultAiProfileId,
  });
}

async function sendTestConnection(req, res) {
  const profileId = typeof req.query?.profileId === 'string' ? req.query.profileId.slice(0, 100).trim() : '';
  const model = typeof req.query?.model === 'string' ? req.query.model.slice(0, 200).trim() : '';
  const profile = await resolveEffectiveProfile(profileId);
  const result = await testUpstreamConnection({ overrideProfile: profile, model: model || profile.model });
  sendJson(req, res, 200, result);
}

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') {
    sendJson(req, res, 405, { error: 'Method tidak diizinkan.', code: 'method_not_allowed' });
    return;
  }

  const type = resolveType(req);

  if (type === 'health') {
    sendHealth(req, res);
    return;
  }
  if (type === 'models' || type === 'model-options') {
    sendModelOptions(req, res);
    return;
  }
  if (type === 'test' || type === 'test-connection') {
    await sendTestConnection(req, res);
    return;
  }

  sendJson(req, res, 400, {
    error: 'Parameter type tidak dikenal. Gunakan type=health, type=models, atau type=test.',
    code: 'unknown_type',
  });
};
