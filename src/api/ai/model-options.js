const {
  getConfig,
  getPublicAiProfiles,
  handleOptions,
  sendJson,
} = require('../_lib/ai');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') {
    sendJson(req, res, 405, { error: 'Method tidak diizinkan.', code: 'method_not_allowed' });
    return;
  }

  const config = getConfig();
  sendJson(req, res, 200, {
    profiles: getPublicAiProfiles(),
    defaultProfileId: config.defaultAiProfileId,
  });
};
