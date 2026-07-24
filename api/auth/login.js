const { login } = require('../_lib/auth');

function resolveLoginError(error) {
  const message = String(error?.message || '');
  if (Number(error?.code) === 8) {
    return {
      status: 503,
      body: { error: 'Kuota database Firebase sedang habis. Coba kembali setelah kuota tersedia.', code: 'firestore_quota_exceeded' },
    };
  }
  if (message.includes('Konfigurasi Firebase Admin belum lengkap')) {
    return {
      status: 500,
      body: {
        error: 'Konfigurasi Firebase Admin belum lengkap di Vercel. Isi FIREBASE_SERVICE_ACCOUNT_JSON atau FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, dan FIREBASE_PRIVATE_KEY.',
        code: 'firebase_admin_env_missing',
      },
    };
  }
  if (error instanceof SyntaxError && message.toLowerCase().includes('json')) {
    return {
      status: 500,
      body: { error: 'Nilai FIREBASE_SERVICE_ACCOUNT_JSON tidak valid (bukan JSON yang benar).', code: 'firebase_admin_env_json_invalid' },
    };
  }
  if (message.toLowerCase().includes('private key') || message.toLowerCase().includes('credential')) {
    return {
      status: 500,
      body: { error: 'Kredensial Firebase Admin tidak valid. Periksa FIREBASE_CLIENT_EMAIL dan FIREBASE_PRIVATE_KEY di Vercel.', code: 'firebase_admin_credential_invalid' },
    };
  }
  return {
    status: 500,
    body: { error: 'Layanan autentikasi belum siap.', code: 'auth_service_unavailable' },
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method tidak diizinkan.' });
  try {
    const result = await login(req.body?.username, req.body?.password);
    if (!result) return res.status(401).json({ error: 'Username atau password salah.' });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Auth login error:', error);
    const resolved = resolveLoginError(error);
    return res.status(resolved.status).json(resolved.body);
  }
};
