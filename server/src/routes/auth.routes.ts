import bcrypt from 'bcryptjs';
import { Router, type Request, type Response } from 'express';
import admin from 'firebase-admin';

const router = Router();
const usernamePattern = /^[a-z0-9._-]{3,30}$/;

function normalizeUsername(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function normalizePassword(value: unknown): string {
  return String(value || '').trim();
}

function getAdminApp(): admin.app.App {
  if (admin.apps.length) return admin.app();

  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
  if (rawServiceAccount) {
    return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(rawServiceAccount)) });
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Konfigurasi Firebase Admin belum lengkap. Isi FIREBASE_SERVICE_ACCOUNT_JSON atau FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, dan FIREBASE_PRIVATE_KEY.');
  }

  return admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

function safeUser(data: Record<string, unknown>, id: string) {
  return {
    id,
    username: String(data.username || id).trim(),
    username_lower: normalizeUsername(data.username || id),
    role: String(data.role || 'siswa'),
    nama: String(data.nama || ''),
    status: String(data.status || 'active'),
    kelas_id: String(data.kelas_id || data.kelas || ''),
    kelas_nama: String(data.kelas_nama || data.kelas || ''),
    kelas: String(data.kelas || data.kelas_nama || data.kelas_id || ''),
    nis: String(data.nis || ''),
    nisn: String(data.nisn || ''),
    previous_usernames: Array.isArray(data.previous_usernames) ? data.previous_usernames.map((item) => String(item)) : [],
  };
}

async function requireIdToken(req: Request): Promise<admin.auth.DecodedIdToken | null> {
  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) return null;
  try {
    return await getAdminApp().auth().verifyIdToken(authorization.slice(7));
  } catch {
    return null;
  }
}

function isAdmin(token: admin.auth.DecodedIdToken | null): boolean {
  return token?.role === 'admin';
}

function isQuotaExceeded(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && Number(error.code) === 8;
}

router.get('/users', async (req: Request, res: Response) => {
  const token = await requireIdToken(req);
  if (!isAdmin(token)) {
    res.status(401).json({ error: 'Akses admin diperlukan.' });
    return;
  }

  try {
    let query: FirebaseFirestore.Query = getAdminApp().firestore().collection('users');
    const role = String(req.query.role || '').trim();
    const kelas = String(req.query.kelas || '').trim();
    if (role) query = query.where('role', '==', role);
    if (kelas) query = query.where('kelas_id', '==', kelas);
    const snapshot = await query.get();
    const users = snapshot.docs.map((doc) => safeUser((doc.data() || {}) as Record<string, unknown>, doc.id));
    res.status(200).json({ users });
  } catch (error) {
    console.error('Load users error:', error);
    if (isQuotaExceeded(error)) {
      res.status(503).json({ error: 'Kuota database Firebase sedang habis. Coba kembali setelah kuota tersedia.' });
      return;
    }
    res.status(500).json({ error: 'Data user tidak dapat dimuat.' });
  }
});

router.get('/contacts', async (req: Request, res: Response) => {
  const token = await requireIdToken(req);
  if (!token) {
    res.status(401).json({ error: 'Sesi tidak valid.' });
    return;
  }

  try {
    const snapshot = await getAdminApp().firestore().collection('users').get();
    const users = snapshot.docs.map((doc) => safeUser((doc.data() || {}) as Record<string, unknown>, doc.id));
    res.status(200).json({ users });
  } catch (error) {
    console.error('Load contacts error:', error);
    res.status(500).json({ error: 'Kontak tidak dapat dimuat.' });
  }
});

router.post('/account', async (req: Request, res: Response) => {
  const token = await requireIdToken(req);
  if (!token) {
    res.status(401).json({ error: 'Sesi tidak valid.' });
    return;
  }
  const password = normalizePassword(req.body?.password);
  if (password.length < 6 || password.length > 200) {
    res.status(400).json({ error: 'Password harus 6-200 karakter.' });
    return;
  }

  try {
    await getAdminApp().firestore().collection('users').doc(token.uid).set({
      password_hash: await bcrypt.hash(password, 12),
      updated_at: new Date().toISOString(),
    }, { merge: true });
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Password tidak dapat diperbarui.' });
  }
});

router.post('/users', async (req: Request, res: Response) => {
  const token = await requireIdToken(req);
  if (!isAdmin(token)) {
    res.status(401).json({ error: 'Akses admin diperlukan.' });
    return;
  }

  const username = normalizeUsername(req.body?.username);
  const password = normalizePassword(req.body?.password);
  if (!usernamePattern.test(username)) {
    res.status(400).json({ error: 'Username tidak valid.' });
    return;
  }
  if (password && (password.length < 6 || password.length > 200)) {
    res.status(400).json({ error: 'Password harus 6-200 karakter.' });
    return;
  }

  try {
    const firestore = getAdminApp().firestore();
    const existingUsername = normalizeUsername(req.body?.existing_username);
    const accountId = existingUsername || username;
    const ref = firestore.collection('users').doc(accountId);
    const initialSnapshot = await ref.get();
    if (!existingUsername && initialSnapshot.exists) {
      res.status(409).json({ error: 'Username sudah digunakan oleh akun lain.' });
      return;
    }
    const initialData = initialSnapshot.exists ? (initialSnapshot.data() || {}) as Record<string, unknown> : {};
    const oldUsername = normalizeUsername(initialData.username || accountId);
    const usernameMatches = await firestore.collection('users').where('username_lower', '==', username).get();
    if (usernameMatches.docs.some((doc) => doc.id !== accountId)) {
      res.status(409).json({ error: 'Username sudah digunakan oleh akun lain.' });
      return;
    }
    const passwordHash = password ? await bcrypt.hash(password, 12) : '';
    let payload: Record<string, unknown> = {};
    await firestore.runTransaction(async (transaction) => {
      const usernameRef = firestore.collection('usernames').doc(username);
      const [latestSnapshot, usernameSnapshot] = await Promise.all([
        transaction.get(ref),
        transaction.get(usernameRef),
      ]);
      if (!existingUsername && latestSnapshot.exists) throw new Error('Username sudah digunakan oleh akun lain.');
      const latestData = latestSnapshot.exists ? (latestSnapshot.data() || {}) as Record<string, unknown> : {};
      if (usernameSnapshot.exists && usernameSnapshot.data()?.account_id !== accountId) {
        throw new Error('Username sudah digunakan oleh akun lain.');
      }
      payload = {
        ...latestData,
        username,
        username_lower: username,
        nama: String(req.body?.nama || latestData.nama || ''),
        role: String(req.body?.role || latestData.role || 'siswa'),
        status: String(req.body?.status || latestData.status || 'active'),
        kelas_id: String(req.body?.kelas_id ?? latestData.kelas_id ?? ''),
        kelas_nama: String(req.body?.kelas_nama ?? latestData.kelas_nama ?? ''),
        tahun_ajaran_id: String(req.body?.tahun_ajaran_id || latestData.tahun_ajaran_id || ''),
        semester_id: String(req.body?.semester_id || latestData.semester_id || ''),
        updated_at: new Date().toISOString(),
      };
      if (oldUsername !== username || accountId !== username) {
        payload.previous_usernames = Array.from(new Set([
          ...(Array.isArray(latestData.previous_usernames) ? latestData.previous_usernames : []),
          oldUsername,
          accountId,
        ].map((item) => normalizeUsername(item)).filter((item) => item && item !== username)));
      }
      delete payload.password;
      delete payload.password_hash;
      if (passwordHash) payload.password_hash = passwordHash;
      else if (typeof latestData.password_hash === 'string') payload.password_hash = latestData.password_hash;
      else if (typeof latestData.password === 'string') payload.password_hash = await bcrypt.hash(latestData.password, 12);
      else throw new Error('Password wajib diisi untuk akun baru.');
      transaction.set(ref, payload, { merge: true });
      transaction.set(usernameRef, { account_id: accountId, username, updated_at: new Date().toISOString() });
      if (oldUsername && oldUsername !== username) {
        transaction.set(firestore.collection('usernames').doc(oldUsername), {
          account_id: accountId,
          username: oldUsername,
          reserved: true,
          updated_at: new Date().toISOString(),
        });
      }
    });
    res.status(200).json({ user: safeUser(payload, accountId) });
  } catch (error) {
    console.error('Save user error:', error);
    res.status(500).json({ error: 'Data user tidak dapat disimpan.' });
  }
});

router.delete('/users', async (req: Request, res: Response) => {
  const token = await requireIdToken(req);
  if (!isAdmin(token)) {
    res.status(401).json({ error: 'Akses admin diperlukan.' });
    return;
  }
  const username = normalizeUsername(req.query.username);
  if (!username) {
    res.status(400).json({ error: 'Username wajib diisi.' });
    return;
  }
  try {
    await getAdminApp().firestore().collection('users').doc(username).delete();
    res.status(204).end();
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Data user tidak dapat dihapus.' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const username = normalizeUsername(req.body?.username);
  const password = normalizePassword(req.body?.password);
  if (!usernamePattern.test(username) || !password || password.length > 200) {
    res.status(401).json({ error: 'Username atau password salah.' });
    return;
  }

  try {
    const firestore = getAdminApp().firestore();
    let userSnapshot: admin.firestore.DocumentSnapshot | undefined = await firestore.collection('users').doc(username).get();
    if (userSnapshot.exists && normalizeUsername(userSnapshot.data()?.username || userSnapshot.id) !== username) {
      userSnapshot = undefined;
    }

    // Supports old records whose document ID differs from the username.
    if (!userSnapshot?.exists) {
      const query = await firestore.collection('users').where('username_lower', '==', username).limit(1).get();
      userSnapshot = query.docs[0] || (await firestore.collection('users').where('username', '==', username).limit(1).get()).docs[0];
    }

    if (!userSnapshot?.exists) {
      res.status(401).json({ error: 'Username atau password salah.' });
      return;
    }

    const data = (userSnapshot.data() || {}) as Record<string, unknown>;
    if (data.status && data.status !== 'active') {
      res.status(401).json({ error: 'Akun tidak aktif.' });
      return;
    }

    const passwordHash = typeof data.password_hash === 'string' ? data.password_hash : '';
    const valid = passwordHash
      ? await bcrypt.compare(password, passwordHash)
      : data.password === password;
    if (!valid) {
      res.status(401).json({ error: 'Username atau password salah.' });
      return;
    }

    const ref = firestore.collection('users').doc(userSnapshot.id);
    if (!passwordHash && data.password) {
      await ref.update({
        password_hash: await bcrypt.hash(password, 12),
        password: admin.firestore.FieldValue.delete(),
        updated_at: new Date().toISOString(),
      });
    }

    const user = safeUser(data, userSnapshot.id);
    const token = await getAdminApp().auth().createCustomToken(user.id, {
      role: user.role,
      username: user.username,
    });
    res.status(200).json({ token, user });
  } catch (error) {
    console.error('Login error:', error);
    if (isQuotaExceeded(error)) {
      res.status(503).json({ error: 'Kuota database Firebase sedang habis. Coba kembali setelah kuota tersedia.' });
      return;
    }
    res.status(500).json({ error: 'Server autentikasi belum dikonfigurasi.' });
  }
});

export const authRouter = router;
