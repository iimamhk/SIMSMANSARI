const { login } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method tidak diizinkan.' });
  try {
    const result = await login(req.body?.username, req.body?.password);
    if (!result) return res.status(401).json({ error: 'Username atau password salah.' });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Auth login error:', error);
    return res.status(500).json({ error: 'Layanan autentikasi belum siap.' });
  }
};
