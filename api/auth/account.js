const bcrypt = require('bcryptjs');
const { getAuth, getFirestore } = require('../_lib/firebase-admin');

async function currentUser(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return null;
  try {
    return await getAuth().verifyIdToken(header.slice(7));
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const decoded = await currentUser(req);
  if (!decoded) return res.status(401).json({ error: 'Sesi tidak valid.' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method tidak diizinkan.' });
  const password = String(req.body?.password || '').trim();
  if (password.length < 6 || password.length > 200) return res.status(400).json({ error: 'Password harus 6-200 karakter.' });
  try {
    const ref = getFirestore().collection('users').doc(decoded.uid);
    await ref.set({ password_hash: await bcrypt.hash(password, 12), updated_at: new Date().toISOString() }, { merge: true });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Account password error:', error);
    return res.status(500).json({ error: 'Password tidak dapat diperbarui.' });
  }
};
