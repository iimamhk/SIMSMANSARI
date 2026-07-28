const { resolveEffectiveProfile, handleOptions, sendJson } = require('../_lib/ai');

module.exports = async (req, res) => {
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') {
    sendJson(req, res, 405, { error: 'Method tidak diizinkan.' });
    return;
  }

  try {
    const profile = await resolveEffectiveProfile('');
    if (!profile?.apiKey) {
      sendJson(req, res, 200, { error: 'No API key configured', profileId: profile?.id });
      return;
    }

    const url = `${profile.baseUrl}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${profile.apiKey}`,
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({
        model: profile.model,
        messages: [{ role: 'user', content: 'Balas dengan kata: OK' }],
        max_tokens: 10,
        temperature: 0,
        stream: false,
      }),
    });

    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();

    sendJson(req, res, 200, {
      status: response.status,
      contentType,
      baseUrl: profile.baseUrl,
      model: profile.model,
      profileId: profile.id,
      bodyPreview: body.slice(0, 1000),
    });
  } catch (error) {
    sendJson(req, res, 200, { error: error?.message || 'unknown', stack: error?.stack?.slice(0, 500) });
  }
};
