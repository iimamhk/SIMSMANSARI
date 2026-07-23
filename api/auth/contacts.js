const { getAuth } = require('../_lib/firebase-admin');
const { listUsers } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method tidak diizinkan.' });
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Sesi tidak valid.' });
  try {
    await getAuth().verifyIdToken(header.slice(7));
    const result = await listUsers('', '', { limit: 100, after: req.query?.after });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Contacts API error:', error);
    return res.status(401).json({ error: 'Sesi tidak valid.' });
  }
};
