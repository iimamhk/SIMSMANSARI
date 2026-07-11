const { getConfig, handleOptions, sendJson } = require('./_lib/ai');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') {
    sendJson(req, res, 405, { error: 'Method tidak diizinkan.', code: 'method_not_allowed' });
    return;
  }

  const env = getConfig();
  sendJson(req, res, 200, {
    status: 'ok',
    configured: Boolean(env.apiKey) && env.apiKey !== 'sk-xxxxxxxxxxxxxxxx',
    model: env.model,
    baseUrl: env.baseUrl,
    diagnostics: env.diagnostics,
    time: new Date().toISOString(),
  });
};