const { getAuth } = require('../_lib/firebase-admin');
const { listUsers, saveUser, normalizeUsername } = require('../_lib/auth');

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const adminUser = await requireAdmin(req);
  try {
    if (req.method === 'GET') {
      if (!adminUser) return res.status(401).json({ error: 'Akses admin diperlukan.' });
      const result = await listUsers(req.query?.role, req.query?.kelas, {
        limit: req.query?.limit,
        after: req.query?.after,
        includeTotal: req.query?.includeTotal === 'true',
      });
      return res.status(200).json(result);
    }
    if (!adminUser) return res.status(401).json({ error: 'Akses admin diperlukan.' });
    if (req.method === 'POST') {
      const input = req.body || {};
      const user = await saveUser(input, input.existing_username);
      return res.status(200).json({ user });
    }
    if (req.method === 'DELETE') {
      const username = normalizeUsername(req.query?.username);
      if (!username) return res.status(400).json({ error: 'Username wajib diisi.' });
      const { getFirestore } = require('../_lib/firebase-admin');
      await getFirestore().collection('users').doc(username).delete();
      return res.status(204).end();
    }
    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  } catch (error) {
    console.error('Admin user API error:', error);
    if (Number(error?.code) === 8) {
      return res.status(503).json({ error: 'Kuota database Firebase sedang habis. Coba kembali setelah kuota tersedia.' });
    }
    return res.status(400).json({ error: error.message || 'Operasi user gagal.' });
  }
};
