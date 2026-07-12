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

  const profileId = typeof req.query?.profileId === 'string' ? req.query.profileId.slice(0, 100).trim() : '';
  const model = typeof req.query?.model === 'string' ? req.query.model.slice(0, 200).trim() : '';
  const result = await testUpstreamConnection({ profileId, model });
  sendJson(req, res, 200, result);
};