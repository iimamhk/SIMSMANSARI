const {
  handleOptions,
  sendJson,
  testUpstreamConnection,
} = require('../_lib/ai');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') {
    sendJson(req, res, 405, { error: 'Method tidak diizinkan.', code: 'method_not_allowed' });
    return;
  }

  const result = await testUpstreamConnection();
  sendJson(req, res, 200, result);
};